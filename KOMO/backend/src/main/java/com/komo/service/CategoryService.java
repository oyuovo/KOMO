package com.komo.service;

import com.komo.dto.request.CategoryRequest;
import com.komo.entity.Category;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.CategoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * 分类服务。
 * 继承 BaseService 获得归属校验能力，使用 ltree 实现树形结构。
 */
@Service
public class CategoryService extends BaseService<Category, CategoryRepository> {

    public CategoryService(CategoryRepository repository) {
        super(repository);
    }

    @Override
    protected UUID getOwnerId(Category entity) {
        return entity.getUserId();
    }

    /** 获取当前用户的所有分类，按排序字段排列 */
    public List<Category> listByUser() {
        return repository.findAllByUserIdOrderBySortOrder(getCurrentUserId());
    }

    @Transactional
    public Category create(CategoryRequest request) {
        Category category = Category.builder()
            .userId(getCurrentUserId())
            .name(request.getName())
            .build();

        if (request.getParentId() != null) {
            Category parent = findByIdOrThrow(request.getParentId());
            category.setPath(parent.getPath() + "." + sanitizeLtreeLabel(parent.getId().toString()));
        } else {
            category.setPath("root");
        }

        return repository.save(category);
    }

    @Transactional
    public Category update(UUID id, CategoryRequest request) {
        Category category = findByIdOrThrow(id);
        category.setName(request.getName());
        return repository.save(category);
    }

    @Transactional
    public void delete(UUID id) {
        Category category = findByIdOrThrow(id);
        long childCount = repository.countByPathStartingWithAndUserId(
            category.getPath() + "." + sanitizeLtreeLabel(id.toString()), getCurrentUserId()
        );
        if (childCount > 0) {
            throw new BusinessException(ErrorCode.CATEGORY_HAS_CHILDREN);
        }
        repository.delete(category);
    }

    /** ltree 标签不允许连字符，将 UUID 中的 - 替换为 _ */
    private String sanitizeLtreeLabel(String uuid) {
        return uuid.replace("-", "_");
    }
}
