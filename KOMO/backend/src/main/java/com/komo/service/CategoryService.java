package com.komo.service;

import com.komo.dto.request.CategoryRequest;
import com.komo.entity.Category;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.CategoryRepository;
import com.komo.repository.KnowledgeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CategoryService extends BaseService<Category, CategoryRepository> {

    private final KnowledgeBaseService knowledgeBaseService;
    private final KnowledgeRepository entries;

    public CategoryService(CategoryRepository repository, KnowledgeBaseService knowledgeBaseService, KnowledgeRepository entries) {
        super(repository);
        this.knowledgeBaseService = knowledgeBaseService;
        this.entries = entries;
    }

    @Override
    protected UUID getOwnerId(Category entity) {
        return entity.getUserId();
    }

    /** 获取当前用户指定知识库下的所有分类 */
    public List<Category> listByUser(UUID knowledgeBaseId) {
        return repository.findAllByUserIdAndKnowledgeBaseIdOrderBySortOrder(
            getCurrentUserId(), knowledgeBaseId
        );
    }

    @Transactional
    public Category create(CategoryRequest request) {
        if (request.getKnowledgeBaseId() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "知识库不能为空");
        }
        // 验证知识库归属
        knowledgeBaseService.lockForReference(request.getKnowledgeBaseId(), getCurrentUserId());

        Category category = Category.builder()
            .userId(getCurrentUserId())
            .knowledgeBaseId(request.getKnowledgeBaseId())
            .name(request.getName())
            .build();

        if (request.getParentId() != null) {
            Category parent = repository.findByIdAndUserIdForUpdate(request.getParentId(), getCurrentUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.CATEGORY_NOT_FOUND));
            // 父分类必须在同一个知识库
            if (!parent.getKnowledgeBaseId().equals(request.getKnowledgeBaseId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "父分类不属于该知识库");
            }
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
        Category category = repository.findByIdAndUserIdForUpdate(id, getCurrentUserId())
            .orElseThrow(() -> new BusinessException(ErrorCode.CATEGORY_NOT_FOUND));
        long childCount = repository.countDescendantsByUserIdAndKnowledgeBaseId(
            category.getPath() + "." + sanitizeLtreeLabel(id.toString()), getCurrentUserId(), category.getKnowledgeBaseId()
        );
        if (childCount > 0) {
            throw new BusinessException(ErrorCode.CATEGORY_HAS_CHILDREN);
        }
        entries.clearCategoryByCategoryIdAndUserId(id, getCurrentUserId());
        repository.delete(category);
    }

    /** Sanitize UUID for ltree label: replace '-' with '_'. Also validates format. */
    private String sanitizeLtreeLabel(String input) {
        String sanitized = input.replace("-", "_");
        // ltree labels must only contain [A-Za-z0-9_]
        if (!sanitized.matches("^[A-Za-z0-9_]+$")) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "路径标签包含非法字符");
        }
        return sanitized;
    }
}
