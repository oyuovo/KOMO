package com.komo.service;

import com.komo.dto.BatchDeleteResult;
import com.komo.dto.request.KnowledgeCreateRequest;
import com.komo.dto.request.KnowledgeUpdateRequest;
import com.komo.dto.response.KnowledgeLinkResponse;
import com.komo.dto.response.KnowledgeResponse;
import com.komo.dto.response.PageResponse;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeEntry.KnowledgeSource;
import com.komo.entity.KnowledgeLink;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.CategoryRepository;
import com.komo.repository.ConversationRepository;
import com.komo.entity.Conversation.ConversationType;
import com.komo.security.SecurityContext;
import com.komo.util.MarkdownUtils;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 知识条目服务。
 * 继承 BaseService 获得归属校验，提供 CRUD、软删除、关联、导出功能。
 */
@Service
public class KnowledgeService extends BaseService<KnowledgeEntry, KnowledgeRepository> {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeService.class);

    private final KnowledgeLinkRepository knowledgeLinkRepository;
    private final KnowledgeRetrievalService indexService;
    private final KnowledgeBaseService knowledgeBaseService;
    private final WikiLinkService wikiLinkService;
    private final TransactionTemplate transactionTemplate;
    private final CategoryRepository categoryRepository;
    private final ConversationRepository conversations;

    public KnowledgeService(KnowledgeRepository repository,
                            KnowledgeLinkRepository knowledgeLinkRepository,
                            KnowledgeRetrievalService indexService,
                            KnowledgeBaseService knowledgeBaseService,
                            WikiLinkService wikiLinkService,
                            TransactionTemplate transactionTemplate,
                            CategoryRepository categoryRepository, ConversationRepository conversations) {
        super(repository);
        this.knowledgeLinkRepository = knowledgeLinkRepository;
        this.indexService = indexService;
        this.knowledgeBaseService = knowledgeBaseService;
        this.wikiLinkService = wikiLinkService;
        this.transactionTemplate = transactionTemplate;
        this.categoryRepository = categoryRepository;
        this.conversations = conversations;
    }

    @Override
    protected UUID getOwnerId(KnowledgeEntry entity) {
        return entity.getUserId();
    }

    /** 分页列表，支持分类、知识库、关键词过滤 */
    public PageResponse<KnowledgeResponse> list(UUID categoryId, UUID knowledgeBaseId, String query, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<KnowledgeEntry> result = repository.findByUserIdAndFilters(
            getCurrentUserId(), categoryId, knowledgeBaseId, query, pageable
        );
        List<KnowledgeResponse> items = result.getContent().stream()
            .map(KnowledgeResponse::from)
            .toList();
        return PageResponse.of(result, items);
    }

    /** 查看单条详情（含归属校验；软删条目视为不存在，与列表/搜索行为一致） */
    public KnowledgeEntry getById(UUID id) {
        KnowledgeEntry entry = findByIdOrThrow(id);
        if (entry.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.KNOWLEDGE_NOT_FOUND, "知识条目不存在");
        }
        return entry;
    }

    public KnowledgeEntry create(KnowledgeCreateRequest request) {
        UUID kbId = request.getKnowledgeBaseId() != null
            ? request.getKnowledgeBaseId()
            : knowledgeBaseService.getDefaultBase(getCurrentUserId()).getId();

        return transactionTemplate.execute(status -> {
            knowledgeBaseService.lockForReference(kbId, getCurrentUserId());
            validateCategory(request.getCategoryId(), kbId);
            KnowledgeEntry entry = repository.save(
                KnowledgeEntry.builder()
                    .userId(getCurrentUserId())
                    .title(request.getTitle())
                    .content(request.getContent())
                    .contentPlain(MarkdownUtils.stripMarkdown(request.getContent()))
                    .source(KnowledgeSource.MANUAL)
                    .entryType(request.getEntryType() != null
                        ? request.getEntryType() : KnowledgeEntry.KnowledgeType.FACT)
                    .knowledgeBaseId(kbId)
                    .categoryId(request.getCategoryId())
                    .tagNames(request.getTags())
                    .build());
            wikiLinkService.syncLinks(entry.getUserId(), entry.getId());
            return entry;
        });
    }

    public KnowledgeEntry update(UUID id, KnowledgeUpdateRequest request) {
        return transactionTemplate.execute(status -> {
            KnowledgeEntry current = getById(id);
            if (request.getVersion() == null || !request.getVersion().equals(current.getVersion())) {
                throw new BusinessException(ErrorCode.CONFLICT,
                    "文章已被修改，请先保留当前编辑内容，再重新加载最新文章进行核对");
            }
            UUID targetKbId = request.getKnowledgeBaseId() != null
                ? request.getKnowledgeBaseId() : current.getKnowledgeBaseId();
            if (request.getKnowledgeBaseId() != null) {
                knowledgeBaseService.lockForReference(targetKbId, getCurrentUserId());
            }
            validateCategory(request.getCategoryId(), targetKbId);
            current.setKnowledgeBaseId(targetKbId);
            current.setTitle(request.getTitle());
            current.setContent(request.getContent());
            current.setContentPlain(MarkdownUtils.stripMarkdown(request.getContent()));
            if (request.getEntryType() != null) current.setEntryType(request.getEntryType());
            current.setCategoryId(request.getCategoryId());
            // 编辑页没有标签控件：未提交时保留，显式空字符串才清空。
            if (request.getTags() != null) current.setTagNames(request.getTags());
            KnowledgeEntry saved = repository.save(current);
            conversations.syncReadingBaseByArticleIdAndUserId(id, getCurrentUserId(), targetKbId, ConversationType.READING);
            wikiLinkService.syncLinks(saved.getUserId(), saved.getId());
            return saved;
        });
    }

    /** 分类移动只改分类，始终保留数据库中的最新正文及元数据。 */
    public KnowledgeEntry moveToCategory(UUID id, UUID categoryId) {
        return transactionTemplate.execute(status -> {
            KnowledgeEntry current = getById(id);
            validateCategory(categoryId, current.getKnowledgeBaseId());
            current.setCategoryId(categoryId);
            return repository.save(current);
        });
    }

    private void validateCategory(UUID categoryId, UUID knowledgeBaseId) {
        if (categoryId == null) return;
        var category = categoryRepository.findByIdAndUserIdForUpdate(categoryId, getCurrentUserId())
            .orElseThrow(() -> new BusinessException(ErrorCode.CATEGORY_NOT_FOUND));
        if (!Objects.equals(category.getKnowledgeBaseId(), knowledgeBaseId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "分类不属于文章所在知识库");
        }
    }

    public void softDelete(UUID id) {
        KnowledgeEntry entry = transactionTemplate.execute(status -> {
            KnowledgeEntry current = findByIdOrThrow(id);
            current.setDeletedAt(LocalDateTime.now());
            KnowledgeEntry saved = repository.save(current);
            conversations.syncReadingBaseByArticleIdAndUserId(id, getCurrentUserId(), null, ConversationType.READING);
            wikiLinkService.deleteRelatedLinks(id);
            return saved;
        });
        log.info("[AUDIT] action=DELETE_KNOWLEDGE userId={} entryId={} title={}",
            entry.getUserId(), id, entry.getTitle());
    }

    /** 批量软删除。逐条处理，单条失败不影响其他。返回成功/失败计数。 */
    public BatchDeleteResult batchSoftDelete(List<UUID> ids) {
        int deleted = 0;
        int failed = 0;
        for (UUID id : ids) {
            try {
                softDelete(id);
                deleted++;
            } catch (Exception e) {
                failed++;
                log.warn("[batchDelete] 删除知识 {} 失败", id, e);
            }
        }
        return new BatchDeleteResult(deleted, failed, ids.size());
    }

    @Transactional
    public KnowledgeLink addLink(UUID entryId, UUID targetEntryId, String relation) {
        // 验证两端均属于当前用户
        KnowledgeEntry source = findByIdOrThrow(entryId);
        KnowledgeEntry target = repository.findByIdAndUserId(targetEntryId, getCurrentUserId())
            .orElseThrow(() -> new BusinessException(ErrorCode.KNOWLEDGE_NOT_FOUND, "关联目标知识条目不存在"));

        if (knowledgeLinkRepository.existsBySourceEntryIdAndTargetEntryId(entryId, targetEntryId)) {
            throw new BusinessException(ErrorCode.CONFLICT, "该关联已存在");
        }

        KnowledgeLink link = KnowledgeLink.builder()
            .sourceEntryId(entryId)
            .targetEntryId(targetEntryId)
            .relation(KnowledgeLink.RelationType.valueOf(relation.toUpperCase()))
            .build();

        return knowledgeLinkRepository.save(link);
    }

    /** 获取某条目的所有关联（含两端标题，前端据 sourceEntryId 判断出链/入链方向） */
    public List<KnowledgeLinkResponse> getLinks(UUID entryId) {
        findByIdOrThrow(entryId); // 验证归属
        List<KnowledgeLink> links = knowledgeLinkRepository.findAllByEntryId(entryId);
        if (links.isEmpty()) {
            return List.of();
        }

        // 批量拉取两端标题（含软删条目标题，与原有 footer 展示行为一致）
        Set<UUID> entryIds = new HashSet<>();
        for (KnowledgeLink link : links) {
            entryIds.add(link.getSourceEntryId());
            entryIds.add(link.getTargetEntryId());
        }
        Map<UUID, String> titles = new HashMap<>();
        for (KnowledgeEntry e : repository.findAllByIdsAndUserId(entryIds.stream().toList(), getCurrentUserId())) {
            titles.put(e.getId(), e.getTitle());
        }

        return links.stream()
            .map(l -> KnowledgeLinkResponse.from(l,
                titles.get(l.getSourceEntryId()), titles.get(l.getTargetEntryId())))
            .toList();
    }

    /** 导出当前用户全部知识 */
    public List<KnowledgeEntry> exportAll() {
        return repository.findAllByUserIdAndDeletedAtIsNull(getCurrentUserId());
    }

    /** 将知识条目嵌入到目标文章：创建关联 + 移入目标文章的知识库 */
    @Transactional
    public KnowledgeLink embedInto(UUID entryId, UUID targetEntryId) {
        KnowledgeEntry entry = findByIdOrThrow(entryId);
        KnowledgeEntry target = repository.findByIdAndUserId(targetEntryId, getCurrentUserId())
            .orElseThrow(() -> new BusinessException(ErrorCode.KNOWLEDGE_NOT_FOUND, "目标文章不存在"));

        // 不能嵌入到自己
        if (entryId.equals(targetEntryId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "不能嵌入到自身");
        }

        if (target.getKnowledgeBaseId() != null) {
            knowledgeBaseService.lockForReference(target.getKnowledgeBaseId(), getCurrentUserId());
        }

        // 检查关联是否已存在
        if (knowledgeLinkRepository.existsBySourceEntryIdAndTargetEntryId(entryId, targetEntryId)) {
            throw new BusinessException(ErrorCode.CONFLICT, "该文章已嵌入到此目标");
        }

        // 创建关联
        KnowledgeLink link = KnowledgeLink.builder()
            .sourceEntryId(entryId)
            .targetEntryId(targetEntryId)
            .relation(KnowledgeLink.RelationType.SUPPLEMENTS)
            .build();
        link = knowledgeLinkRepository.save(link);

        // 将碎片移入目标文章的知识库
        if (target.getKnowledgeBaseId() != null) {
            if (!Objects.equals(entry.getKnowledgeBaseId(), target.getKnowledgeBaseId())) entry.setCategoryId(null);
            entry.setKnowledgeBaseId(target.getKnowledgeBaseId());
            repository.save(entry);
            conversations.syncReadingBaseByArticleIdAndUserId(entryId, getCurrentUserId(), target.getKnowledgeBaseId(), ConversationType.READING);
        }

        return link;
    }

    /** 将碎片内容合并到目标文章内。匹配最佳 ## section 插入，否则追加末尾。 */
    public KnowledgeEntry mergeInto(UUID fragmentId, UUID targetId) {
        KnowledgeEntry merged = null;
        for (int retry = 0; retry < 3; retry++) {
            try {
                merged = transactionTemplate.execute(status -> {
                    KnowledgeEntry saved = doMergeInto(fragmentId, targetId);
                    wikiLinkService.syncLinks(saved.getUserId(), saved.getId());
                    return saved;
                });
                break;
            } catch (org.springframework.orm.ObjectOptimisticLockingFailureException e) {
                if (retry == 2) throw e;
                log.warn("mergeInto 乐观锁冲突，将在新事务中重试 {}", retry + 1, e);
            }
        }

        if (merged == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "合并失败，请重试");
        }

        return merged;
    }

    private KnowledgeEntry doMergeInto(UUID fragmentId, UUID targetId) {
        KnowledgeEntry fragment = findByIdOrThrow(fragmentId);
        KnowledgeEntry target = findByIdOrThrow(targetId);

        if (fragmentId.equals(targetId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "不能合并到自身");
        }

        String fragmentTitle = fragment.getTitle();
        String fragmentContent = fragment.getContent();
        String targetContent = target.getContent();

        // 找到最佳插入位置
        String mergedContent = insertAtBestSection(targetContent, fragmentTitle, fragmentContent);

        target.setContent(mergedContent);
        target.setContentPlain(MarkdownUtils.stripMarkdown(mergedContent));
        target = repository.save(target);

        // 创建关联记录
        KnowledgeLink link = KnowledgeLink.builder()
            .sourceEntryId(fragmentId)
            .targetEntryId(targetId)
            .relation(KnowledgeLink.RelationType.SUPPLEMENTS)
            .build();
        knowledgeLinkRepository.save(link);

        // 软删除碎片（内容已合并进目标文章）
        fragment.setDeletedAt(LocalDateTime.now());
        repository.save(fragment);
        conversations.syncReadingBaseByArticleIdAndUserId(fragmentId, getCurrentUserId(), null, ConversationType.READING);

        return target;
    }

    /**
     * 在目标文章 markdown 中找到与碎片标题最匹配的 ## section，插入其后；
     * 无匹配则追加到文章末尾。
     */
    private String insertAtBestSection(String targetContent, String fragmentTitle, String fragmentContent) {
        // 解析所有 ## 标题及其位置
        Pattern headingPattern = Pattern.compile("(?m)^## (.+)$");
        Matcher matcher = headingPattern.matcher(targetContent);
        List<int[]> sections = new ArrayList<>(); // [start, end, heading_text]
        List<String> headings = new ArrayList<>();

        int lastStart = -1;
        String lastHeading = null;
        while (matcher.find()) {
            if (lastStart >= 0) {
                sections.add(new int[]{lastStart, matcher.start()});
                headings.add(lastHeading);
            }
            lastStart = matcher.start();
            lastHeading = matcher.group(1);
        }
        // 最后一个 section 到末尾
        if (lastStart >= 0) {
            sections.add(new int[]{lastStart, targetContent.length()});
            headings.add(lastHeading);
        }

        // 匹配最佳 section
        int bestIdx = -1;
        double bestScore = 0;
        String normalizedFragment = normalizeForMatch(fragmentTitle);

        for (int i = 0; i < headings.size(); i++) {
            double score = computeTitleOverlap(normalizedFragment, normalizeForMatch(headings.get(i)));
            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }

        // 构建合并后内容
        String insertBlock = "\n\n### " + fragmentTitle + "\n\n" + fragmentContent;

        if (bestIdx >= 0 && bestScore > 0.25) {
            // 插入到匹配 section 之后
            int insertPos = sections.get(bestIdx)[1];
            return targetContent.substring(0, insertPos) + insertBlock + "\n" + targetContent.substring(insertPos);
        } else {
            // 追加到末尾
            return targetContent + insertBlock;
        }
    }

    /** 归一化文本用于匹配 */
    private String normalizeForMatch(String s) {
        if (s == null) return "";
        return s.toLowerCase()
            .replaceAll("[\\s，,、。；：！？…—\\-()\\[\\]【】\"'「」『』]+", "");
    }

    /** 两个归一化字符串的关键词重叠度 */
    private double computeTitleOverlap(String a, String b) {
        if (a.isEmpty() || b.isEmpty()) return 0;
        if (a.equals(b)) return 1.0;
        if (a.contains(b) || b.contains(a)) return 0.8;

        // 字符级 Jaccard
        java.util.Set<Character> setA = new java.util.HashSet<>();
        java.util.Set<Character> setB = new java.util.HashSet<>();
        for (char c : a.toCharArray()) setA.add(c);
        for (char c : b.toCharArray()) setB.add(c);

        java.util.Set<Character> intersection = new java.util.HashSet<>(setA);
        intersection.retainAll(setB);
        java.util.Set<Character> union = new java.util.HashSet<>(setA);
        union.addAll(setB);

        return union.isEmpty() ? 0 : (double) intersection.size() / union.size();
    }

    /** 补建当前版本并清理本用户的旧检索片段。 */
    public int reindexAll() {
        UUID userId = SecurityContext.getCurrentUserId();
        return indexService.reindexUser(userId);
    }
}
