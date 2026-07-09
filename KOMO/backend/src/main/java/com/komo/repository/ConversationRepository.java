package com.komo.repository;

import com.komo.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {
    List<Conversation> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);
    List<Conversation> findAllByUserIdAndKnowledgeBaseIdOrderByUpdatedAtDesc(UUID userId, UUID knowledgeBaseId);
    Optional<Conversation> findByIdAndUserId(UUID id, UUID userId);
}
