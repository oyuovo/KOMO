package com.komo.dto.request;

import java.util.UUID;

/** 仅修改分类；null 表示移入“无分类”，不接受标题、正文或标签。 */
public record KnowledgeCategoryRequest(UUID categoryId) {}
