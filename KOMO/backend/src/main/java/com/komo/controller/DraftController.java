package com.komo.controller;

import com.komo.dto.response.ApiResponse;
import com.komo.entity.KnowledgeDraft;
import com.komo.entity.KnowledgeEntry;
import com.komo.service.KnowledgeDraftService;
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

@RestController
@RequestMapping("/api/drafts")
@RequiredArgsConstructor
public class DraftController {

    private final KnowledgeDraftService draftService;

    /** 获取待处理的草稿列表 */
    @GetMapping
    public ResponseEntity<ApiResponse<List<KnowledgeDraft>>> list() {
        try {
            List<KnowledgeDraft> drafts = draftService.listPending();
            return ResponseEntity.ok(ApiResponse.success(drafts));
        } catch (Exception e) {
            // 临时：打印错误细节以便调试
            e.printStackTrace();
            throw e;
        }
    }

    /** 确认草稿 → 转为知识条目。可选 knowledgeBaseId 和 parentEntryId。 */
    @PostMapping("/{id}/confirm")
    public ResponseEntity<ApiResponse<KnowledgeEntry>> confirm(
        @PathVariable UUID id,
        @RequestBody(required = false) Map<String, String> body
    ) {
        UUID overrideKbId = null;
        UUID parentEntryId = null;
        if (body != null) {
            if (body.containsKey("knowledgeBaseId")) {
                overrideKbId = UUID.fromString(body.get("knowledgeBaseId"));
            }
            if (body.containsKey("parentEntryId")) {
                parentEntryId = UUID.fromString(body.get("parentEntryId"));
            }
        }
        KnowledgeEntry entry = draftService.confirmWithParent(id, overrideKbId, parentEntryId);
        return ResponseEntity.ok(ApiResponse.success(entry));
    }

    /** 编辑草稿并确认。可选 knowledgeBaseId 覆盖默认去向。 */
    @PostMapping("/{id}/edit")
    public ResponseEntity<ApiResponse<KnowledgeEntry>> editAndConfirm(
        @PathVariable UUID id,
        @RequestBody Map<String, String> body
    ) {
        UUID overrideKbId = null;
        if (body != null && body.containsKey("knowledgeBaseId")) {
            overrideKbId = UUID.fromString(body.get("knowledgeBaseId"));
        }
        KnowledgeEntry entry = draftService.editAndConfirm(
            id,
            body != null ? body.get("title") : null,
            body != null ? body.get("content") : null,
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
        @RequestBody Map<String, List<UUID>> body
    ) {
        List<UUID> ids = body.getOrDefault("ids", List.of());
        int count = draftService.batchConfirm(ids);
        return ResponseEntity.ok(ApiResponse.success(Map.of("confirmed", count)));
    }

    /** 批量驳回 */
    @PostMapping("/batch-reject")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> batchReject(
        @RequestBody Map<String, List<UUID>> body
    ) {
        List<UUID> ids = body.getOrDefault("ids", List.of());
        int count = draftService.batchReject(ids);
        return ResponseEntity.ok(ApiResponse.success(Map.of("rejected", count)));
    }
}
