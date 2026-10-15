ARG BASE_IMAGE=docker.elastic.co/elasticsearch/elasticsearch:8.12.0
FROM ${BASE_IMAGE}

# KnowledgeIndexService uses smartcn_tokenizer when creating a new index.
RUN bin/elasticsearch-plugin install --batch analysis-smartcn
