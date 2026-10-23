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
import com.komo.util.MarkdownUtils;
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
    private final KnowledgeBaseService knowledgeBaseService;
    private final KnowledgeLinkRepository knowledgeLinkRepository;
    private final WikiLinkService wikiLinkService;
    private final TransactionTemplate transactionTemplate;

    /** 判断某条 AI 消息是否已经生成过草稿，用于消息队列幂等消费。 */
    public boolean hasDraftsForMessage(UUID messageId, UUID userId) {
        return draftRepository.existsByMessageIdAndUserId(messageId, userId);
    }

    /** 获取当前用户的待处理草稿列表 */
    public List<KnowledgeDraft> listPending() {
        UUID userId = SecurityContext.getCurrentUserId();
        return draftRepository.findByUserIdAndStatusOrderByCreatedAtDesc(
            userId, KnowledgeDraft.DraftStatus.PENDING);
    }

    /** 确认草稿，未选择关联文章时独立入库。 */
    public KnowledgeEntry confirm(UUID draftId, UUID overrideKbId) {
        return confirmWithParent(draftId, overrideKbId, null);
    }

    /** 创建补充条目及关联，不修改被关联文章的正文。 */
    public KnowledgeEntry confirmWithParent(UUID draftId, UUID overrideKbId, UUID parentEntryId) {
        return persistConfirmation(draftId, null, null, overrideKbId, parentEntryId, false);
    }

    public KnowledgeEntry editAndConfirm(UUID draftId, String title, String content, UUID overrideKbId) {
        return editAndConfirm(draftId, title, content, overrideKbId, null);
    }

    /** 编辑后确认与普通确认采用相同的目标路由和归属校验。 */
    public KnowledgeEntry editAndConfirm(UUID draftId, String title, String content,
                                         UUID overrideKbId, UUID parentEntryId) {
        return persistConfirmation(draftId, title, content, overrideKbId, parentEntryId, true);
    }

    private KnowledgeEntry persistConfirmation(UUID draftId, String title, String content,
                                                 UUID overrideKbId, UUID parentEntryId, boolean edited) {
        KnowledgeEntry entry = transactionTemplate.execute(status -> {
            KnowledgeDraft draft = findOwnDraft(draftId);
            if (draft.getStatus() != KnowledgeDraft.DraftStatus.PENDING) {
                throw new BusinessException(ErrorCode.DRAFT_ALREADY_PROCESSED, "该草稿已处理");
            }
            UUID targetKbId = resolveTargetKnowledgeBase(draft, overrideKbId, parentEntryId);
            KnowledgeEntry saved = knowledgeRepository.save(KnowledgeEntry.builder()
                .userId(draft.getUserId())
                .title(title != null ? title : draft.getTitle())
                .content(content != null ? content : draft.getContent())
                .contentPlain(MarkdownUtils.stripMarkdown(content != null ? content : draft.getContent()))
                .source(KnowledgeEntry.KnowledgeSource.AI_EXTRACT)
                .entryType(KnowledgeEntry.KnowledgeType.FACT)
                .knowledgeBaseId(targetKbId)
                .build());
            if (parentEntryId != null) {
                knowledgeLinkRepository.save(KnowledgeLink.builder()
                    .sourceEntryId(saved.getId()).targetEntryId(parentEntryId)
                    .relation(KnowledgeLink.RelationType.SUPPLEMENTS).build());
            }
            if (edited) {
                if (title != null) draft.setTitle(title);
                if (content != null) draft.setContent(content);
            }
            draft.setStatus(edited ? KnowledgeDraft.DraftStatus.EDITED : KnowledgeDraft.DraftStatus.CONFIRMED);
            draft.setConfirmedEntryId(saved.getId());
            draft.setProcessedAt(LocalDateTime.now());
            draftRepository.save(draft);
            return saved;
        });
        wikiLinkService.syncLinks(entry.getUserId(), entry.getId());
        return entry;
    }

    private UUID resolveTargetKnowledgeBase(KnowledgeDraft draft, UUID overrideKbId, UUID parentEntryId) {
        UUID targetKbId;
        if (parentEntryId != null) {
            // 即使请求同时指定知识库，也必须检查被关联文章的归属和删除状态。
            KnowledgeEntry parent = knowledgeRepository.findByIdAndUserId(parentEntryId, draft.getUserId())
                .filter(entry -> entry.getDeletedAt() == null)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "关联文章不存在或已删除"));
            targetKbId = parent.getKnowledgeBaseId();
            if (targetKbId == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "关联文章没有有效的知识库");
            }
            if (overrideKbId != null && !overrideKbId.equals(targetKbId)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "关联文章与目标知识库不一致");
            }
        } else if (overrideKbId != null) {
            targetKbId = overrideKbId;
        } else if (draft.getExtractType() == KnowledgeDraft.ExtractType.FRAGMENT) {
            targetKbId = knowledgeBaseService.getFragmentsBase(draft.getUserId()).getId();
        } else {
            targetKbId = knowledgeBaseService.getDefaultBase(draft.getUserId()).getId();
        }
        knowledgeBaseService.findByIdOrThrow(targetKbId);
        return targetKbId;
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

    /** 获取用户所有待处理草稿（全局去重，不设上限以保证去重正确性） */
    public List<KnowledgeDraft> listAllPending(UUID userId) {
        return draftRepository.findByUserIdAndStatusOrderByCreatedAtDesc(
            userId, KnowledgeDraft.DraftStatus.PENDING);
    }

    /** 删除对话关联的所有草稿 */
    @Transactional
    public void deleteByConversation(UUID conversationId) {
        draftRepository.deleteByConversationId(conversationId);
    }

    /** 安全查询：带归属校验的草稿单条查询 */
    private KnowledgeDraft findOwnDraft(UUID draftId) {
        return draftRepository.findByIdAndUserId(draftId, SecurityContext.getCurrentUserId())
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "草稿不存在"));
    }
}
