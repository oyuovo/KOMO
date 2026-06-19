package com.komo.service;

import com.komo.entity.KnowledgeBase;
import com.komo.repository.KnowledgeBaseRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KnowledgeBaseServiceTest {

    @Test
    void createsMissingSystemBasesWhenUserBaseAlreadyExists() {
        UUID userId = UUID.randomUUID();
        KnowledgeBase userBase = KnowledgeBase.builder()
            .userId(userId)
            .name("工作")
            .type(KnowledgeBase.KnowledgeBaseType.USER)
            .isDeletable(true)
            .build();
        KnowledgeBaseRepository repository = mock(KnowledgeBaseRepository.class);
        when(repository.findAllByUserIdOrderBySortOrderAscCreatedAtAsc(userId))
            .thenReturn(List.of(userBase));
        when(repository.saveAndFlush(org.mockito.ArgumentMatchers.any(KnowledgeBase.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        KnowledgeBaseService service = new KnowledgeBaseService(repository);

        service.ensureSystemBases(userId);

        verify(repository).acquireSystemBaseLock(userId);
        ArgumentCaptor<KnowledgeBase> captor = ArgumentCaptor.forClass(KnowledgeBase.class);
        verify(repository, atLeastOnce()).saveAndFlush(captor.capture());
        assertEquals(
            List.of(KnowledgeBase.KnowledgeBaseType.DEFAULT,
                    KnowledgeBase.KnowledgeBaseType.SYSTEM_FRAGMENTS),
            captor.getAllValues().stream().map(KnowledgeBase::getType).toList());
    }
}
