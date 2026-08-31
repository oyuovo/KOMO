package com.komo.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 发送对话消息请求。 */
@Data
public class MessageSendRequest {

    @NotBlank(message = "消息内容不能为空")
    @Size(max = 20000, message = "消息内容不能超过 20000 字")
    private String content;
}
