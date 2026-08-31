package com.komo.dto.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/** 批量操作 ID 列表请求（批量删除对话 / 批量删除知识共用）。 */
@Data
public class BatchIdsRequest {

    @NotEmpty(message = "ids 不能为空")
    private List<UUID> ids;
}
