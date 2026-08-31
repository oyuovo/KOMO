package com.komo.controller;

import com.komo.dto.request.KnowledgeBaseRequest;
import com.komo.dto.response.ApiResponse;
import com.komo.entity.KnowledgeBase;
import com.komo.service.KnowledgeBaseService;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/knowledge-bases")
@RequiredArgsConstructor
public class KnowledgeBaseController {

    private final KnowledgeBaseService knowledgeBaseService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<KnowledgeBase>>> list() {
        return ResponseEntity.ok(ApiResponse.success(knowledgeBaseService.listForUser()));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<KnowledgeBase>> create(@Valid @RequestBody KnowledgeBaseRequest body) {
        KnowledgeBase kb = knowledgeBaseService.create(body.getName().trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(kb));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<KnowledgeBase>> rename(
        @PathVariable UUID id,
        @Valid @RequestBody KnowledgeBaseRequest body
    ) {
        return ResponseEntity.ok(ApiResponse.success(knowledgeBaseService.rename(id, body.getName().trim())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable UUID id) {
        knowledgeBaseService.delete(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
