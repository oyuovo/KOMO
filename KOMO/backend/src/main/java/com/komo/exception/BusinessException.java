package com.komo.exception;

import lombok.Getter;

/**
 * 业务异常，携带 ErrorCode 和可选详细描述。
 * 由 GlobalExceptionHandler 统一处理为 ApiResponse 格式。
 */
@Getter
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public BusinessException(ErrorCode errorCode, String detail) {
        super(detail);
        this.errorCode = errorCode;
    }
}
