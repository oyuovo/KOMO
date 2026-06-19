package com.komo.service;

import com.komo.entity.Conversation;
import com.komo.entity.Message;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.ConversationRepository;
import com.komo.repository.MessageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Keeps conversation database writes in short transactions outside AI calls. */
@Service
public class ConversationPersistenceService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;

    public ConversationPersistenceService(ConversationRepository conversationRepository,
                                          MessageRepository messageRepository) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
    }

    @Transactional
    public Message saveUserMessage(UUID conversationId, UUID userId, String content) {
        findConversation(conversationId, userId);
        return messageRepository.save(Message.builder()
            .conversationId(conversationId)
            .role(Message.MessageRole.USER)
            .content(content)
            .build());
    }

    @Transactional
    public Message saveAssistantMessage(UUID conversationId, UUID userId, String content,
                                        String titleSource, boolean initialExchange) {
        Conversation conversation = findConversation(conversationId, userId);
        Message assistantMessage = messageRepository.save(Message.builder()
            .conversationId(conversationId)
            .role(Message.MessageRole.ASSISTANT)
            .content(content)
            .build());

        if (initialExchange && (conversation.getTitle() == null || "新对话".equals(conversation.getTitle()))) {
            String title = titleSource.length() > 30
                ? titleSource.substring(0, 30) + "..."
                : titleSource;
            conversation.setTitle(title);
            conversationRepository.save(conversation);
        }
        return assistantMessage;
    }

    private Conversation findConversation(UUID conversationId, UUID userId) {
        return conversationRepository.findByIdAndUserId(conversationId, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));
    }
}
