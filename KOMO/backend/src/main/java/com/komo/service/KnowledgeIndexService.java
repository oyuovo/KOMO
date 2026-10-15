package com.komo.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.mapping.Property;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.elasticsearch._types.query_dsl.TextQueryType;
import co.elastic.clients.elasticsearch.core.*;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.elasticsearch.indices.CreateIndexRequest;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.util.*;

/**
 * Elasticsearch 知识索引服务。
 * 负责索引的创建、CRUD 同步、全文搜索和 more_like_this 去重查询。
 */
@Service
@RequiredArgsConstructor
public class KnowledgeIndexService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIndexService.class);

    public static final String INDEX_NAME = "komo_knowledge";
    private static final String USER_ID_FIELD = "userId";
    private static final String KNOWLEDGE_BASE_ID_FIELD = "knowledgeBaseId";

    private final ElasticsearchClient esClient;

    /** 应用启动时确保 ES 索引存在 */
    @PostConstruct
    public void init() {
        ensureIndex();
    }

    /** 启动时尽力创建索引；手动重建走严格失败路径，不能报告虚假的成功。 */
    public void ensureIndex() {
        try {
            ensureIndexExists();
        } catch (Exception e) {
            log.error("[ES] 创建索引失败", e);
        }
    }

    private void ensureIndexExists() throws IOException {
        if (!esClient.indices().exists(e -> e.index(INDEX_NAME)).value()) {
            createIndexWithMapping();
        }
    }

    private void createIndexWithMapping() throws IOException {
        esClient.indices().create(CreateIndexRequest.of(c -> c
            .index(INDEX_NAME)
            .settings(s -> s
                .numberOfShards("1")
                .numberOfReplicas("0")
                .analysis(a -> a
                    .analyzer("smart_cn", sa -> sa
                        .custom(sa2 -> sa2
                            .tokenizer("smartcn_tokenizer")
                        )
                    )
                )
            )
            .mappings(m -> m
                .properties(USER_ID_FIELD, p -> p.keyword(k -> k))
                .properties(KNOWLEDGE_BASE_ID_FIELD, p -> p.keyword(k -> k))
                .properties("title", p -> p
                    .text(t -> t.analyzer("smart_cn")))
                .properties("contentPlain", p -> p
                    .text(t -> t.analyzer("smart_cn")))
                .properties("content", p -> p
                    .text(t -> t.analyzer("smart_cn")))
                .properties("createdAt", p -> p.date(d -> d))
            )
        ));
    }

    /** 简易重试：最多尝试 3 次，指数退避 */
    private boolean retry(String op, Runnable action) {
        for (int i = 0; i < 3; i++) {
            try {
                action.run();
                return true;
            } catch (Exception e) {
                if (i == 2) {
                    log.error("[ES] {} 重试耗尽", op, e);
                } else {
                    try {
                        Thread.sleep((long) Math.pow(2, i) * 200);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        log.warn("[ES] {} 重试等待被中断", op, ie);
                        return false;
                    }
                }
            }
        }
        return false;
    }

    /** 索引一条知识条目 */
    public void indexEntry(UUID entryId, UUID userId, UUID knowledgeBaseId,
                           String title, String contentPlain, String content) {
        indexEntryWithRetry(entryId, userId, knowledgeBaseId, title, contentPlain, content);
    }

    private boolean indexEntryWithRetry(UUID entryId, UUID userId, UUID knowledgeBaseId,
                                        String title, String contentPlain, String content) {
        return retry("索引 entryId=" + entryId, () -> {
            try {
                Map<String, Object> doc = new HashMap<>();
                doc.put("userId", userId.toString());
                if (knowledgeBaseId != null) {
                    doc.put("knowledgeBaseId", knowledgeBaseId.toString());
                }
                doc.put("title", title);
                doc.put("contentPlain", contentPlain != null ? contentPlain : "");
                doc.put("content", content != null ? content : "");
                doc.put("createdAt", System.currentTimeMillis());

                esClient.index(IndexRequest.of(i -> i
                    .index(INDEX_NAME)
                    .id(entryId.toString())
                    .document(doc)
                ));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }

    /** 更新索引（含重试） */
    public void updateEntry(UUID entryId, UUID userId, UUID knowledgeBaseId,
                            String title, String contentPlain, String content) {
        retry("更新 entryId=" + entryId, () -> {
            try {
                Map<String, Object> doc = new HashMap<>();
                if (knowledgeBaseId != null) {
                    doc.put("knowledgeBaseId", knowledgeBaseId.toString());
                }
                doc.put("title", title);
                doc.put("contentPlain", contentPlain != null ? contentPlain : "");
                doc.put("content", content != null ? content : "");
                doc.put("createdAt", System.currentTimeMillis());

                esClient.update(UpdateRequest.of(u -> u
                    .index(INDEX_NAME)
                    .id(entryId.toString())
                    .doc(doc)
                ), Map.class);
            } catch (ElasticsearchException e) {
                if (e.status() == 404) {
                    // 文档不存在，回退为新建索引
                    log.info("[ES] 更新时未找到文档，回退为新建 entryId={}", entryId);
                    indexEntry(entryId, userId, knowledgeBaseId, title, contentPlain, content);
                } else {
                    throw new RuntimeException(e);
                }
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }

    /** 删除索引（含重试） */
    public void deleteEntry(UUID entryId) {
        retry("删除 entryId=" + entryId, () -> {
            try {
                esClient.delete(DeleteRequest.of(d -> d
                    .index(INDEX_NAME)
                    .id(entryId.toString())
                ));
            } catch (ElasticsearchException e) {
                if (e.status() == 404) {
                    // 文档本来就不存在，无需告警
                    return;
                }
                throw new RuntimeException(e);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }

    /** 全文搜索（用于 RAG；知识列表的关键词过滤走 PostgreSQL）。 */
    public List<Map<String, Object>> search(UUID userId, String query, int size,
                                             UUID knowledgeBaseId) {
        try {
            Map<String, Property> properties = readIndexProperties();
            Query userFilter = exactIdFilter(properties, USER_ID_FIELD, userId);
            Query kbFilter = knowledgeBaseId == null ? null
                : exactIdFilter(properties, KNOWLEDGE_BASE_ID_FIELD, knowledgeBaseId);
            SearchResponse<Map> response = esClient.search(s -> s
                .index(INDEX_NAME)
                .query(q -> q
                    .bool(b -> {
                        b.filter(userFilter);
                        if (kbFilter != null) {
                            b.filter(kbFilter);
                        }
                        b.must(m -> m.multiMatch(mm -> mm
                            .fields("title^3", "contentPlain")
                            .query(query)
                            .type(TextQueryType.BestFields)
                        ));
                        return b;
                    })
                )
                .size(size),
                Map.class
            );

            List<Map<String, Object>> results = new ArrayList<>();
            for (Hit<Map> hit : response.hits().hits()) {
                Map<String, Object> item = new HashMap<>(hit.source());
                item.put("_score", hit.score());
                item.put("_id", hit.id());
                results.add(item);
            }
            return results;
        } catch (Exception e) {
            log.error("[ES] 搜索失败 query={}", query, e);
            return List.of();
        }
    }

    /**
     * More Like This 查询 — 用于去重。
     * 根据候选草稿的标题+内容，搜索最相似的知识条目。
     * 返回 BM25 得分 + 条目信息。
     */
    public List<Map<String, Object>> findSimilar(UUID userId, String title, String content, int size) {
        try {
            Query userFilter = exactIdFilter(readIndexProperties(), USER_ID_FIELD, userId);
            // 构造 MLT 查询文本
            String likeText = (title != null ? title + " " : "") +
                (content != null ? content.substring(0, Math.min(content.length(), 1000)) : "");

            SearchResponse<Map> response = esClient.search(s -> s
                .index(INDEX_NAME)
                .query(q -> q
                    .bool(b -> b
                        .filter(userFilter)
                        .must(m -> m.moreLikeThis(mlt -> mlt
                            .fields("title", "contentPlain")
                            .like(l -> l.text(likeText))
                            .minTermFreq(1)
                            .minDocFreq(1)
                            .maxQueryTerms(25)
                        ))
                    )
                )
                .size(size),
                Map.class
            );

            List<Map<String, Object>> results = new ArrayList<>();
            for (Hit<Map> hit : response.hits().hits()) {
                Map<String, Object> item = new HashMap<>(hit.source());
                item.put("_score", hit.score());
                item.put("_id", hit.id());
                results.add(item);
            }
            return results;
        } catch (Exception e) {
            log.error("[ES] MLT查询失败 title={}", title, e);
            return List.of();
        }
    }

    /**
     * 只替换指定用户的索引文档，保留共享索引和其他用户的数据。
     * 非原子重建：失败时保留已完成的操作并报错，可修复依赖后重试。
     */
    public int reindexUser(UUID userId, List<KnowledgeEntry> entries) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(entries, "entries");
        for (KnowledgeEntry entry : entries) {
            if (entry == null || !userId.equals(entry.getUserId())) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "不能重建其他用户的知识索引");
            }
            Objects.requireNonNull(entry.getId(), "entryId");
        }
        try {
            ensureIndexExists();
            Query userFilter = exactIdFilter(readIndexProperties(), USER_ID_FIELD, userId);
            // delete-by-query 基于搜索快照，先让尚未刷新的旧文档可见。
            refreshIndex();
            DeleteByQueryResponse deletion = esClient.deleteByQuery(d -> d.index(INDEX_NAME)
                .query(q -> q.bool(b -> b.filter(userFilter))).refresh(true));
            if (Boolean.TRUE.equals(deletion.timedOut()) || !deletion.failures().isEmpty()
                || (deletion.versionConflicts() != null && deletion.versionConflicts() > 0)) {
                throw new IllegalStateException("ES scoped deletion incomplete: " + deletion);
            }

            int count = 0;
            for (KnowledgeEntry entry : entries) {
                if (entry.getDeletedAt() == null) {
                    if (!indexEntryWithRetry(entry.getId(), userId, entry.getKnowledgeBaseId(),
                        entry.getTitle(), entry.getContentPlain(), entry.getContent())) {
                        throw new IllegalStateException("ES reindex write failed for entry " + entry.getId());
                    }
                    count++;
                }
            }
            refreshIndex();
            log.info("[ES] 用户索引重建完成 userId={} indexed={}", userId, count);
            return count;
        } catch (Exception e) {
            log.error("[ES] 用户索引重建失败 userId={}", userId, e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "知识索引重建失败，请稍后重试");
        }
    }

    private void refreshIndex() throws IOException {
        var response = esClient.indices().refresh(r -> r.index(INDEX_NAME));
        if (response.shards().failed().intValue() > 0) {
            throw new IllegalStateException("ES refresh failed: " + response);
        }
    }

    private Map<String, Property> readIndexProperties() throws IOException {
        var mapping = esClient.indices().getMapping(r -> r.index(INDEX_NAME)).result().get(INDEX_NAME);
        if (mapping == null) {
            throw new IllegalStateException("ES knowledge index mapping is missing");
        }
        return mapping.mappings().properties();
    }

    /** 兼容显式 keyword 与历史 text + keyword；绝不使用分词字段作为授权条件。 */
    private Query exactIdFilter(Map<String, Property> properties, String field, UUID value) {
        Objects.requireNonNull(value, field);
        Property property = properties.get(field);
        if (property == null) {
            // 空的历史动态索引可能还没有该字段，此时该范围内没有可检索文档。
            return Query.of(q -> q.matchNone(m -> m));
        }
        String exactField;
        if (property.isKeyword()) {
            exactField = field;
        } else if (property.isText() && property.text().fields().containsKey("keyword")
            && property.text().fields().get("keyword").isKeyword()) {
            exactField = field + ".keyword";
        } else {
            throw new IllegalStateException("ES scope field has no exact keyword mapping: " + field);
        }
        return Query.of(q -> q.term(t -> t.field(exactField).value(value.toString())));
    }
}
