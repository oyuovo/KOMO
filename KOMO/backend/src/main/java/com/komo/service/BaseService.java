package com.komo.service;

import com.komo.exception.AccessDeniedException;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.security.SecurityContext;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * 所有 Service 的抽象基类。
 * 强制所有 CRUD 操作自动注入当前用户 ID 并校验数据归属。
 *
 * @param <T> 实体类型
 * @param <R> Repository 类型（必须继承 JpaRepository）
 */
public abstract class BaseService<T, R extends JpaRepository<T, UUID>> {

    protected final R repository;

    protected BaseService(R repository) {
        this.repository = repository;
    }

    /**
     * 子类实现：返回实体的所有者 user_id。
     * 用于归属校验。
     */
    protected abstract UUID getOwnerId(T entity);

    /**
     * 获取当前已认证的用户 ID。
     * 从 SecurityContext ThreadLocal 读取。
     */
    protected UUID getCurrentUserId() {
        return SecurityContext.getCurrentUserId();
    }

    /**
     * 安全查找：按 ID 查找实体并校验归属。
     * 若实体不存在或不属于当前用户，抛出相应异常。
     *
     * @param id 实体主键
     * @return 实体
     * @throws BusinessException 若实体不存在
     * @throws AccessDeniedException 若实体不属于当前用户
     */
    public T findByIdOrThrow(UUID id) {
        T entity = repository.findById(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!getOwnerId(entity).equals(getCurrentUserId())) {
            throw new AccessDeniedException("无权访问此资源");
        }
        return entity;
    }
}
