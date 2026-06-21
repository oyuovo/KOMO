package com.komo.dto.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/** 草稿批量操作请求 DTO */
@Data
public class BatchDraftRequest {

    @NotEmpty(message = "ids 不能为空")
    private List<UUID> ids;

}
