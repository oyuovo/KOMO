package com.komo.dto.request;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DraftEditRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void rejectsBlankTitleAndContent() {
        DraftEditRequest request = new DraftEditRequest();
        request.setTitle(" ");
        request.setContent("");

        assertFalse(validator.validate(request).isEmpty());
    }

    @Test
    void acceptsBoundedTitleAndContent() {
        DraftEditRequest request = new DraftEditRequest();
        request.setTitle("title");
        request.setContent("content");

        assertTrue(validator.validate(request).isEmpty());
    }
}
