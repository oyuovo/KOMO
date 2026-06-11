package com.komo.service;

import com.komo.entity.KnowledgeDraft;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeDraftRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.security.SecurityContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 知识草稿服务。
 * 管理 AI 提取的知识草稿的生命周期：查看、确认、编辑、驳回。
 * 安全约束：所有操作校验 draft.userId == currentUserId。
 */
@Service
@RequiredArgsConstructor
public class KnowledgeDraftService {

    private final KnowledgeDraftRepository draftRepository;
    private final KnowledgeRepository knowledgeRepository;

    /** 获取当前用户的待处理草稿列表 */
    public List<KnowledgeDraft> listPending() {
        UUID userId = SecurityContext.getCurrentUserId();
        return draftRepository.findByUserIdOrderByCreatedAtDesc(userId)
            .stream()
            .filter(d -> d.getStatus() == KnowledgeDraft.DraftStatus.PENDING)
            .toList();
    }

    /** 获取所有草稿（含已处理的） */
    public List<KnowledgeDraft> listAll() {
        return draftRepository.findByUserIdOrderByCreatedAtDesc(
            SecurityContext.getCurrentUserId());
    }

    /** 确认草稿 — 直接转为知识条目 */
    @Transactional
    public KnowledgeEntry confirm(UUID draftId) {
        KnowledgeDraft draft = findOwnDraft(draftId);

        if (draft.getStatus() != KnowledgeDraft.DraftStatus.PENDING) {
            throw new BusinessException(ErrorCode.DRAFT_ALREADY_PROCESSED, "该草稿已处理");
        }

        KnowledgeEntry entry = KnowledgeEntry.builder()
            .userId(draft.getUserId())
            .title(draft.getTitle())
            .content(draft.getContent())
            .contentPlain(stripMarkdown(draft.getContent()))
            .source(KnowledgeEntry.KnowledgeSource.AI_EXTRACT)
            .entryType(KnowledgeEntry.KnowledgeType.FACT)
            .build();
        entry = knowledgeRepository.save(entry);

        draft.setStatus(KnowledgeDraft.DraftStatus.CONFIRMED);
        draft.setConfirmedEntryId(entry.getId());
        draft.setProcessedAt(LocalDateTime.now());
        draftRepository.save(draft);

        return entry;
    }

    /** 编辑草稿内容后确认入库 */
    @Transactional
    public KnowledgeEntry editAndConfirm(UUID draftId, String title, String content) {
        KnowledgeDraft draft = findOwnDraft(draftId);

        if (draft.getStatus() != KnowledgeDraft.DraftStatus.PENDING) {
            throw new BusinessException(ErrorCode.DRAFT_ALREADY_PROCESSED, "该草稿已处理");
        }

        KnowledgeEntry entry = KnowledgeEntry.builder()
            .userId(draft.getUserId())
            .title(title != null ? title : draft.getTitle())
            .content(content != null ? content : draft.getContent())
            .contentPlain(stripMarkdown(content != null ? content : draft.getContent()))
            .source(KnowledgeEntry.KnowledgeSource.AI_EXTRACT)
            .entryType(KnowledgeEntry.KnowledgeType.FACT)
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
    @Transactional
    public void reject(UUID draftId) {
        KnowledgeDraft draft = findOwnDraft(draftId);

        if (draft.getStatus() != KnowledgeDraft.DraftStatus.PENDING) {
            throw new BusinessException(ErrorCode.DRAFT_ALREADY_PROCESSED, "该草稿已处理");
        }

        draft.setStatus(KnowledgeDraft.DraftStatus.REJECTED);
        draft.setProcessedAt(LocalDateTime.now());
        draftRepository.save(draft);
    }

    /** 批量确认 */
    @Transactional
    public int batchConfirm(List<UUID> draftIds) {
        int count = 0;
        for (UUID id : draftIds) {
            try {
                confirm(id);
                count++;
            } catch (Exception e) {
                // 跳过已处理或无权访问的
            }
        }
        return count;
    }

    /** 批量驳回 */
    @Transactional
    public int batchReject(List<UUID> draftIds) {
        int count = 0;
        for (UUID id : draftIds) {
            try {
                reject(id);
                count++;
            } catch (Exception e) {
                // skip
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
