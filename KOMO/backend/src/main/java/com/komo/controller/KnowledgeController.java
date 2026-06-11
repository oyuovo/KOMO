package com.komo.controller;

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

@RestController
@RequestMapping("/api/knowledge")
@RequiredArgsConstructor
public class KnowledgeController {

    private final KnowledgeService knowledgeService;

    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<KnowledgeResponse>>> list(
        @RequestParam(required = false) UUID category,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(
            ApiResponse.success(knowledgeService.list(category, q, page, size))
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

    @DeleteMapping("/{id}/links/{linkId}")
    public ResponseEntity<ApiResponse<Void>> removeLink(
        @PathVariable UUID id,
        @PathVariable UUID linkId
    ) {
        knowledgeService.removeLink(id, linkId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @GetMapping("/export")
    public ResponseEntity<ApiResponse<List<KnowledgeResponse>>> exportAll() {
        List<KnowledgeResponse> items = knowledgeService.exportAll().stream()
            .map(KnowledgeResponse::from)
            .toList();
        return ResponseEntity.ok(ApiResponse.success(items));
    }
}
