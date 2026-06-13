package com.komo.service;

import com.komo.dto.request.KnowledgeCreateRequest;
import com.komo.dto.request.KnowledgeUpdateRequest;
import com.komo.dto.response.KnowledgeResponse;
import com.komo.dto.response.PageResponse;
import com.komo.entity.KnowledgeEntry;
import com.komo.entity.KnowledgeEntry.KnowledgeSource;
import com.komo.entity.KnowledgeLink;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeLinkRepository;
import com.komo.repository.KnowledgeRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 知识条目服务。
 * 继承 BaseService 获得归属校验，提供 CRUD、软删除、关联、导出功能。
 */
@Service
public class KnowledgeService extends BaseService<KnowledgeEntry, KnowledgeRepository> {

    private final KnowledgeLinkRepository knowledgeLinkRepository;
    private final KnowledgeIndexService indexService;

    public KnowledgeService(KnowledgeRepository repository,
                            KnowledgeLinkRepository knowledgeLinkRepository,
                            KnowledgeIndexService indexService) {
        super(repository);
        this.knowledgeLinkRepository = knowledgeLinkRepository;
        this.indexService = indexService;
    }

    @Override
    protected UUID getOwnerId(KnowledgeEntry entity) {
        return entity.getUserId();
    }

    /** 分页列表，支持分类和关键词过滤 */
    public PageResponse<KnowledgeResponse> list(UUID categoryId, String query, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<KnowledgeEntry> result = repository.findByUserIdAndFilters(
            getCurrentUserId(), categoryId, query, pageable
        );
        List<KnowledgeResponse> items = result.getContent().stream()
            .map(KnowledgeResponse::from)
            .toList();
        return PageResponse.of(result, items);
    }

    /** 查看单条详情（含归属校验） */
    public KnowledgeEntry getById(UUID id) {
        return findByIdOrThrow(id);
    }

    @Transactional
    public KnowledgeEntry create(KnowledgeCreateRequest request) {
        KnowledgeEntry entry = KnowledgeEntry.builder()
            .userId(getCurrentUserId())
            .title(request.getTitle())
            .content(request.getContent())
            .contentPlain(stripMarkdown(request.getContent()))
            .source(KnowledgeSource.MANUAL)
            .entryType(request.getEntryType() != null ? request.getEntryType() : KnowledgeEntry.KnowledgeType.FACT)
            .categoryId(request.getCategoryId())
            .tagNames(request.getTags())
            .build();

        entry = repository.save(entry);
        indexService.indexEntry(entry.getId(), entry.getUserId(), entry.getTitle(), entry.getContentPlain());
        return entry;
    }

    @Transactional
    public KnowledgeEntry update(UUID id, KnowledgeUpdateRequest request) {
        KnowledgeEntry entry = findByIdOrThrow(id);
        entry.setTitle(request.getTitle());
        entry.setContent(request.getContent());
        entry.setContentPlain(stripMarkdown(request.getContent()));
        entry.setEntryType(request.getEntryType());
        entry.setCategoryId(request.getCategoryId());
        entry.setTagNames(request.getTags());
        entry = repository.save(entry);
        indexService.updateEntry(entry.getId(), entry.getTitle(), entry.getContentPlain());
        return entry;
    }

    @Transactional
    public void softDelete(UUID id) {
        KnowledgeEntry entry = findByIdOrThrow(id);
        entry.setDeletedAt(LocalDateTime.now());
        repository.save(entry);
        indexService.deleteEntry(id);
    }

    @Transactional
    public KnowledgeLink addLink(UUID entryId, UUID targetEntryId, String relation) {
        // 验证两端均属于当前用户
        KnowledgeEntry source = findByIdOrThrow(entryId);
        KnowledgeEntry target = repository.findByIdAndUserId(targetEntryId, getCurrentUserId())
            .orElseThrow(() -> new BusinessException(ErrorCode.KNOWLEDGE_NOT_FOUND, "关联目标知识条目不存在"));

        if (knowledgeLinkRepository.existsBySourceEntryIdAndTargetEntryId(entryId, targetEntryId)) {
            throw new BusinessException(ErrorCode.CONFLICT, "该关联已存在");
        }

        KnowledgeLink link = KnowledgeLink.builder()
            .sourceEntryId(entryId)
            .targetEntryId(targetEntryId)
            .relation(KnowledgeLink.RelationType.valueOf(relation.toUpperCase()))
            .build();

        return knowledgeLinkRepository.save(link);
    }

    @Transactional
    public void removeLink(UUID entryId, UUID linkId) {
        findByIdOrThrow(entryId); // 验证归属
        KnowledgeLink link = knowledgeLinkRepository.findById(linkId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "关联不存在"));

        if (!link.getSourceEntryId().equals(entryId) && !link.getTargetEntryId().equals(entryId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "关联不属于该知识条目");
        }

        knowledgeLinkRepository.delete(link);
    }

    /** 获取某条目的所有关联 */
    public List<KnowledgeLink> getLinks(UUID entryId) {
        findByIdOrThrow(entryId); // 验证归属
        return knowledgeLinkRepository.findAllByEntryId(entryId);
    }

    /** 导出当前用户全部知识 */
    public List<KnowledgeEntry> exportAll() {
        return repository.findAllByUserIdAndDeletedAtIsNull(getCurrentUserId());
    }

    /** 手动重建 ES 索引：从 DB 全量回填所有未删除条目。返回索引条数。 */
    public int reindexAll() {
        List<KnowledgeEntry> allActive = repository.findAllActive();
        return indexService.reindexAll(allActive);
    }

    /**
     * 简易 Markdown 清洗：移除格式标记，保留纯文本。
     * Phase 2 由 Python AI 服务提供更精确的清洗。
     */
    private String stripMarkdown(String markdown) {
        if (markdown == null) {
            return "";
        }
        return markdown
            .replaceAll("#{1,6}\\s", "")
            .replaceAll("[*_~`>]", "")
            .replaceAll("\\[([^]]+)]\\([^)]+\\)", "$1")
            .replaceAll("!\\[[^]]*]\\([^)]+\\)", "")
            .replaceAll("```[\\s\\S]*?```", "")
            .replaceAll("\\s+", " ")
            .trim();
    }
}
