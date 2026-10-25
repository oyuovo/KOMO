package com.komo.repository;

import com.komo.entity.KnowledgeDraft;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KnowledgeDraftRepository extends JpaRepository<KnowledgeDraft, UUID> {

    /** 按用户查询草稿（带上限，供列表展示） */
    List<KnowledgeDraft> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** 按用户 + 状态查询草稿（数据库侧过滤，替代内存 filter） */
    List<KnowledgeDraft> findByUserIdAndStatusOrderByCreatedAtDesc(UUID userId, KnowledgeDraft.DraftStatus status);

    /** 安全查询：带归属校验的单条查询 */
    Optional<KnowledgeDraft> findByIdAndUserId(UUID id, UUID userId);

    /** 状态转换前锁住本用户草稿，确认与驳回均须在同一事务内持锁至提交。 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM KnowledgeDraft d WHERE d.id = :id AND d.userId = :userId")
    Optional<KnowledgeDraft> findByIdAndUserIdForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);

    /** 查询指定对话的草稿（用于避免重复提取） */
    List<KnowledgeDraft> findByConversationIdAndUserId(UUID conversationId, UUID userId);

    /** RabbitMQ 可能重复投递，按来源消息和用户判断是否已生成草稿 */
    boolean existsByMessageIdAndUserId(UUID messageId, UUID userId);

    /** 删除对话关联的所有草稿 */
    void deleteByConversationId(UUID conversationId);
}
