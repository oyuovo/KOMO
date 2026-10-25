package com.komo.service;

import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeLink;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * [[wiki 链接]] 解析服务。
 *
 * 解析文章 content 中的 [[标题]] 引用，按标题解析目标文章并建立 RELATED 关联。
 * 按目标文章增量同步：保留已有关系，仅删除失效 RELATED、补建缺失关系。
 * 只操作 RELATED 类型，不影响 SUPPLEMENTS 等系统创建的关联（嵌入/合并/草稿确认）。
 *
 * 目标标题解析规则：
 *   - 优先同一知识库内精确匹配（忽略大小写），多命中取创建时间最早；
 *   - 同 KB 无命中再查用户全库；
 *   - 无命中保持纯文本不建链；不建自链。
 * 目标文章后续重命名导致 [[旧标题]] 失效：V1 接受失效，下次编辑保存时自然重建。
 */
@Service
@RequiredArgsConstructor
public class WikiLinkService {

    private static final Logger log = LoggerFactory.getLogger(WikiLinkService.class);

    /** 匹配 [[标题]]，标题内不允许再含中括号（排除 markdown 链接 [[a]](b) 等歧义场景） */
    private static final Pattern WIKI_LINK = Pattern.compile("\\[\\[([^\\[\\]]+)\\]\\]");

    private final KnowledgeRepository knowledgeRepository;
    private final KnowledgeLinkRepository knowledgeLinkRepository;

    /** 解析正文引用并同步链接；与调用方的正文/草稿写入共用事务。 */
    @Transactional
    public void syncLinks(UUID userId, UUID entryId) {
        KnowledgeEntry entry = knowledgeRepository.findByIdAndUserId(entryId, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.KNOWLEDGE_NOT_FOUND, "知识条目不存在"));

        // 1. 收集去重后的引用标题（大小写不敏感去重，保留首个原样写法）
        List<String> titles = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        String content = entry.getContent() != null ? entry.getContent() : "";
        Matcher matcher = WIKI_LINK.matcher(content);
        while (matcher.find()) {
            String title = matcher.group(1).trim();
            if (!title.isEmpty() && seen.add(title.toLowerCase(Locale.ROOT))) {
                titles.add(title);
            }
        }

        // 2. 先解析目标并按 ID 去重，同一文章只能保留一条出链。
        Set<UUID> desiredTargets = new LinkedHashSet<>();
        for (String title : titles) {
            UUID targetId = resolveTarget(userId, entry, title);
            if (targetId == null) {
                log.debug("[wikilink] 未命中目标文章，保持纯文本: \"{}\" entryId={}", title, entryId);
                continue;
            }
            desiredTargets.add(targetId);
        }

        List<KnowledgeLink> existing = knowledgeLinkRepository.findAllBySourceEntryIdAndUserId(entryId, userId);
        List<KnowledgeLink> obsolete = existing.stream()
            .filter(link -> link.getRelation() == KnowledgeLink.RelationType.RELATED
                && !desiredTargets.contains(link.getTargetEntryId()))
            .toList();
        if (!obsolete.isEmpty()) knowledgeLinkRepository.deleteAllInBatch(obsolete);

        // 3. 已有 SUPPLEMENTS 等关联也可供 Wiki 跳转使用，不覆盖其类型或重复插入。
        Set<UUID> linkedTargets = new HashSet<>();
        existing.forEach(link -> linkedTargets.add(link.getTargetEntryId()));
        int created = 0;
        for (UUID targetId : desiredTargets) {
            if (!linkedTargets.add(targetId)) continue;
            knowledgeLinkRepository.save(KnowledgeLink.builder()
                .sourceEntryId(entryId)
                .targetEntryId(targetId)
                .relation(KnowledgeLink.RelationType.RELATED)
                .build());
            created++;
        }

        if (created > 0 || !obsolete.isEmpty()) {
            log.info("[wikilink] 同步完成 entryId={} removed={} created={}", entryId, obsolete.size(), created);
        }
    }

    /** 文章软删除时清理其 RELATED 链接（出链 + 入链）。系统关联保持原行为。 */
    @Transactional
    public void deleteRelatedLinks(UUID entryId) {
        knowledgeLinkRepository.deleteBySourceEntryIdAndRelation(entryId, KnowledgeLink.RelationType.RELATED);
        knowledgeLinkRepository.deleteByTargetEntryIdAndRelation(entryId, KnowledgeLink.RelationType.RELATED);
    }

    /** 标题解析：同 KB 优先 → 用户全库兜底；多命中取创建最早；不建自链。 */
    private UUID resolveTarget(UUID userId, KnowledgeEntry source, String title) {
        List<KnowledgeEntry> candidates = knowledgeRepository
            .findAllByUserIdAndTitleIgnoreCaseAndDeletedAtIsNull(userId, title).stream()
            .filter(e -> !e.getId().equals(source.getId()))
            .toList();

        if (candidates.isEmpty()) {
            return null;
        }

        UUID sourceKb = source.getKnowledgeBaseId();
        List<KnowledgeEntry> sameKb = candidates.stream()
            .filter(e -> Objects.equals(e.getKnowledgeBaseId(), sourceKb))
            .toList();

        List<KnowledgeEntry> pool = !sameKb.isEmpty() ? sameKb : candidates;
        return pool.stream()
            .min(Comparator.comparing(KnowledgeEntry::getCreatedAt))
            .map(KnowledgeEntry::getId)
            .orElse(null);
    }
}
