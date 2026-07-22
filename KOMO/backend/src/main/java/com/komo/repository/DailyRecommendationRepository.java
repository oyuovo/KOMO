package com.komo.repository;

import com.komo.entity.DailyRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DailyRecommendationRepository extends JpaRepository<DailyRecommendation, UUID> {

    /** 查询用户今天是否有活跃的推荐 */
    Optional<DailyRecommendation> findByUserIdAndStatusAndCreatedAtAfter(
        UUID userId, String status, LocalDateTime since
    );

    /** 查询用户最近的活跃推荐 */
    List<DailyRecommendation> findByUserIdAndStatusOrderByCreatedAtDesc(
        UUID userId, String status
    );

    /** 将用户所有旧推荐标记为已处理（每日刷新时用） */
    List<DailyRecommendation> findByUserIdAndStatus(UUID userId, String status);
}
