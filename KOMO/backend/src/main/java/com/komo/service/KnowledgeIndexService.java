package com.komo.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch._types.query_dsl.TextQueryType;
import co.elastic.clients.elasticsearch.core.*;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.elasticsearch.indices.CreateIndexRequest;
import co.elastic.clients.elasticsearch.indices.DeleteIndexRequest;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.json.JsonData;
import com.komo.entity.KnowledgeEntry;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
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

    private final ElasticsearchClient esClient;

    /** 应用启动时确保 ES 索引存在 */
    @PostConstruct
    public void init() {
        ensureIndex();
    }

    /** 创建索引（含 SmartCN 中文分词器 + keyword 字段类型）。
     * 使用 userId.keyword / knowledgeBaseId.keyword 查询，兼容动态映射。 */
    public void ensureIndex() {
        try {
            boolean exists = esClient.indices()
                .exists(e -> e.index(INDEX_NAME)).value();
            if (!exists) {
                createIndexWithMapping();
            }
        } catch (Exception e) {
            log.error("[ES] 创建索引失败", e);
        }
    }

    private void createIndexWithMapping() {
        try {
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
                .properties("userId", p -> p.keyword(k -> k))
                .properties("knowledgeBaseId", p -> p.keyword(k -> k))
                .properties("title", p -> p
                    .text(t -> t.analyzer("smart_cn").boost(3.0)))
                .properties("contentPlain", p -> p
                    .text(t -> t.analyzer("smart_cn")))
                .properties("content", p -> p
                    .text(t -> t.analyzer("smart_cn")))
                .properties("createdAt", p -> p.date(d -> d))
            )
        ));
        } catch (Exception e) {
            log.error("[ES] 创建索引失败", e);
        }
    }

    /** 简易重试：最多尝试 3 次，指数退避 */
    private void retry(String op, Runnable action) {
        for (int i = 0; i < 3; i++) {
            try {
                action.run();
                return;
            } catch (Exception e) {
                if (i == 2) {
                    log.error("[ES] {} 重试耗尽", op, e);
                } else {
                    try {
                        Thread.sleep((long) Math.pow(2, i) * 200);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        log.warn("[ES] {} 重试等待被中断", op, ie);
                        return;
                    }
                }
            }
        }
    }

    /** 索引一条知识条目 */
    public void indexEntry(UUID entryId, UUID userId, UUID knowledgeBaseId,
                           String title, String contentPlain, String content) {
        retry("索引 entryId=" + entryId, () -> {
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

    /** 全文搜索（用于 RAG 和首页搜索） */
    public List<Map<String, Object>> search(UUID userId, String query, int size,
                                             UUID knowledgeBaseId) {
        try {
            SearchResponse<Map> response = esClient.search(s -> s
                .index(INDEX_NAME)
                .query(q -> q
                    .bool(b -> {
                        b.must(m -> m.term(t -> t.field("userId.keyword").value(userId.toString())));
                        if (knowledgeBaseId != null) {
                            b.filter(f -> f.term(t ->
                                t.field("knowledgeBaseId.keyword").value(knowledgeBaseId.toString())));
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
            // 构造 MLT 查询文本
            String likeText = (title != null ? title + " " : "") +
                (content != null ? content.substring(0, Math.min(content.length(), 1000)) : "");

            SearchResponse<Map> response = esClient.search(s -> s
                .index(INDEX_NAME)
                .query(q -> q
                    .bool(b -> b
                        .must(m -> m.term(t -> t.field("userId.keyword").value(userId.toString())))
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

    /** 手动重建全部索引：删除旧索引 → 从 DB 全量回填 */
    public int reindexAll(List<KnowledgeEntry> entries) {
        try {
            esClient.indices().delete(DeleteIndexRequest.of(d -> d.index(INDEX_NAME)));
        } catch (Exception e) {
            log.debug("[ES] reindex删除索引时索引不存在或删除失败", e);
        }
        ensureIndex();
        int count = 0;
        for (KnowledgeEntry entry : entries) {
            if (entry.getDeletedAt() == null) {
                indexEntry(entry.getId(), entry.getUserId(), entry.getKnowledgeBaseId(),
                    entry.getTitle(), entry.getContentPlain(), entry.getContent());
                count++;
            }
        }
        return count;
    }
}
