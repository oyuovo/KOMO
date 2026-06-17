package com.komo.controller;

import com.komo.dto.response.ApiResponse;
import com.komo.entity.KnowledgeBase;
import com.komo.service.KnowledgeBaseService;
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
import java.util.Map;
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
    public ResponseEntity<ApiResponse<KnowledgeBase>> create(@RequestBody Map<String, String> body) {
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "知识库名称不能为空"));
        }
        KnowledgeBase kb = knowledgeBaseService.create(name.trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(kb));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<KnowledgeBase>> rename(
        @PathVariable UUID id,
        @RequestBody Map<String, String> body
    ) {
        String name = body.get("name");
        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "名称不能为空"));
        }
        return ResponseEntity.ok(ApiResponse.success(knowledgeBaseService.rename(id, name.trim())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable UUID id) {
        knowledgeBaseService.delete(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
