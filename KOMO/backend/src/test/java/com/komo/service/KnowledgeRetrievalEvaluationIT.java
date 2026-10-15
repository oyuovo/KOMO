package com.komo.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Reproducible diagnostic benchmark, opt-in via -Dtest=KnowledgeRetrievalEvaluationIT. */
class KnowledgeRetrievalEvaluationIT {
    private static final String INDEX = KnowledgeIndexService.INDEX_NAME;
    private static final UUID USER = id("alice");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final GenericContainer<?> ES = new GenericContainer<>(
        DockerImageName.parse("komo-elasticsearch:8.12.0-smartcn"))
        .withImagePullPolicy(imageName -> false)
        .withEnv("discovery.type", "single-node")
        .withEnv("xpack.security.enabled", "false")
        .withEnv("ES_JAVA_OPTS", "-Xms256m -Xmx256m")
        .withExposedPorts(9200)
        .waitingFor(Wait.forHttp("/").forStatusCode(200).withStartupTimeout(Duration.ofMinutes(3)));
    private static RestClientTransport transport;
    private static ElasticsearchClient client;
    private static KnowledgeIndexService service;

    record Document(String id, String title, String content, String owner, String knowledgeBase) {}
    record Question(String id, String category, String query, List<String> expectedIds, String evidence,
                    String knowledgeBase) {}
    record Corpus(int version, String description, List<Document> documents, List<Question> queries) {}
    record Result(String variant, String questionId, String category, String query, boolean answerable,
                  boolean hitAt3, double reciprocalRankAt3, boolean evidenceInContext,
                  boolean contextOnUnanswerable, List<String> returnedIds) {}

    @BeforeAll
    static void start() {
        ES.start();
        transport = new RestClientTransport(RestClient.builder(
            new HttpHost(ES.getHost(), ES.getMappedPort(9200), "http")).build(), new JacksonJsonpMapper());
        client = new ElasticsearchClient(transport);
        service = new KnowledgeIndexService(client);
    }

    @AfterAll
    static void stop() throws IOException {
        try {
            if (transport != null) transport.close();
        } finally {
            ES.stop();
        }
    }

    @Test
    void measureRetrievalAndActualRagContextWithoutAssertingQualityClaims() throws Exception {
        byte[] bytes;
        try (var input = Objects.requireNonNull(getClass().getResourceAsStream("/retrieval/evaluation-corpus.json"))) {
            bytes = input.readAllBytes();
        }
        Corpus corpus = JSON.readValue(bytes, Corpus.class);
        validate(corpus);
        Map<String, String> documentNames = corpus.documents().stream()
            .collect(Collectors.toMap(d -> id(d.id()).toString(), Document::id));
        List<Result> results = new ArrayList<>();
        KnowledgeIndexService contextIndex = mock(KnowledgeIndexService.class);
        ConversationService conversation = mock(ConversationService.class, CALLS_REAL_METHODS);
        ReflectionTestUtils.setField(conversation, "knowledgeIndexService", contextIndex);

        for (String variant : List.of("standard", "configured-smartcn", "builtin-smartcn")) {
            prepareIndex(variant);
            for (Document doc : corpus.documents()) {
                service.indexEntry(id(doc.id()), id(doc.owner()), id(doc.knowledgeBase()),
                    doc.title(), doc.content(), doc.content());
            }
            client.indices().refresh(r -> r.index(INDEX));
            assertEquals(corpus.documents().size(), client.count(c -> c.index(INDEX)).count());

            for (Question question : corpus.queries()) {
                UUID kb = id(question.knowledgeBase());
                List<Map<String, Object>> hits = service.search(USER, question.query(), 3, kb);
                for (Map<String, Object> hit : hits) {
                    assertEquals(USER.toString(), hit.get("userId"), "cross-user retrieval");
                    assertEquals(kb.toString(), hit.get("knowledgeBaseId"), "cross-KB retrieval");
                }
                List<String> names = hits.stream().map(h -> documentNames.get(h.get("_id"))).toList();
                assertTrue(names.stream().allMatch(Objects::nonNull));
                boolean answerable = !question.expectedIds().isEmpty();
                int firstRelevant = -1;
                for (int rank = 0; rank < names.size(); rank++) {
                    if (question.expectedIds().contains(names.get(rank))) { firstRelevant = rank; break; }
                }

                // Exercise production context assembly; don't duplicate its truncation rule in this benchmark.
                when(contextIndex.search(USER, question.query(), 3, kb)).thenReturn(hits);
                List<Map<String, String>> messages = new ArrayList<>();
                ReflectionTestUtils.invokeMethod(conversation, "appendRagContext", messages, USER, question.query(), kb);
                String context = messages.stream().map(m -> m.get("content")).collect(Collectors.joining("\n"));
                results.add(new Result(variant, question.id(), question.category(), question.query(), answerable,
                    firstRelevant >= 0, firstRelevant < 0 ? 0 : 1.0 / (firstRelevant + 1),
                    answerable && firstRelevant >= 0 && context.contains(question.evidence()),
                    !answerable && !messages.isEmpty(), names));
            }
        }

        Path output = Path.of("target", "retrieval-evaluation");
        Files.createDirectories(output);
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("generatedAt", ZonedDateTime.now(ZoneId.of("Asia/Shanghai")).toString());
        report.put("corpusSha256", hash);
        report.put("description", corpus.description());
        report.put("documents", corpus.documents().size());
        report.put("queries", corpus.queries().size());
        report.put("results", results);
        JSON.writerWithDefaultPrettyPrinter().writeValue(output.resolve("report.json").toFile(), report);
        Files.writeString(output.resolve("report.md"), markdown(corpus, results, hash), StandardCharsets.UTF_8);
        assertEquals(corpus.queries().size() * 3, results.size());
    }

    private void prepareIndex(String variant) throws IOException {
        if (client.indices().exists(e -> e.index(INDEX)).value()) {
            client.indices().delete(d -> d.index(INDEX));
        }
        if (variant.equals("configured-smartcn")) {
            assertEquals(0, service.reindexUser(USER, List.of()));
        } else {
            String analyzer = variant.equals("standard") ? "standard" : "smartcn";
            client.indices().create(c -> c.index(INDEX)
                .settings(s -> s.numberOfShards("1").numberOfReplicas("0"))
                .mappings(m -> m
                    .properties("userId", p -> p.keyword(k -> k))
                    .properties("knowledgeBaseId", p -> p.keyword(k -> k))
                    .properties("title", p -> p.text(t -> t.analyzer(analyzer)))
                    .properties("contentPlain", p -> p.text(t -> t.analyzer(analyzer)))
                    .properties("content", p -> p.text(t -> t.analyzer(analyzer)))));
        }
    }

    private void validate(Corpus corpus) {
        assertTrue(corpus.queries().size() >= 30, "include varied representative cases");
        assertEquals(corpus.queries().size(), corpus.queries().stream().map(Question::id).distinct().count());
        Map<String, Document> docs = corpus.documents().stream().collect(Collectors.toMap(Document::id, d -> d));
        for (Question q : corpus.queries()) {
            for (String expected : q.expectedIds()) {
                Document doc = Objects.requireNonNull(docs.get(expected), expected);
                assertEquals("alice", doc.owner());
                assertEquals(q.knowledgeBase(), doc.knowledgeBase());
                assertFalse(q.evidence().isBlank());
                assertTrue(doc.content().contains(q.evidence()), q.id() + " missing labeled evidence");
            }
        }
    }

    private String markdown(Corpus corpus, List<Result> results, String hash) {
        StringBuilder out = new StringBuilder("# 检索质量初始评测\n\n")
            .append(corpus.description()).append("\n\n")
            .append(corpus.documents().size()).append(" 篇合成文档、")
            .append(corpus.queries().size()).append(" 个问题；三种分析器使用相同语料、用户过滤、知识库过滤及生产查询。")
            .append("上下文指标调用生产 RAG 拼装方法，未调用生成模型。测试成功表示评测运行和隔离检查通过，不表示质量达标。\n\n")
            .append("Hit@3 是有答案问题中前 3 条至少包含一篇标注资料的比例；MRR@3 反映首篇标注资料的位置。")
            .append("证据进入上下文要求标注资料被命中且标注原文出现在实际拼装上下文中，不等于模型回答正确。")
            .append("无答案仍给上下文记录的是资料误供给风险，不是已测得的幻觉率。\n\n")
            .append("| 分析器 | 类别 | 有答案问题 | Hit@3 | MRR@3 | 证据进入上下文 | 无答案仍给上下文 |\n")
            .append("|---|---|---:|---:|---:|---:|---:|\n");
        for (String variant : List.of("standard", "configured-smartcn", "builtin-smartcn")) {
            for (String category : List.of("all", "exact", "paraphrase", "technical", "long", "unanswerable")) {
                List<Result> rows = results.stream().filter(r -> r.variant().equals(variant)
                    && (category.equals("all") || r.category().equals(category))).toList();
                long positive = rows.stream().filter(Result::answerable).count();
                long hit = rows.stream().filter(Result::hitAt3).count();
                long evidence = rows.stream().filter(Result::evidenceInContext).count();
                long negative = rows.size() - positive;
                long offered = rows.stream().filter(Result::contextOnUnanswerable).count();
                out.append("| ").append(variant).append(" | ").append(category).append(" | ").append(positive)
                    .append(" | ").append(ratio(hit, positive)).append(" | ")
                    .append(positive == 0 ? "—" : String.format(Locale.ROOT, "%.3f", rows.stream()
                        .mapToDouble(Result::reciprocalRankAt3).sum() / positive))
                    .append(" | ").append(ratio(evidence, positive)).append(" | ")
                    .append(negative == 0 ? "—" : offered + "/" + negative).append(" |\n");
            }
        }
        out.append("\n## 逐题结果\n\n| 分析器 | 问题 | 命中 | 证据入上下文 | 返回文档 |\n|---|---|---|---|---|\n");
        for (Result r : results) {
            out.append("| ").append(r.variant()).append(" | ").append(r.questionId()).append(" ").append(r.query())
                .append(" | ").append(r.answerable() ? r.hitAt3() : "无答案题")
                .append(" | ").append(r.answerable() ? r.evidenceInContext() : "提供上下文=" + r.contextOnUnanswerable())
                .append(" | ").append(String.join(", ", r.returnedIds())).append(" |\n");
        }
        return out.append("\n语料 SHA-256：`").append(hash).append("`\n").toString();
    }

    private String ratio(long count, long total) {
        return total == 0 ? "—" : count + "/" + total + String.format(Locale.ROOT, " (%.1f%%)", 100.0 * count / total);
    }

    private static UUID id(String value) {
        return UUID.nameUUIDFromBytes(("komo-retrieval-evaluation:" + value).getBytes(StandardCharsets.UTF_8));
    }
}
