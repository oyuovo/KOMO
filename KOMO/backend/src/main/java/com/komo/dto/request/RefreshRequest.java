package com.komo.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 刷新令牌请求体 — 原生 App（无 Cookie 环境）通过 body 携带 refresh token。
 * Web 端仍走 httpOnly Cookie，body 可为空。
 */
@Data
public class RefreshRequest {

    @NotBlank(message = "refreshToken 不能为空")
    @Size(max = 2000, message = "refreshToken 长度超出限制")
    private String refreshToken;
}
