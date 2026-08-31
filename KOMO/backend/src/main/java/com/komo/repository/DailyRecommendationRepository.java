package com.komo.repository;

import com.komo.entity.DailyRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DailyRecommendationRepository extends JpaRepository<DailyRecommendation, UUID> {

    /**
     * 查询用户今天最新的活跃推荐。
     * 用 findTop1 而非单结果查询：历史并发可能产生同日多条 ACTIVE，
     * 单结果查询遇到重复会抛 NonUniqueResultException 导致 500。
     */
    Optional<DailyRecommendation> findTopByUserIdAndStatusAndCreatedAtAfterOrderByCreatedAtDesc(
        UUID userId, String status, LocalDateTime since
    );

    /** 查询用户最近的活跃推荐 */
    List<DailyRecommendation> findByUserIdAndStatusOrderByCreatedAtDesc(
        UUID userId, String status
    );

    /** 将用户所有旧推荐标记为已处理（每日刷新时用） */
    List<DailyRecommendation> findByUserIdAndStatus(UUID userId, String status);

    /** 安全查询：带归属校验的单条查询 */
    Optional<DailyRecommendation> findByIdAndUserId(UUID id, UUID userId);
}
