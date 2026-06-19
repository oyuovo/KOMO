package com.komo.entity;

import jakarta.persistence.Table;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class KnowledgeBaseMappingTest {

    @Test
    void userKnowledgeBaseTypeIsNotGloballyUniquePerUser() {
        Table table = KnowledgeBase.class.getAnnotation(Table.class);

        assertEquals(0, table.uniqueConstraints().length);
    }
}
