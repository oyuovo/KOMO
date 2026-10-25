package com.komo.repository;

import com.komo.entity.Conversation;
import com.komo.entity.Conversation.ConversationType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    /**
     * 普通对话及已解除知识库归属的阅读历史。文章内的活跃阅读会话不在此重复展示。
     * type 为 NULL 的历史行视为 CHAT。
     */
    @Query("SELECT c FROM Conversation c WHERE c.userId = :userId "
         + "AND (c.type IS NULL OR c.type = :chatType OR c.knowledgeBaseId IS NULL) ORDER BY c.updatedAt DESC")
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

    boolean existsByKnowledgeBaseIdAndUserId(UUID knowledgeBaseId, UUID userId);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE Conversation c SET c.knowledgeBaseId = :knowledgeBaseId WHERE c.userId = :userId "
         + "AND c.articleId = :articleId AND c.type = :readingType")
    int syncReadingBaseByArticleIdAndUserId(@Param("articleId") UUID articleId, @Param("userId") UUID userId,
                                           @Param("knowledgeBaseId") UUID knowledgeBaseId, @Param("readingType") ConversationType readingType);

    /** 清理历史失配归属，保留会话及消息；普通会话不受影响。 */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE Conversation c SET c.knowledgeBaseId = NULL WHERE c.userId = :userId "
         + "AND c.knowledgeBaseId = :knowledgeBaseId AND c.type = :readingType "
         + "AND NOT EXISTS (SELECT k.id FROM KnowledgeEntry k WHERE k.id = c.articleId AND k.userId = :userId "
         + "AND k.deletedAt IS NULL AND k.knowledgeBaseId = :knowledgeBaseId)")
    int detachStaleReadingByKnowledgeBaseIdAndUserId(@Param("knowledgeBaseId") UUID knowledgeBaseId,
                                                    @Param("userId") UUID userId, @Param("readingType") ConversationType readingType);

    /** 查找文章最近的 READING 对话（每篇文章一个侧边栏问答会话） */
    Optional<Conversation> findFirstByUserIdAndArticleIdAndTypeOrderByUpdatedAtDesc(
        UUID userId, UUID articleId, ConversationType type);
}
