package com.komo.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import com.komo.entity.KnowledgeEntry;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Opt-in real ES regression: build the compose elasticsearch image, then run
 * mvn -Dtest=KnowledgeIndexServiceIT test. All data lives in a disposable container.
 */
class KnowledgeIndexServiceIT {
    private static final String INDEX = KnowledgeIndexService.INDEX_NAME;
    private static final String TEXT = "database transaction isolation consistency";
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

    @BeforeAll
    static void startIsolatedElasticsearch() {
        ES.start();
        transport = new RestClientTransport(RestClient.builder(
            new HttpHost(ES.getHost(), ES.getMappedPort(9200), "http")).build(), new JacksonJsonpMapper());
        client = new ElasticsearchClient(transport);
        service = new KnowledgeIndexService(client);
    }

    @AfterAll
    static void stopIsolatedElasticsearch() throws IOException {
        try {
            if (transport != null) {
                transport.close();
            }
        } finally {
            ES.stop();
        }
    }

    @ParameterizedTest(name = "search, dedup and scoped rebuild with legacy mapping = {0}")
    @ValueSource(booleans = {false, true})
    void searchAndRebuildPreserveUserAndKnowledgeBaseIsolation(boolean legacy) throws Exception {
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();
        UUID kb = UUID.randomUUID();
        if (client.indices().exists(e -> e.index(INDEX)).value()) {
            // Only this test's ephemeral container is ever connected here.
            client.indices().delete(d -> d.index(INDEX));
        }
        if (legacy) {
            client.indices().create(c -> c.index(INDEX)
                .settings(s -> s.numberOfShards("1").numberOfReplicas("0")));
        } else {
            // Exercise the actual SmartCN mapping creation, not a test imitation.
            assertEquals(0, service.reindexUser(alice, List.of()));
        }
        client.indices().putSettings(p -> p.index(INDEX).settings(s -> s.refreshInterval(t -> t.time("-1"))));

        KnowledgeEntry first = entry(alice, kb);
        KnowledgeEntry second = entry(alice, UUID.randomUUID());
        KnowledgeEntry foreign = entry(bob, kb);
        index(first);
        index(second);
        index(foreign);
        client.indices().refresh(r -> r.index(INDEX));

        var properties = client.indices().getMapping(m -> m.index(INDEX)).result().get(INDEX)
            .mappings().properties();
        assertEquals(legacy, properties.get("userId").isText());
        assertEquals(!legacy, properties.get("knowledgeBaseId").isKeyword());
        if (!legacy) {
            var tokens = client.indices().analyze(a -> a.index(INDEX).analyzer("smart_cn").text("数据库事务隔离"));
            assertFalse(tokens.tokens().isEmpty());
        }
        assertEquals(Set.of(first.getId().toString()), ids(service.search(alice, TEXT, 10, kb)));
        assertEquals(Set.of(first.getId().toString(), second.getId().toString()),
            ids(service.search(alice, TEXT, 10, null)));
        assertEquals(Set.of(foreign.getId().toString()), ids(service.search(bob, TEXT, 10, null)));
        assertTrue(service.search(UUID.randomUUID(), TEXT, 10, null).isEmpty());
        assertEquals(Set.of(first.getId().toString(), second.getId().toString()),
            ids(service.findSimilar(alice, TEXT, TEXT, 10)));
        assertEquals(Set.of(foreign.getId().toString()), ids(service.findSimilar(bob, TEXT, TEXT, 10)));

        var bobBefore = client.get(g -> g.index(INDEX).id(foreign.getId().toString()), Map.class);
        KnowledgeEntry stale = entry(alice, kb);
        index(stale); // Deliberately unrefreshed: rebuild must also remove this old document.
        first.setContentPlain(TEXT + " updated");
        first.setContent(first.getContentPlain());
        KnowledgeEntry added = entry(alice, kb);
        assertEquals(2, service.reindexUser(alice, List.of(first, added)));

        assertEquals(Set.of(first.getId().toString(), added.getId().toString()),
            ids(service.search(alice, TEXT, 10, kb)));
        assertFalse(client.exists(e -> e.index(INDEX).id(second.getId().toString())).value());
        assertFalse(client.exists(e -> e.index(INDEX).id(stale.getId().toString())).value());
        assertEquals(first.getContentPlain(), client.get(g -> g.index(INDEX).id(first.getId().toString()),
            Map.class).source().get("contentPlain"));
        var bobAfter = client.get(g -> g.index(INDEX).id(foreign.getId().toString()), Map.class);
        assertTrue(bobAfter.found());
        assertEquals(bobBefore.source(), bobAfter.source());
        assertEquals(bobBefore.seqNo(), bobAfter.seqNo());
        assertEquals(Set.of(foreign.getId().toString()), ids(service.search(bob, TEXT, 10, kb)));

        assertEquals(0, service.reindexUser(alice, List.of()));
        assertTrue(service.search(alice, TEXT, 10, null).isEmpty());
        assertEquals(1L, client.count(c -> c.index(INDEX)).count());
        assertEquals(Set.of(foreign.getId().toString()), ids(service.findSimilar(bob, TEXT, TEXT, 10)));
    }

    private KnowledgeEntry entry(UUID owner, UUID kb) {
        KnowledgeEntry entry = KnowledgeEntry.builder().userId(owner).knowledgeBaseId(kb)
            .title(TEXT).content(TEXT).contentPlain(TEXT).build();
        entry.setId(UUID.randomUUID());
        return entry;
    }

    private void index(KnowledgeEntry entry) {
        service.indexEntry(entry.getId(), entry.getUserId(), entry.getKnowledgeBaseId(),
            entry.getTitle(), entry.getContentPlain(), entry.getContent());
    }

    private Set<String> ids(List<Map<String, Object>> results) {
        return results.stream().map(r -> (String) r.get("_id")).collect(Collectors.toSet());
    }
}
