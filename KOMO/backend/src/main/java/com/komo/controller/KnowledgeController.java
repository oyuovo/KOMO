package com.komo.controller;

import com.komo.dto.BatchDeleteResult;
import com.komo.dto.request.KnowledgeCreateRequest;
import com.komo.dto.request.KnowledgeUpdateRequest;
import com.komo.dto.response.ApiResponse;
import com.komo.dto.response.KnowledgeResponse;
import com.komo.dto.response.PageResponse;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeLink;
import com.komo.service.KnowledgeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/knowledge")
@RequiredArgsConstructor
public class KnowledgeController {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeController.class);

    private final KnowledgeService knowledgeService;

    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<KnowledgeResponse>>> list(
        @RequestParam(required = false) UUID category,
        @RequestParam(required = false, name = "kb") UUID knowledgeBaseId,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(
            ApiResponse.success(knowledgeService.list(category, knowledgeBaseId, q, page, size))
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<KnowledgeResponse>> get(@PathVariable UUID id) {
        KnowledgeEntry entry = knowledgeService.getById(id);
        return ResponseEntity.ok(ApiResponse.success(KnowledgeResponse.from(entry)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<KnowledgeResponse>> create(
        @Valid @RequestBody KnowledgeCreateRequest request
    ) {
        KnowledgeEntry entry = knowledgeService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(KnowledgeResponse.from(entry)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<KnowledgeResponse>> update(
        @PathVariable UUID id,
        @Valid @RequestBody KnowledgeUpdateRequest request
    ) {
        KnowledgeEntry entry = knowledgeService.update(id, request);
        return ResponseEntity.ok(ApiResponse.success(KnowledgeResponse.from(entry)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable UUID id) {
        knowledgeService.softDelete(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** 批量软删除知识条目 */
    @DeleteMapping("/batch")
    public ResponseEntity<ApiResponse<BatchDeleteResult>> batchDelete(@RequestBody Map<String, List<String>> body) {
        List<UUID> ids = body.get("ids").stream()
            .map(UUID::fromString)
            .toList();
        BatchDeleteResult result = knowledgeService.batchSoftDelete(ids);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/{id}/links")
    public ResponseEntity<ApiResponse<List<KnowledgeLink>>> getLinks(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(knowledgeService.getLinks(id)));
    }

    @PostMapping("/{id}/links")
    public ResponseEntity<ApiResponse<KnowledgeLink>> addLink(
        @PathVariable UUID id,
        @RequestBody Map<String, String> body
    ) {
        UUID targetId = UUID.fromString(body.get("targetEntryId"));
        String relation = body.getOrDefault("relation", "RELATED");
        KnowledgeLink link = knowledgeService.addLink(id, targetId, relation);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(link));
    }

    @GetMapping("/export")
    public ResponseEntity<ApiResponse<List<KnowledgeResponse>>> exportAll() {
        java.util.UUID userId = com.komo.security.SecurityContext.getCurrentUserId();
        List<KnowledgeResponse> items = knowledgeService.exportAll().stream()
            .map(KnowledgeResponse::from)
            .toList();
        log.info("[AUDIT] action=EXPORT_DATA userId={} count={}", userId, items.size());
        return ResponseEntity.ok(ApiResponse.success(items));
    }

    /** 将知识条目嵌入到目标文章（创建关联 + 移入目标文章的知识库） */
    @PostMapping("/{id}/embed/{targetId}")
    public ResponseEntity<ApiResponse<KnowledgeLink>> embedInto(
        @PathVariable UUID id,
        @PathVariable UUID targetId
    ) {
        KnowledgeLink link = knowledgeService.embedInto(id, targetId);
        return ResponseEntity.ok(ApiResponse.success(link));
    }

    /** 将碎片内容合并进目标文章（内容级合并 + 删除碎片 + 创建关联） */
    @PostMapping("/{id}/merge/{targetId}")
    public ResponseEntity<ApiResponse<KnowledgeResponse>> mergeInto(
        @PathVariable UUID id,
        @PathVariable UUID targetId
    ) {
        KnowledgeEntry merged = knowledgeService.mergeInto(id, targetId);
        return ResponseEntity.ok(ApiResponse.success(KnowledgeResponse.from(merged)));
    }

    /** 手动重建 ES 索引（从 DB 全量回填） */
    @PostMapping("/reindex")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reindexAll() {
        int count = knowledgeService.reindexAll();
        return ResponseEntity.ok(ApiResponse.success(Map.of(
            "indexed", count,
            "message", "ES 索引已从数据库全量重建"
        )));
    }
}
