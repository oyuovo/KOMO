package com.komo.config;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LegacySchemaCleanupTest {

    @Test
    void removesOnlyLegacyUserAndTypeUniqueConstraint() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.eq(String.class)))
            .thenReturn(List.of("ukhj0u26svjd93cmc86x2niv9d0"));
        LegacySchemaCleanup cleanup = new LegacySchemaCleanup(jdbcTemplate);

        cleanup.run();

        verify(jdbcTemplate).execute(
            "ALTER TABLE knowledge_bases DROP CONSTRAINT \"ukhj0u26svjd93cmc86x2niv9d0\"");
    }
}
