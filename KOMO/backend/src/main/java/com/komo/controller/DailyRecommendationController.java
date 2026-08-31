package com.komo.controller;

import com.komo.dto.response.ApiResponse;
import com.komo.entity.DailyRecommendation;
import com.komo.security.SecurityContext;
import com.komo.service.DailyRecommendationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * 每日一问控制器。
 * 异常统一交给 GlobalExceptionHandler：BusinessException 映射到 404/400 等语义状态码，
 * 未知异常返回 500，无需控制器层 catch。
 */
@RestController
@RequestMapping("/api/recommendations")
@RequiredArgsConstructor
public class DailyRecommendationController {

    private final DailyRecommendationService recommendationService;

    /** 获取今日推荐问题 */
    @GetMapping("/today")
    public ResponseEntity<ApiResponse<DailyRecommendation>> getToday() {
        UUID userId = SecurityContext.getCurrentUserId();
        DailyRecommendation rec = recommendationService.getTodayRecommendation(userId);
        return ResponseEntity.ok(ApiResponse.success(rec));
    }

    /** 手动触发生成推荐（默认幂等：今日已有则直接返回；?force=true 强制重新生成） */
    @PostMapping("/generate")
    public ResponseEntity<ApiResponse<DailyRecommendation>> generate(
        @RequestParam(name = "force", defaultValue = "false") boolean force
    ) {
        UUID userId = SecurityContext.getCurrentUserId();
        DailyRecommendation rec = recommendationService.generateTodayRecommendation(userId, force);
        return ResponseEntity.ok(ApiResponse.success(rec));
    }

    /** 关闭一条推荐（永久标记，影响后续话题推荐） */
    @PutMapping("/{id}/dismiss")
    public ResponseEntity<ApiResponse<Void>> dismiss(@PathVariable UUID id) {
        UUID userId = SecurityContext.getCurrentUserId();
        recommendationService.dismiss(id, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** 标记已对话 */
    @PutMapping("/{id}/converse")
    public ResponseEntity<ApiResponse<Void>> converse(@PathVariable UUID id) {
        UUID userId = SecurityContext.getCurrentUserId();
        recommendationService.markConversed(id, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
