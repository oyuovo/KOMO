package com.komo.exception;

/**
 * 访问拒绝异常 — 用于水平越权防护。
 * 当请求资源的 owner 与当前用户不匹配时抛出。
 */
public class AccessDeniedException extends BusinessException {
    public AccessDeniedException() {
        super(ErrorCode.FORBIDDEN);
    }

    public AccessDeniedException(String detail) {
        super(ErrorCode.FORBIDDEN, detail);
    }
}
