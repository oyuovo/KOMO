package com.komo.service;

import com.komo.dto.BatchDeleteResult;
import com.komo.dto.request.KnowledgeCreateRequest;
import com.komo.dto.request.KnowledgeUpdateRequest;
import com.komo.dto.response.KnowledgeResponse;
import com.komo.dto.response.PageResponse;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeEntry.KnowledgeSource;
import com.komo.entity.KnowledgeLink;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
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
import java.util.List;
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
    private final KnowledgeIndexService indexService;
    private final KnowledgeBaseService knowledgeBaseService;
    private final TransactionTemplate transactionTemplate;

    public KnowledgeService(KnowledgeRepository repository,
                            KnowledgeLinkRepository knowledgeLinkRepository,
                            KnowledgeIndexService indexService,
                            KnowledgeBaseService knowledgeBaseService,
                            TransactionTemplate transactionTemplate) {
        super(repository);
        this.knowledgeLinkRepository = knowledgeLinkRepository;
        this.indexService = indexService;
        this.knowledgeBaseService = knowledgeBaseService;
        this.transactionTemplate = transactionTemplate;
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

    /** 查看单条详情（含归属校验） */
    public KnowledgeEntry getById(UUID id) {
        return findByIdOrThrow(id);
    }

    public KnowledgeEntry create(KnowledgeCreateRequest request) {
        UUID kbId = request.getKnowledgeBaseId() != null
            ? request.getKnowledgeBaseId()
            : knowledgeBaseService.getDefaultBase(getCurrentUserId()).getId();

        KnowledgeEntry entry = transactionTemplate.execute(status -> repository.save(
            KnowledgeEntry.builder()
                .userId(getCurrentUserId())
                .title(request.getTitle())
                .content(request.getContent())
                .contentPlain(stripMarkdown(request.getContent()))
                .source(KnowledgeSource.MANUAL)
                .entryType(request.getEntryType() != null
                    ? request.getEntryType() : KnowledgeEntry.KnowledgeType.FACT)
                .knowledgeBaseId(kbId)
                .categoryId(request.getCategoryId())
                .tagNames(request.getTags())
                .build()));
        indexService.indexEntry(entry.getId(), entry.getUserId(), entry.getKnowledgeBaseId(),
            entry.getTitle(), entry.getContentPlain(), entry.getContent());
        return entry;
    }

    public KnowledgeEntry update(UUID id, KnowledgeUpdateRequest request) {
        KnowledgeEntry entry = transactionTemplate.execute(status -> {
            KnowledgeEntry current = findByIdOrThrow(id);
            current.setTitle(request.getTitle());
            current.setContent(request.getContent());
            current.setContentPlain(stripMarkdown(request.getContent()));
            current.setEntryType(request.getEntryType());
            current.setCategoryId(request.getCategoryId());
            current.setTagNames(request.getTags());
            return repository.save(current);
        });
        indexService.updateEntry(entry.getId(), entry.getUserId(), entry.getKnowledgeBaseId(),
            entry.getTitle(), entry.getContentPlain(), entry.getContent());
        return entry;
    }

    public void softDelete(UUID id) {
        KnowledgeEntry entry = transactionTemplate.execute(status -> {
            KnowledgeEntry current = findByIdOrThrow(id);
            current.setDeletedAt(LocalDateTime.now());
            return repository.save(current);
        });
        indexService.deleteEntry(id);
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

    /** 获取某条目的所有关联 */
    public List<KnowledgeLink> getLinks(UUID entryId) {
        findByIdOrThrow(entryId); // 验证归属
        return knowledgeLinkRepository.findAllByEntryId(entryId);
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
            entry.setKnowledgeBaseId(target.getKnowledgeBaseId());
            repository.save(entry);
        }

        return link;
    }

    /** 将碎片内容合并到目标文章内。匹配最佳 ## section 插入，否则追加末尾。 */
    public KnowledgeEntry mergeInto(UUID fragmentId, UUID targetId) {
        KnowledgeEntry merged = null;
        for (int retry = 0; retry < 3; retry++) {
            try {
                merged = transactionTemplate.execute(status -> doMergeInto(fragmentId, targetId));
                break;
            } catch (org.springframework.orm.ObjectOptimisticLockingFailureException e) {
                if (retry == 2) throw e;
                log.warn("mergeInto 乐观锁冲突，将在新事务中重试 {}", retry + 1, e);
            }
        }

        if (merged == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "合并失败，请重试");
        }

        // 外部 ES 调用必须发生在数据库事务提交之后。
        indexService.updateEntry(
            merged.getId(), merged.getUserId(), merged.getKnowledgeBaseId(),
            merged.getTitle(), merged.getContentPlain(), merged.getContent());
        indexService.deleteEntry(fragmentId);
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
        target.setContentPlain(stripMarkdown(mergedContent));
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

    /** 手动重建 ES 索引：从 DB 全量回填当前用户未删除条目。返回索引条数。 */
    public int reindexAll() {
        UUID userId = SecurityContext.getCurrentUserId();
        List<KnowledgeEntry> allActive = repository.findAllByUserIdAndDeletedAtIsNull(userId);
        return indexService.reindexAll(allActive);
    }

    /**
     * 简易 Markdown 清洗：移除格式标记，保留纯文本。
     * Phase 2 由 Python AI 服务提供更精确的清洗。
     */
    private String stripMarkdown(String markdown) {
        if (markdown == null) {
            return "";
        }
        return markdown
            .replaceAll("#{1,6}\\s", "")
            .replaceAll("[*_~`>]", "")
            .replaceAll("\\[([^]]+)]\\([^)]+\\)", "$1")
            .replaceAll("!\\[[^]]*]\\([^)]+\\)", "")
            .replaceAll("```[\\s\\S]*?```", "")
            .replaceAll("\\s+", " ")
            .trim();
    }
}
