package com.komo.repository;

import com.komo.entity.KnowledgeDraft;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface KnowledgeDraftRepository extends JpaRepository<KnowledgeDraft, UUID> {

    /** 按用户和状态分页查询草稿 */
    Page<KnowledgeDraft> findByUserIdAndStatusOrderByCreatedAtDesc(
        UUID userId, KnowledgeDraft.DraftStatus status, Pageable pageable);

    /** 按用户查询所有草稿 */
    List<KnowledgeDraft> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** 查询指定对话的草稿（用于避免重复提取） */
    List<KnowledgeDraft> findByConversationIdAndUserId(UUID conversationId, UUID userId);

    /** RabbitMQ 可能重复投递，按来源消息和用户判断是否已生成草稿 */
    boolean existsByMessageIdAndUserId(UUID messageId, UUID userId);

    /** 安全查询：必须校验 userId */
    List<KnowledgeDraft> findByIdInAndUserId(List<UUID> ids, UUID userId);

    /** 删除对话关联的所有草稿 */
    void deleteByConversationId(UUID conversationId);
}
