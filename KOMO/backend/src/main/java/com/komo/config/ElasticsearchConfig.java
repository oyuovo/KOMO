package com.komo.config;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.elasticsearch.client.RestClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Elasticsearch 客户端配置。
 * 连接地址由 komo.es.host/port/scheme 配置（默认 localhost:9201），使用 Basic Auth 认证。
 */
@Configuration
public class ElasticsearchConfig {

    @Value("${komo.es.host:localhost}")
    private String host;

    @Value("${komo.es.port:9201}")
    private int port;

    @Value("${komo.es.scheme:http}")
    private String scheme;

    @Value("${komo.es.username:elastic}")
    private String username;

    @Value("${komo.es.password}")
    private String password;

    @Bean
    public ElasticsearchClient elasticsearchClient() {
        BasicCredentialsProvider credentialsProvider = new BasicCredentialsProvider();
        credentialsProvider.setCredentials(
            AuthScope.ANY,
            new UsernamePasswordCredentials(username, password)
        );

        RestClient restClient = RestClient.builder(
            new HttpHost(host, port, scheme)
        ).setHttpClientConfigCallback(hcb ->
            hcb.setDefaultCredentialsProvider(credentialsProvider)
        ).build();

        RestClientTransport transport = new RestClientTransport(
            restClient,
            new JacksonJsonpMapper()
        );

        return new ElasticsearchClient(transport);
    }
}
