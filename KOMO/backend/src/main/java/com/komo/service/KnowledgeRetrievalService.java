package com.komo.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.komo.entity.KnowledgeEntry;
import com.komo.exception.BusinessException;
import com.komo.exception.ErrorCode;
import com.komo.repository.KnowledgeRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/** PostgreSQL is authoritative. Python owns indexing, retrieval and ranking. */
@Service
public class KnowledgeRetrievalService {
    private static final Logger log = LoggerFactory.getLogger(KnowledgeRetrievalService.class);
    private final KnowledgeRepository repository;
    private final RestTemplate http;
    @Value("${komo.ai.base-url}") private String aiBaseUrl;
    @Value("${komo.ai.internal-token:}") private String internalToken;

    public KnowledgeRetrievalService(KnowledgeRepository repository, RestTemplate http) {
        this.repository = repository;
        this.http = http;
    }

    record Revision(@NotBlank String id, @NotBlank String revision) {}
    record Scope(@NotBlank String user_id, @NotNull @Size(max=500) List<@Valid Revision> manifest) {}
    record Document(@NotBlank String id, @NotBlank @Size(max=500) String title,
                    @NotBlank @Size(max=2_000_000) String content) {}
    record IndexRequest(@NotBlank String user_id, @NotNull @Valid Document document) {}
    record SearchRequest(@NotBlank String user_id, @NotNull @Size(max=500) List<@Valid Revision> manifest,
                         @NotBlank @Size(max=20000) String query, @Min(1) @Max(40) int limit) {}

    public List<Map<String, Object>> search(UUID userId, String query, int size, UUID kbId) {
        Objects.requireNonNull(userId, "userId");
        try {
            List<KnowledgeEntry> entries = currentEntries(userId, kbId);
            if (entries.isEmpty()) return List.of();
            Scope scope = synchronize(userId, entries);
            JsonNode response = post("/search", new SearchRequest(userId.toString(), scope.manifest(), query, Math.min(size, 40)));
            if (!response.path("hits").isArray()) throw new IllegalStateException("Missing retrieval hits");
            Map<String, KnowledgeEntry> snapshots = new HashMap<>();
            entries.forEach(e -> snapshots.put(e.getId().toString(), e));
            List<UUID> ids = new ArrayList<>();
            for (JsonNode hit : response.path("hits")) {
                String id = hit.path("document_id").asText();
                if (!snapshots.containsKey(id)) throw new IllegalStateException("Unrequested retrieval document");
                ids.add(UUID.fromString(id));
            }
            Map<String, KnowledgeEntry> current = new HashMap<>();
            if (!ids.isEmpty()) repository.findAllByIdsAndUserId(ids, userId).forEach(e -> current.put(e.getId().toString(), e));
            List<Map<String, Object>> hits = new ArrayList<>();
            for (JsonNode hit : response.path("hits")) {
                String id = hit.path("document_id").asText();
                KnowledgeEntry entry = current.get(id);
                if (entry == null || !userId.equals(entry.getUserId()) || entry.getDeletedAt() != null
                    || (kbId != null && !kbId.equals(entry.getKnowledgeBaseId()))
                    || !revision(entry).equals(hit.path("revision").asText())) continue;
                String body = entry.getContent();
                int start = hit.path("start_offset").asInt(-1), end = hit.path("end_offset").asInt(-1);
                int count = body.codePointCount(0, body.length());
                if (start < 0 || end <= start || end > count) throw new IllegalStateException("Invalid retrieval range");
                String original = body.substring(body.offsetByCodePoints(0, start), body.offsetByCodePoints(0, end));
                if (!original.equals(hit.path("text").asText())) throw new IllegalStateException("Forged retrieval text");
                hits.add(Map.of("_id", id, "_score", hit.path("score").asDouble(), "title", entry.getTitle(),
                    "content", original, "contentPlain", original, "revision", revision(entry),
                    "startLine", hit.path("start_line").asInt(), "endLine", hit.path("end_line").asInt()));
            }
            return hits;
        } catch (Exception e) {
            log.error("Hybrid retrieval failed userId={}", userId, e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "知识检索未完成，请稍后重试");
        }
    }

    public List<Map<String, Object>> findSimilar(UUID userId, String title, String content, int size) {
        String query = Objects.toString(title, "") + "\n" + Objects.toString(content, "");
        List<Map<String, Object>> chunks = search(userId, query.substring(0, Math.min(query.length(), 20000)), 40, null);
        Map<String, Map<String, Object>> unique = new LinkedHashMap<>();
        chunks.forEach(hit -> unique.putIfAbsent((String) hit.get("_id"), hit));
        return unique.values().stream().limit(size).toList();
    }

    public int reindexUser(UUID userId) {
        try {
            List<KnowledgeEntry> entries = currentEntries(userId, null);
            Scope scope = synchronize(userId, entries);
            post("/prune", scope);
            return entries.size();
        } catch (Exception e) {
            log.error("Retrieval rebuild failed userId={}", userId, e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "检索索引重建未完成，请稍后重试");
        }
    }

    private List<KnowledgeEntry> currentEntries(UUID userId, UUID kbId) {
        var page = repository.findByUserIdAndFilters(userId, null, kbId, null, PageRequest.of(0, 501));
        if (page.getTotalElements() > 500) throw new IllegalStateException("Retrieval scope exceeds 500 documents");
        List<KnowledgeEntry> entries = page.getContent().stream()
            .filter(e -> e.getDeletedAt() == null && e.getContent() != null && !e.getContent().isBlank()).toList();
        long chars = 0;
        for (KnowledgeEntry entry : entries) {
            if (!userId.equals(entry.getUserId()) || (kbId != null && !kbId.equals(entry.getKnowledgeBaseId()))) {
                throw new IllegalStateException("Invalid retrieval ownership");
            }
            chars += entry.getContent().length();
        }
        if (chars > 20_000_000) throw new IllegalStateException("Retrieval scope exceeds character limit");
        return entries;
    }

    private Scope synchronize(UUID userId, List<KnowledgeEntry> entries) {
        Scope scope = new Scope(userId.toString(), entries.stream().map(e -> new Revision(e.getId().toString(), revision(e))).toList());
        JsonNode missing = post("/missing", scope).path("missing");
        if (!missing.isArray()) throw new IllegalStateException("Invalid missing revision response");
        Map<String, KnowledgeEntry> allowed = new HashMap<>();
        entries.forEach(e -> allowed.put(e.getId().toString(), e));
        for (JsonNode id : missing) {
            KnowledgeEntry e = allowed.get(id.asText());
            if (e == null) throw new IllegalStateException("Unrequested indexing document");
            JsonNode result = post("/index", new IndexRequest(userId.toString(), new Document(e.getId().toString(), e.getTitle(), e.getContent())));
            if (!result.path("indexed").asBoolean()) throw new IllegalStateException("Indexing did not complete");
        }
        return scope;
    }

    private JsonNode post(String path, Object body) {
        if (internalToken == null || internalToken.length() < 32) throw new IllegalStateException("Internal token is not configured");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Token", internalToken);
        JsonNode result = http.postForObject(aiBaseUrl + "/api/retrieval" + path, new HttpEntity<>(body, headers), JsonNode.class);
        if (result == null) throw new IllegalStateException("Empty retrieval response");
        return result;
    }

    static String revision(KnowledgeEntry entry) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest((entry.getTitle() + "\0" + entry.getContent()).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
