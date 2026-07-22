package com.komo.controller;

import com.komo.dto.response.ApiResponse;
import com.komo.entity.DailyRecommendation;
import com.komo.security.SecurityContext;
import com.komo.service.DailyRecommendationService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/recommendations")
@RequiredArgsConstructor
public class DailyRecommendationController {

    private static final Logger log = LoggerFactory.getLogger(DailyRecommendationController.class);

    private final DailyRecommendationService recommendationService;

    /** 获取今日推荐问题 */
    @GetMapping("/today")
    public ResponseEntity<ApiResponse<DailyRecommendation>> getToday() {
        UUID userId = SecurityContext.getCurrentUserId();
        DailyRecommendation rec = recommendationService.getTodayRecommendation(userId);
        if (rec == null) {
            return ResponseEntity.ok(ApiResponse.success(null));
        }
        return ResponseEntity.ok(ApiResponse.success(rec));
    }

    /** 手动触发生成推荐 */
    @PostMapping("/generate")
    public ResponseEntity<ApiResponse<DailyRecommendation>> generate() {
        UUID userId = SecurityContext.getCurrentUserId();
        try {
            DailyRecommendation rec = recommendationService.generateTodayRecommendation(userId);
            return ResponseEntity.ok(ApiResponse.success(rec));
        } catch (Exception e) {
            log.error("[daily-rec] 生成推荐失败 userId={}", userId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(500, "推荐生成失败，请稍后重试"));
        }
    }

    /** 关闭一条推荐 */
    @PutMapping("/{id}/dismiss")
    public ResponseEntity<ApiResponse<Void>> dismiss(@PathVariable UUID id) {
        UUID userId = SecurityContext.getCurrentUserId();
        try {
            recommendationService.dismiss(id, userId);
            return ResponseEntity.ok(ApiResponse.success(null));
        } catch (Exception e) {
            log.error("[daily-rec] 关闭推荐失败 id={}", id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(500, "操作失败，请稍后重试"));
        }
    }

    /** 标记已对话 */
    @PutMapping("/{id}/converse")
    public ResponseEntity<ApiResponse<Void>> converse(@PathVariable UUID id) {
        UUID userId = SecurityContext.getCurrentUserId();
        try {
            recommendationService.markConversed(id, userId);
            return ResponseEntity.ok(ApiResponse.success(null));
        } catch (Exception e) {
            log.error("[daily-rec] 标记对话失败 id={}", id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(500, "操作失败，请稍后重试"));
        }
    }
}
