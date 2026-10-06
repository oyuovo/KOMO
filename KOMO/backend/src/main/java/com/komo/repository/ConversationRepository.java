package com.komo.repository;

import com.komo.entity.Conversation;
import com.komo.entity.Conversation.ConversationType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    /**
     * 普通对话列表（排除 READING 类型阅读问答）。
     * type 为 NULL 的历史行视为 CHAT。
     */
    @Query("SELECT c FROM Conversation c WHERE c.userId = :userId "
         + "AND (c.type IS NULL OR c.type = :chatType) ORDER BY c.updatedAt DESC")
    List<Conversation> findChatsByUserId(@Param("userId") UUID userId,
                                         @Param("chatType") ConversationType chatType,
                                         Pageable pageable);

    /** 指定知识库下的普通对话列表（排除 READING，历史 NULL 行视为 CHAT）。 */
    @Query("SELECT c FROM Conversation c WHERE c.userId = :userId AND c.knowledgeBaseId = :kbId "
         + "AND (c.type IS NULL OR c.type = :chatType) ORDER BY c.updatedAt DESC")
    List<Conversation> findChatsByUserIdAndKnowledgeBaseId(@Param("userId") UUID userId,
                                                           @Param("kbId") UUID kbId,
                                                           @Param("chatType") ConversationType chatType,
                                                           Pageable pageable);

    Optional<Conversation> findByIdAndUserId(UUID id, UUID userId);

    /** 查找文章最近的 READING 对话（每篇文章一个侧边栏问答会话） */
    Optional<Conversation> findFirstByUserIdAndArticleIdAndTypeOrderByUpdatedAtDesc(
        UUID userId, UUID articleId, ConversationType type);
}
