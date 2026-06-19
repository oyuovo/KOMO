package com.komo.service;

import com.komo.dto.request.CategoryRequest;
import com.komo.entity.Category;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.CategoryRepository;
import com.komo.repository.KnowledgeBaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CategoryService extends BaseService<Category, CategoryRepository> {

    private final KnowledgeBaseRepository knowledgeBaseRepository;

    public CategoryService(CategoryRepository repository, KnowledgeBaseRepository knowledgeBaseRepository) {
        super(repository);
        this.knowledgeBaseRepository = knowledgeBaseRepository;
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
        knowledgeBaseRepository.findById(request.getKnowledgeBaseId())
            .filter(kb -> kb.getUserId().equals(getCurrentUserId()))
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "知识库不存在"));

        Category category = Category.builder()
            .userId(getCurrentUserId())
            .knowledgeBaseId(request.getKnowledgeBaseId())
            .name(request.getName())
            .build();

        if (request.getParentId() != null) {
            Category parent = findByIdOrThrow(request.getParentId());
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
        Category category = findByIdOrThrow(id);
        long childCount = repository.countByPathStartingWithAndUserId(
            category.getPath() + "." + sanitizeLtreeLabel(id.toString()), getCurrentUserId()
        );
        if (childCount > 0) {
            throw new BusinessException(ErrorCode.CATEGORY_HAS_CHILDREN);
        }
        repository.delete(category);
    }

    private String sanitizeLtreeLabel(String uuid) {
        return uuid.replace("-", "_");
    }
}
