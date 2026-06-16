package com.komo.controller;

import com.komo.dto.response.ApiResponse;
import com.komo.entity.Conversation;
import com.komo.entity.Message;
import com.komo.security.SecurityContext;
import com.komo.service.ConversationService;
import jakarta.servlet.AsyncContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Conversation>>> list() {
        UUID userId = SecurityContext.getCurrentUserId();
        return ResponseEntity.ok(ApiResponse.success(conversationService.list(userId)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Conversation>> create(@RequestBody Map<String, String> body) {
        UUID userId = SecurityContext.getCurrentUserId();
        String title = body.getOrDefault("title", null);
        Conversation convo = conversationService.create(userId, title);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success(convo));
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<ApiResponse<List<Message>>> getMessages(@PathVariable UUID id) {
        UUID userId = SecurityContext.getCurrentUserId();
        return ResponseEntity.ok(ApiResponse.success(conversationService.getMessages(id, userId)));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<ApiResponse<Message>> sendMessage(
        @PathVariable UUID id,
        @RequestBody Map<String, String> body
    ) {
        UUID userId = SecurityContext.getCurrentUserId();
        String content = body.get("content");
        if (content == null || content.isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.error(400, "消息内容不能为空"));
        }
        Message reply = conversationService.sendMessage(id, userId, content);
        return ResponseEntity.ok(ApiResponse.success(reply));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable UUID id) {
        UUID userId = SecurityContext.getCurrentUserId();
        conversationService.delete(id, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** SSE 流式对话 — AsyncContext 异步处理，Tomcat NIO 正确 flush */
    @PostMapping(value = "/{id}/messages/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public void streamMessage(
        @PathVariable UUID id,
        @RequestBody Map<String, String> body,
        HttpServletRequest request,
        HttpServletResponse response
    ) throws IOException {
        UUID userId = SecurityContext.getCurrentUserId();
        String content = body.get("content");
        if (content == null || content.isBlank()) {
            response.setStatus(400);
            response.getWriter().write("{\"error\":\"消息内容不能为空\"}");
            return;
        }
        // 响应头
        response.setContentType("text/event-stream");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");

        // ★ 关键：启动异步上下文，handler 线程立即返回
        AsyncContext asyncCtx = request.startAsync();
        asyncCtx.setTimeout(180_000); // 3 分钟

        // 在虚拟线程中处理 SSE 流
        Thread.startVirtualThread(() -> {
            try {
                conversationService.streamMessage(id, userId, content, response);
            } catch (Exception e) {
                System.err.println("[SSE] Fatal: " + e.getMessage());
            } finally {
                asyncCtx.complete();
            }
        });
    }
}
