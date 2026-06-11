package com.komo.exception;

import lombok.Getter;

/**
 * 统一错误码枚举。
 * 通用错误码使用 HTTP 状态码，
 * 业务错误码从 10001 开始分段。
 */
@Getter
public enum ErrorCode {
    SUCCESS(0, "success"),
    BAD_REQUEST(400, "请求参数错误"),
    UNAUTHORIZED(401, "未登录或 token 已过期"),
    FORBIDDEN(403, "无权访问"),
    NOT_FOUND(404, "资源不存在"),
    CONFLICT(409, "资源冲突"),
    TOO_MANY_REQUESTS(429, "请求过于频繁"),
    INTERNAL_ERROR(500, "服务内部错误"),

    // 业务错误码 (10000+)
    KNOWLEDGE_NOT_FOUND(10001, "知识条目不存在"),
    CATEGORY_HAS_CHILDREN(10002, "分类下有子分类，无法删除"),
    CATEGORY_NOT_FOUND(10003, "分类不存在"),
    USER_ALREADY_EXISTS(10004, "用户已存在"),
    INVALID_CREDENTIALS(10005, "邮箱或密码错误"),
    DRAFT_ALREADY_PROCESSED(10006, "草稿已处理");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
