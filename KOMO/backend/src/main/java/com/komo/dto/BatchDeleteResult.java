package com.komo.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class BatchDeleteResult {
    private int deleted;
    private int failed;
    private int total;
}
