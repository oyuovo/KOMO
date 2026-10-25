package com.komo.service;

import com.komo.entity.KnowledgeBase;
import com.komo.entity.KnowledgeBase.KnowledgeBaseType;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeBaseRepository;
import com.komo.repository.KnowledgeRepository;
import com.komo.repository.CategoryRepository;
import com.komo.repository.ConversationRepository;
import com.komo.repository.DailyRecommendationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class KnowledgeBaseService extends BaseService<KnowledgeBase, KnowledgeBaseRepository> {

    private final KnowledgeRepository entries;
    private final CategoryRepository categories;
    private final ConversationRepository conversations;
    private final DailyRecommendationRepository recommendations;

    public KnowledgeBaseService(KnowledgeBaseRepository repository, KnowledgeRepository entries,
                                CategoryRepository categories, ConversationRepository conversations,
                                DailyRecommendationRepository recommendations) {
        super(repository);
        this.entries = entries;
        this.categories = categories;
        this.conversations = conversations;
        this.recommendations = recommendations;
    }

    /** 引用方必须在自己的写事务内持锁，防止检查后知识库被删除。 */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<KnowledgeBase> findForReference(UUID id, UUID userId) {
        return repository.findByIdAndUserIdForUpdate(id, userId).filter(kb -> userId.equals(kb.getUserId()));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public KnowledgeBase lockForReference(UUID id, UUID userId) {
        return findForReference(id, userId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "知识库不存在或已删除"));
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
        UUID userId = getCurrentUserId();
        KnowledgeBase kb = lockForReference(id, userId);
        if (!kb.isDeletable()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "系统知识库不可删除");
        }
        List<String> contents = new ArrayList<>();
        if (entries.existsByKnowledgeBaseIdAndUserIdAndDeletedAtIsNull(id, userId)) contents.add("文章");
        if (categories.existsByKnowledgeBaseIdAndUserId(id, userId)) contents.add("分类");
        conversations.detachStaleReadingByKnowledgeBaseIdAndUserId(id, userId, com.komo.entity.Conversation.ConversationType.READING);
        if (conversations.existsByKnowledgeBaseIdAndUserId(id, userId)) contents.add("会话（含阅读问答）");
        if (!contents.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                "知识库中仍有" + String.join("、", contents) + "，请先处理后再删除");
        }
        entries.detachDeletedByKnowledgeBaseIdAndUserId(id, userId);
        recommendations.clearSuggestedBaseByUserId(id, userId);
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
