package com.komo.service;

import com.komo.entity.KnowledgeBase;
import com.komo.entity.KnowledgeBase.KnowledgeBaseType;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeBaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class KnowledgeBaseService extends BaseService<KnowledgeBase, KnowledgeBaseRepository> {

    public KnowledgeBaseService(KnowledgeBaseRepository repository) {
        super(repository);
    }

    @Override
    protected UUID getOwnerId(KnowledgeBase entity) {
        return entity.getUserId();
    }

    /** 获取用户所有知识库（按排序+创建时间升序） */
    @Transactional
    public List<KnowledgeBase> listForUser() {
        UUID userId = getCurrentUserId();
        List<KnowledgeBase> list = repository.findAllByUserIdOrderBySortOrderAscCreatedAtAsc(userId);
        if (hasBothSystemBases(list)) {
            return list;
        }
        return ensureSystemBases(userId);
    }

    /** 创建用户自定义知识库 */
    @Transactional
    public KnowledgeBase create(String name) {
        UUID userId = getCurrentUserId();
        ensureSystemBases(userId); // 确保系统库先存在

        if (repository.existsByUserIdAndName(userId, name)) {
            throw new BusinessException(ErrorCode.CONFLICT, "同名知识库已存在");
        }

        KnowledgeBase kb = KnowledgeBase.builder()
            .userId(userId)
            .name(name)
            .type(KnowledgeBaseType.USER)
            .isDeletable(true)
            .sortOrder(100) // 排在系统库之后
            .build();
        return repository.save(kb);
    }

    /** 重命名知识库 */
    @Transactional
    public KnowledgeBase rename(UUID id, String newName) {
        KnowledgeBase kb = findByIdOrThrow(id);
        if (!kb.isDeletable()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "系统知识库不可重命名");
        }
        if (repository.existsByUserIdAndName(getCurrentUserId(), newName)) {
            throw new BusinessException(ErrorCode.CONFLICT, "同名知识库已存在");
        }
        kb.setName(newName);
        return repository.save(kb);
    }

    /** 删除知识库（系统库不可删除，有内容的知识库需要先清空或转移） */
    @Transactional
    public void delete(UUID id) {
        KnowledgeBase kb = findByIdOrThrow(id);
        if (!kb.isDeletable()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "系统知识库不可删除");
        }
        // 注意：有知识条目的库暂时不限制删除，条目变成孤立（后续可加转移逻辑）
        repository.delete(kb);
    }

    /** 获取用户的系统碎片库（不可删除） */
    @Transactional
    public KnowledgeBase getFragmentsBase(UUID userId) {
        List<KnowledgeBase> list = repository.findAllByUserIdAndType(userId, KnowledgeBaseType.SYSTEM_FRAGMENTS);
        if (list.isEmpty()) {
            return ensureSystemBases(userId).stream()
                .filter(kb -> kb.getType() == KnowledgeBaseType.SYSTEM_FRAGMENTS)
                .findFirst().orElseThrow();
        }
        return list.get(0);
    }

    /** 获取用户的默认知识库 */
    @Transactional
    public KnowledgeBase getDefaultBase(UUID userId) {
        List<KnowledgeBase> list = repository.findAllByUserIdAndType(userId, KnowledgeBaseType.DEFAULT);
        if (list.isEmpty()) {
            return ensureSystemBases(userId).stream()
                .filter(kb -> kb.getType() == KnowledgeBaseType.DEFAULT)
                .findFirst().orElseThrow();
        }
        return list.get(0);
    }

    /** 确保用户的系统知识库存在（默认库 + 碎片库）。已存在则跳过。 */
    List<KnowledgeBase> ensureSystemBases(UUID userId) {
        repository.acquireSystemBaseLock(userId);
        List<KnowledgeBase> existing = repository.findAllByUserIdOrderBySortOrderAscCreatedAtAsc(userId);
        List<KnowledgeBase> result = new ArrayList<>(existing);

        boolean hasDefault = existing.stream()
            .anyMatch(kb -> kb.getType() == KnowledgeBaseType.DEFAULT);
        if (!hasDefault) {
            KnowledgeBase defaultKb = KnowledgeBase.builder()
                .userId(userId)
                .name("我的知识库")
                .type(KnowledgeBaseType.DEFAULT)
                .isDeletable(true)
                .sortOrder(0)
                .build();
            repository.saveAndFlush(defaultKb);
            result.add(defaultKb);
        }

        boolean hasFragments = existing.stream()
            .anyMatch(kb -> kb.getType() == KnowledgeBaseType.SYSTEM_FRAGMENTS);
        if (!hasFragments) {
            KnowledgeBase fragmentsKb = KnowledgeBase.builder()
                .userId(userId)
                .name("知识碎片")
                .type(KnowledgeBaseType.SYSTEM_FRAGMENTS)
                .isDeletable(false)
                .sortOrder(1)
                .build();
            repository.saveAndFlush(fragmentsKb);
            result.add(fragmentsKb);
        }

        return result.stream()
            .sorted(java.util.Comparator.comparing(KnowledgeBase::getSortOrder))
            .toList();
    }

    private boolean hasBothSystemBases(List<KnowledgeBase> bases) {
        boolean hasDefault = bases.stream()
            .anyMatch(kb -> kb.getType() == KnowledgeBaseType.DEFAULT);
        boolean hasFragments = bases.stream()
            .anyMatch(kb -> kb.getType() == KnowledgeBaseType.SYSTEM_FRAGMENTS);
        return hasDefault && hasFragments;
    }
}
