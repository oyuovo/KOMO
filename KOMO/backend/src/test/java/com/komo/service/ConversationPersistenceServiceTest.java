package com.komo.service;

import com.komo.entity.Conversation;
import com.komo.entity.Message;
import com.komo.repository.ConversationRepository;
import com.komo.repository.MessageRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConversationPersistenceServiceTest {

    @Test
    void savesUserMessageOnlyAfterOwnershipCheck() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ConversationRepository conversations = mock(ConversationRepository.class);
        MessageRepository messages = mock(MessageRepository.class);
        when(conversations.findByIdAndUserId(conversationId, userId))
            .thenReturn(Optional.of(Conversation.builder().userId(userId).title("新对话").build()));
        when(messages.save(org.mockito.ArgumentMatchers.any(Message.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        ConversationPersistenceService service =
            new ConversationPersistenceService(conversations, messages);

        Message saved = service.saveUserMessage(conversationId, userId, "hello");

        assertEquals(Message.MessageRole.USER, saved.getRole());
        assertEquals("hello", saved.getContent());
        verify(conversations).findByIdAndUserId(conversationId, userId);
    }

    @Test
    void savesAssistantMessageAndInitialTitleTogether() {
        UUID conversationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Conversation conversation = Conversation.builder().userId(userId).title("新对话").build();
        ConversationRepository conversations = mock(ConversationRepository.class);
        MessageRepository messages = mock(MessageRepository.class);
        when(conversations.findByIdAndUserId(conversationId, userId))
            .thenReturn(Optional.of(conversation));
        when(messages.save(org.mockito.ArgumentMatchers.any(Message.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        ConversationPersistenceService service =
            new ConversationPersistenceService(conversations, messages);

        Message saved = service.saveAssistantMessage(
            conversationId, userId, "answer", "a title source", true);

        assertEquals(Message.MessageRole.ASSISTANT, saved.getRole());
        assertEquals("answer", saved.getContent());
        ArgumentCaptor<Conversation> captor = ArgumentCaptor.forClass(Conversation.class);
        verify(conversations).save(captor.capture());
        assertEquals("a title source", captor.getValue().getTitle());
    }
}
