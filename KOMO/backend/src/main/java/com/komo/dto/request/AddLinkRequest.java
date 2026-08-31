package com.komo.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/** 创建知识关联请求。relation 缺省为 RELATED。 */
@Data
public class AddLinkRequest {

    @NotNull(message = "targetEntryId 不能为空")
    private UUID targetEntryId;

    private String relation = "RELATED";
}
