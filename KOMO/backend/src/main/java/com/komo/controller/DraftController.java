package com.komo.controller;

import com.komo.dto.request.BatchDraftRequest;
import com.komo.dto.request.DraftConfirmRequest;
import com.komo.dto.request.DraftEditRequest;
import com.komo.dto.response.ApiResponse;
import com.komo.entity.KnowledgeDraft;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.service.KnowledgeDraftService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/drafts")
@RequiredArgsConstructor
public class DraftController {

    private static final Logger log = LoggerFactory.getLogger(DraftController.class);

    private final KnowledgeDraftService draftService;

    /** 获取待处理的草稿列表 */
    @GetMapping
    public ResponseEntity<ApiResponse<List<KnowledgeDraft>>> list() {
        try {
            List<KnowledgeDraft> drafts = draftService.listPending();
            return ResponseEntity.ok(ApiResponse.success(drafts));
        } catch (Exception e) {
            log.error("获取草稿列表失败", e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "获取草稿列表失败");
        }
    }

    /** 确认草稿 → 转为知识条目。可选 knowledgeBaseId 和 parentEntryId。 */
    @PostMapping("/{id}/confirm")
    public ResponseEntity<ApiResponse<KnowledgeEntry>> confirm(
        @PathVariable UUID id,
        @Valid @RequestBody(required = false) DraftConfirmRequest body
    ) {
        UUID overrideKbId = body != null ? body.getKnowledgeBaseId() : null;
        UUID parentEntryId = body != null ? body.getParentEntryId() : null;
        KnowledgeEntry entry = draftService.confirmWithParent(id, overrideKbId, parentEntryId);
        return ResponseEntity.ok(ApiResponse.success(entry));
    }

    /** 编辑草稿并确认。可选 knowledgeBaseId 覆盖默认去向。 */
    @PostMapping("/{id}/edit")
    public ResponseEntity<ApiResponse<KnowledgeEntry>> editAndConfirm(
        @PathVariable UUID id,
        @Valid @RequestBody DraftEditRequest body
    ) {
        UUID overrideKbId = body.getKnowledgeBaseId();
        KnowledgeEntry entry = draftService.editAndConfirm(
            id,
            body.getTitle(),
            body.getContent(),
            overrideKbId
        );
        return ResponseEntity.ok(ApiResponse.success(entry));
    }

    /** 驳回草稿 */
    @PostMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<Void>> reject(@PathVariable UUID id) {
        draftService.reject(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** 批量确认 */
    @PostMapping("/batch-confirm")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> batchConfirm(
        @Valid @RequestBody BatchDraftRequest body
    ) {
        int count = draftService.batchConfirm(body.getIds());
        return ResponseEntity.ok(ApiResponse.success(Map.of("confirmed", count)));
    }

    /** 批量驳回 */
    @PostMapping("/batch-reject")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> batchReject(
        @Valid @RequestBody BatchDraftRequest body
    ) {
        int count = draftService.batchReject(body.getIds());
        return ResponseEntity.ok(ApiResponse.success(Map.of("rejected", count)));
    }
}
