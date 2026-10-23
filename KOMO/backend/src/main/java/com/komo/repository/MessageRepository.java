package com.komo.repository;

import com.komo.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

import org.springframework.transaction.annotation.Transactional;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    @Query("select m from Message m, Conversation c where m.conversationId = c.id "
        + "and c.id = :conversationId and c.userId = :userId order by m.createdAt desc, m.id desc")
    List<Message> findRecentByConversationIdAndUserId(@Param("conversationId") UUID conversationId,
        @Param("userId") UUID userId, Pageable pageable);

    List<Message> findAllByConversationIdOrderByCreatedAtAsc(UUID conversationId);
    @Transactional
    void deleteByConversationId(UUID conversationId);
}
