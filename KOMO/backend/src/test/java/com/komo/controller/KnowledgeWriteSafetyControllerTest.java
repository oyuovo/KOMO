package com.komo.controller;

import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.exception.GlobalExceptionHandler;
import com.komo.service.KnowledgeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class KnowledgeWriteSafetyControllerTest {
    private final UUID id = UUID.randomUUID();
    private final KnowledgeService service = mock(KnowledgeService.class);
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new KnowledgeController(service))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void missingOrNegativeVersionFailsBeforeAnyWrite() throws Exception {
        for (String body : new String[]{"{\"title\":\"title\",\"content\":\"body\"}",
            "{\"title\":\"title\",\"content\":\"body\",\"version\":-1}"}) {
            mvc.perform(put("/api/knowledge/" + id).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test
    void staleVersionAndCommitTimeConflictBothReturn409() throws Exception {
        when(service.update(eq(id), any()))
            .thenThrow(new BusinessException(ErrorCode.CONFLICT, "文章已被修改"))
            .thenThrow(new ObjectOptimisticLockingFailureException(KnowledgeEntry.class, id));
        for (int attempt = 0; attempt < 2; attempt++) {
            mvc.perform(put("/api/knowledge/" + id).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\":\"title\",\"content\":\"body\",\"version\":0}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(409));
        }
    }

    @Test
    void categoryOnlyRequestCanClearCategoryAndReturnsCurrentVersion() throws Exception {
        KnowledgeEntry entry = KnowledgeEntry.builder().title("title").content("body").version(4L).build();
        entry.setId(id);
        when(service.moveToCategory(id, null)).thenReturn(entry);
        mvc.perform(put("/api/knowledge/" + id + "/category").contentType(MediaType.APPLICATION_JSON)
                .content("{\"categoryId\":null}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(4));
        verify(service).moveToCategory(id, null);
        verify(service, never()).update(any(), any());
    }

    @Test
    void updateBindsMigrationTargetAndRejectsMalformedUuid() throws Exception {
        UUID destination = UUID.randomUUID();
        var entry = KnowledgeEntry.builder().title("title").content("body").version(1L).knowledgeBaseId(destination).build();
        when(service.update(eq(id), any())).thenReturn(entry);
        mvc.perform(put("/api/knowledge/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"title\",\"content\":\"body\",\"version\":0,\"knowledgeBaseId\":\"" + destination + "\",\"categoryId\":null}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.knowledgeBaseId").value(destination.toString()));
        verify(service).update(eq(id), argThat(req -> destination.equals(req.getKnowledgeBaseId()) && req.getCategoryId() == null));
        clearInvocations(service);
        mvc.perform(put("/api/knowledge/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"title\",\"content\":\"body\",\"version\":0,\"knowledgeBaseId\":\"invalid\"}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
