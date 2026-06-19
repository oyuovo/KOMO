package com.komo.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/** Removes a legacy constraint that incorrectly limited users to one USER knowledge base. */
@Component
public class LegacySchemaCleanup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacySchemaCleanup.class);

    private static final String FIND_LEGACY_CONSTRAINTS = """
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = to_regclass('knowledge_bases')
          AND contype = 'u'
          AND replace(pg_get_constraintdef(oid), ' ', '') IN (
              'UNIQUE(user_id,type)',
              'UNIQUE(type,user_id)'
          )
        """;

    private final JdbcTemplate jdbcTemplate;

    public LegacySchemaCleanup(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        run();
    }

    void run() {
        List<String> constraints = jdbcTemplate.queryForList(FIND_LEGACY_CONSTRAINTS, String.class);
        for (String constraint : constraints) {
            String quotedName = constraint.replace("\"", "\"\"");
            jdbcTemplate.execute(
                "ALTER TABLE knowledge_bases DROP CONSTRAINT \"" + quotedName + "\"");
            log.warn("Removed legacy knowledge base constraint name={}", constraint);
        }
    }
}
