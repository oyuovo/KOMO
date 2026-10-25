package com.komo.repository;

import com.komo.entity.DailyRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DailyRecommendationRepository extends JpaRepository<DailyRecommendation, UUID> {

    @Modifying(flushAutomatically = true)
    @Query("UPDATE DailyRecommendation r SET r.suggestedKbId = NULL WHERE r.suggestedKbId = :knowledgeBaseId AND r.userId = :userId")
    int clearSuggestedBaseByUserId(@Param("knowledgeBaseId") UUID knowledgeBaseId, @Param("userId") UUID userId);

    /** 当天最新记录，包含已忽略和已讨论状态，避免同一天重复自动生成。 */
    Optional<DailyRecommendation> findTopByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
        UUID userId, LocalDateTime start, LocalDateTime end
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
