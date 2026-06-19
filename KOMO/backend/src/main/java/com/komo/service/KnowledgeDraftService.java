package com.komo.service;

import com.komo.entity.KnowledgeDraft;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeLink;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeDraftRepository;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 知识草稿服务。
 * 管理 AI 提取的知识草稿的生命周期：查看、确认、编辑、驳回。
 * 安全约束：所有操作校验 draft.userId == currentUserId。
 */
@Service
@RequiredArgsConstructor
public class KnowledgeDraftService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeDraftService.class);

    private final KnowledgeDraftRepository draftRepository;
    private final KnowledgeRepository knowledgeRepository;
    private final KnowledgeIndexService indexService;
    private final KnowledgeBaseService knowledgeBaseService;
    private final KnowledgeLinkRepository knowledgeLinkRepository;
    private final TransactionTemplate transactionTemplate;

    /** 判断某条 AI 消息是否已经生成过草稿，用于消息队列幂等消费。 */
    public boolean hasDraftsForMessage(UUID messageId, UUID userId) {
        return draftRepository.existsByMessageIdAndUserId(messageId, userId);
    }

    /** 获取当前用户的待处理草稿列表（排除 PENDING_DEDUP） */
    public List<KnowledgeDraft> listPending() {
        UUID userId = SecurityContext.getCurrentUserId();
        return draftRepository.findByUserIdOrderByCreatedAtDesc(userId)
            .stream()
            .filter(d -> d.getStatus() == KnowledgeDraft.DraftStatus.PENDING
                      || d.getStatus() == KnowledgeDraft.DraftStatus.PENDING_DEDUP)
            .toList();
    }

    /** 获取所有草稿（含已处理的） */
    public List<KnowledgeDraft> listAll() {
        return draftRepository.findByUserIdOrderByCreatedAtDesc(
            SecurityContext.getCurrentUserId());
    }

    /** 确认草稿 — 按提取类型路由到对应知识库，可通过 overrideKbId 覆盖，可通过 parentEntryId 嵌入 */
    public KnowledgeEntry confirm(UUID draftId, UUID overrideKbId) {
        return confirmWithParent(draftId, overrideKbId, null);
    }

    /** 确认草稿并嵌入到指定父文章 */
    public KnowledgeEntry confirmWithParent(UUID draftId, UUID overrideKbId, UUID parentEntryId) {
        KnowledgeEntry entry = transactionTemplate.execute(
            status -> doConfirmWithParent(draftId, overrideKbId, parentEntryId));
        indexService.indexEntry(
            entry.getId(), entry.getUserId(), entry.getTitle(), entry.getContentPlain());
        return entry;
    }

    private KnowledgeEntry doConfirmWithParent(UUID draftId, UUID overrideKbId, UUID parentEntryId) {
        KnowledgeDraft draft = findOwnDraft(draftId);

        if (draft.getStatus() != KnowledgeDraft.DraftStatus.PENDING) {
            throw new BusinessException(ErrorCode.DRAFT_ALREADY_PROCESSED, "该草稿已处理");
        }

        // 优先用覆盖值，否则按 extractType 决定目标知识库
        UUID targetKbId;
        if (overrideKbId != null) {
            targetKbId = overrideKbId;
        } else if (parentEntryId != null) {
            // 嵌入到父文章 → 使用父文章的知识库
            KnowledgeEntry parent = knowledgeRepository.findByIdAndUserId(parentEntryId, draft.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "目标文章不存在"));
            targetKbId = parent.getKnowledgeBaseId();
        } else {
            KnowledgeDraft.ExtractType extractType = draft.getExtractType();
            if (extractType == KnowledgeDraft.ExtractType.FRAGMENT) {
                targetKbId = knowledgeBaseService.getFragmentsBase(draft.getUserId()).getId();
            } else {
                targetKbId = knowledgeBaseService.getDefaultBase(draft.getUserId()).getId();
            }
        }

        KnowledgeEntry entry = KnowledgeEntry.builder()
            .userId(draft.getUserId())
            .title(draft.getTitle())
            .content(draft.getContent())
            .contentPlain(stripMarkdown(draft.getContent()))
            .source(KnowledgeEntry.KnowledgeSource.AI_EXTRACT)
            .entryType(KnowledgeEntry.KnowledgeType.FACT)
            .knowledgeBaseId(targetKbId)
            .build();
        entry = knowledgeRepository.save(entry);

        // 如果指定了父文章，创建知识关联
        if (parentEntryId != null) {
            KnowledgeLink link = KnowledgeLink.builder()
                .sourceEntryId(entry.getId())
                .targetEntryId(parentEntryId)
                .relation(KnowledgeLink.RelationType.SUPPLEMENTS)
                .build();
            knowledgeLinkRepository.save(link);
        }

        draft.setStatus(KnowledgeDraft.DraftStatus.CONFIRMED);
        draft.setConfirmedEntryId(entry.getId());
        draft.setProcessedAt(LocalDateTime.now());
        draftRepository.save(draft);

        return entry;
    }

    /** 编辑草稿内容后确认入库。可通过 overrideKbId 覆盖默认去向。 */
    public KnowledgeEntry editAndConfirm(UUID draftId, String title, String content, UUID overrideKbId) {
        KnowledgeEntry entry = transactionTemplate.execute(
            status -> doEditAndConfirm(draftId, title, content, overrideKbId));
        indexService.indexEntry(
            entry.getId(), entry.getUserId(), entry.getTitle(), entry.getContentPlain());
        return entry;
    }

    private KnowledgeEntry doEditAndConfirm(UUID draftId, String title, String content, UUID overrideKbId) {
        KnowledgeDraft draft = findOwnDraft(draftId);

        if (draft.getStatus() != KnowledgeDraft.DraftStatus.PENDING) {
            throw new BusinessException(ErrorCode.DRAFT_ALREADY_PROCESSED, "该草稿已处理");
        }

        // 优先用覆盖值，否则按 extractType 决定目标知识库
        UUID targetKbId;
        if (overrideKbId != null) {
            targetKbId = overrideKbId;
        } else {
            KnowledgeDraft.ExtractType extractType = draft.getExtractType();
            if (extractType == KnowledgeDraft.ExtractType.FRAGMENT) {
                targetKbId = knowledgeBaseService.getFragmentsBase(draft.getUserId()).getId();
            } else {
                targetKbId = knowledgeBaseService.getDefaultBase(draft.getUserId()).getId();
            }
        }

        KnowledgeEntry entry = KnowledgeEntry.builder()
            .userId(draft.getUserId())
            .title(title != null ? title : draft.getTitle())
            .content(content != null ? content : draft.getContent())
            .contentPlain(stripMarkdown(content != null ? content : draft.getContent()))
            .source(KnowledgeEntry.KnowledgeSource.AI_EXTRACT)
            .entryType(KnowledgeEntry.KnowledgeType.FACT)
            .knowledgeBaseId(targetKbId)
            .build();
        entry = knowledgeRepository.save(entry);

        if (title != null) draft.setTitle(title);
        if (content != null) draft.setContent(content);
        draft.setStatus(KnowledgeDraft.DraftStatus.EDITED);
        draft.setConfirmedEntryId(entry.getId());
        draft.setProcessedAt(LocalDateTime.now());
        draftRepository.save(draft);

        return entry;
    }

    /** 驳回草稿 */
    public void reject(UUID draftId) {
        transactionTemplate.executeWithoutResult(status -> doReject(draftId));
    }

    private void doReject(UUID draftId) {
        KnowledgeDraft draft = findOwnDraft(draftId);

        if (draft.getStatus() != KnowledgeDraft.DraftStatus.PENDING) {
            throw new BusinessException(ErrorCode.DRAFT_ALREADY_PROCESSED, "该草稿已处理");
        }

        draft.setStatus(KnowledgeDraft.DraftStatus.REJECTED);
        draft.setProcessedAt(LocalDateTime.now());
        draftRepository.save(draft);
    }

    /** 批量确认（使用智能默认去向） */
    public int batchConfirm(List<UUID> draftIds) {
        int count = 0;
        for (UUID id : draftIds) {
            try {
                confirm(id, null);
                count++;
            } catch (Exception e) {
                log.warn("批量确认草稿失败 id={}", id, e);
            }
        }
        return count;
    }

    /** 批量驳回 */
    public int batchReject(List<UUID> draftIds) {
        int count = 0;
        for (UUID id : draftIds) {
            try {
                reject(id);
                count++;
            } catch (Exception e) {
                log.warn("批量驳回草稿失败 id={}", id, e);
            }
        }
        return count;
    }

    /** 保存提取结果（由 ConversationService 调用） */
    @Transactional
    public List<KnowledgeDraft> saveExtractedDrafts(
        UUID userId,
        UUID conversationId,
        UUID messageId,
        List<KnowledgeDraft> drafts
    ) {
        return drafts.stream().map(d -> {
            d.setUserId(userId);
            d.setConversationId(conversationId);
            d.setMessageId(messageId);
            d.setStatus(KnowledgeDraft.DraftStatus.PENDING);
            return draftRepository.save(d);
        }).toList();
    }

    /** 查询某个对话的所有草稿（用于去重） */
    public List<KnowledgeDraft> listByConversation(UUID conversationId) {
        UUID userId = SecurityContext.getCurrentUserId();
        return draftRepository.findByConversationIdAndUserId(conversationId, userId);
    }

    /** 获取用户所有待处理草稿（全局去重） */
    public List<KnowledgeDraft> listAllPending(UUID userId) {
        return draftRepository.findByUserIdOrderByCreatedAtDesc(userId)
            .stream()
            .filter(d -> d.getStatus() == KnowledgeDraft.DraftStatus.PENDING)
            .toList();
    }

    /** 删除对话关联的所有草稿 */
    @Transactional
    public void deleteByConversation(UUID conversationId) {
        draftRepository.deleteByConversationId(conversationId);
    }

    /** 安全查询：校验草稿归属 */
    private KnowledgeDraft findOwnDraft(UUID draftId) {
        KnowledgeDraft draft = draftRepository.findById(draftId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "草稿不存在"));
        if (!draft.getUserId().equals(SecurityContext.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权访问此草稿");
        }
        return draft;
    }

    private String stripMarkdown(String markdown) {
        if (markdown == null) return "";
        return markdown
            .replaceAll("#{1,6}\\s", "")
            .replaceAll("[*_~`>]", "")
            .replaceAll("\\[([^]]+)]\\([^)]+\\)", "$1")
            .replaceAll("```[\\s\\S]*?```", "")
            .replaceAll("\\s+", " ")
            .trim();
    }
}
