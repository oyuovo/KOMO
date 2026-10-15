package com.komo.controller;

import com.komo.entity.KnowledgeEntry;
import com.komo.service.KnowledgeDraftService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DraftControllerTest {
    private final KnowledgeDraftService service = mock(KnowledgeDraftService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new DraftController(service)).build();

    @Test
    void editedConfirmationForwardsParentFromRequest() throws Exception {
        UUID draft = UUID.randomUUID();
        UUID parent = UUID.randomUUID();
        when(service.editAndConfirm(any(), any(), any(), any(), any())).thenReturn(new KnowledgeEntry());
        mvc.perform(post("/api/drafts/{id}/edit", draft).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"新标题\",\"content\":\"新正文\",\"parentEntryId\":\"" + parent + "\"}"))
            .andExpect(status().isOk());
        verify(service).editAndConfirm(draft, "新标题", "新正文", null, parent);
    }

    @Test
    void invalidEditedContentIsRejectedBeforeService() throws Exception {
        mvc.perform(post("/api/drafts/{id}/edit", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"标题\",\"content\":\"\"}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void malformedParentIdIsRejectedBeforeService() throws Exception {
        mvc.perform(post("/api/drafts/{id}/edit", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"标题\",\"content\":\"正文\",\"parentEntryId\":\"invalid\"}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
