"""Immutable Qdrant revisions + scoped BM25 + dense recall + RRF.

The caller must supply the current authorized manifest. There is deliberately no
unscoped search API. Failed indexing cannot publish a completion marker.
"""
from dataclasses import asdict
from contextlib import contextmanager
from functools import lru_cache
from hashlib import sha256
import os
import threading
from time import monotonic
from uuid import NAMESPACE_URL, uuid5

from qdrant_client import QdrantClient, models
from qdrant_client.local.qdrant_local import QdrantLocal

from app.reading.core import Document, split_document
from .embedding import LocalEmbedding
from .lexical import bm25, fuse, tokenize, identifier_matches

MAX_CHUNKS = 20000


def revision(document: Document) -> str:
    return sha256((document.title + "\0" + document.content).encode()).hexdigest()


def point_id(user: str, key: str, suffix: str) -> str:
    return str(uuid5(NAMESPACE_URL, user + ":" + key + ":" + suffix))


class HybridRetrieval:
    def __init__(self, client, embedding, collection=None):
        self.client, self.embedding = client, embedding
        signature = sha256((embedding.identity + ":chunk1600-jieba-v1").encode()).hexdigest()[:12]
        self.collection = collection or "komo_chunks_" + signature
        self._lock = threading.RLock()
        self._ready = False

    @contextmanager
    def _work(self):
        if not self._lock.acquire(timeout=2):
            raise TimeoutError("Retrieval worker is busy")
        try:
            yield
        finally:
            self._lock.release()

    def _ensure(self):
        if self._ready:
            return
        # Load model before choosing collection dimensions; no silent model substitution.
        probe = self.embedding.vectors(["初始化"])[0]
        if not self.client.collection_exists(self.collection):
            try:
                self.client.create_collection(self.collection,
                    vectors_config=models.VectorParams(size=len(probe), distance=models.Distance.COSINE))
            except Exception:
                if not self.client.collection_exists(self.collection):
                    raise
        info = self.client.get_collection(self.collection)
        if info.config.params.vectors.size != len(probe):
            raise ValueError("Embedding dimension differs from stored collection")
        # Payload indexes accelerate the mandatory filters on the server.
        if not isinstance(self.client._client, QdrantLocal):
            for field in ("user_id", "key", "kind"):
                self.client.create_payload_index(self.collection, field, models.PayloadSchemaType.KEYWORD, wait=True)
        self._ready = True

    def missing(self, user: str, manifest: list[dict]) -> list[str]:
        with self._work():
            self._ensure()
            ids = [point_id(user, m["id"] + ":" + m["revision"], "complete") for m in manifest]
            found = set()
            for start in range(0, len(ids), 128):
                found.update(str(p.id) for p in self.client.retrieve(self.collection, ids[start:start + 128],
                                                                    with_payload=False))
            return [m["id"] for m, pid in zip(manifest, ids) if pid not in found]

    def index(self, user: str, document: Document):
        with self._work():
            self._ensure()
            rev = revision(document)
            if not self.missing(user, [{"id": document.id, "revision": rev}]):
                return
            chunks = split_document(document.content)
            key = document.id + ":" + rev
            deadline = monotonic() + 80
            for offset in range(0, len(chunks), 16):
                if monotonic() > deadline:
                    raise TimeoutError("Indexing budget exceeded; completed chunks can be resumed")
                numbers = list(range(offset, min(offset + 16, len(chunks))))
                ids = [point_id(user, key, str(n)) for n in numbers]
                existing = {str(p.id) for p in self.client.retrieve(self.collection, ids, with_payload=False)}
                numbers = [n for n, pid in zip(numbers, ids) if pid not in existing]
                batch = [chunks[n] for n in numbers]
                if not batch:
                    continue
                vectors = self.embedding.vectors([document.title + "\n" + c.heading + "\n" + c.text for c in batch])
                if len(vectors) != len(batch):
                    raise ValueError("Incomplete embedding batch")
                points = []
                for number, chunk, vector in zip(numbers, batch, vectors):
                    payload = {**asdict(chunk), "user_id": user, "key": key, "kind": "chunk",
                               "document_id": document.id, "revision": rev, "title": document.title,
                               "chunk_index": number,
                               "terms": tokenize(document.title + "\n" + chunk.heading + "\n" + chunk.text)}
                    points.append(models.PointStruct(id=point_id(user, key, str(number)), vector=vector, payload=payload))
                self.client.upsert(self.collection, points, wait=True)
            # Publish only after all chunks succeeded. A retry deterministically overwrites partial points.
            self.client.upsert(self.collection, [models.PointStruct(id=point_id(user, key, "complete"),
                vector=[0.0] * self.embedding.dimension,
                payload={"user_id": user, "key": key, "kind": "complete"})], wait=True)

    def _filter(self, user, manifest):
        return models.Filter(must=[
            models.FieldCondition(key="user_id", match=models.MatchValue(value=user)),
            models.FieldCondition(key="kind", match=models.MatchValue(value="chunk")),
            models.FieldCondition(key="key", match=models.MatchAny(any=[m["id"] + ":" + m["revision"] for m in manifest]))])

    def search(self, user: str, manifest: list[dict], query: str, limit=12, strategy="hybrid") -> list[dict]:
        if not manifest:
            return []
        with self._work():
            if self.missing(user, manifest):
                raise ValueError("Current revisions are not indexed")
            scope = self._filter(user, manifest)
            records, offset = [], None
            while True:
                page, offset = self.client.scroll(self.collection, scroll_filter=scope, limit=256,
                                                  offset=offset, with_vectors=False)
                records.extend(page)
                if len(records) > MAX_CHUNKS:
                    raise ValueError("Retrieval scope exceeds chunk limit")
                if offset is None:
                    break
            # BM25 statistics come exclusively from this user's authorized current revisions.
            records.sort(key=lambda p: str(p.id))
            payloads = {str(p.id): p.payload for p in records}
            lexical = bm25(query, [p.payload["terms"] for p in records])[:40] if strategy != "dense" else []
            lexical_ids = [str(records[i].id) for i, _ in lexical]
            dense = []
            if strategy != "lexical":
                vector = self.embedding.vectors([query], query=True)[0]
                dense = self.client.query_points(self.collection, query=vector, query_filter=scope,
                                                 limit=40, with_payload=False).points
            dense_ids = [str(p.id) for p in dense]
            ranks = [lexical_ids, dense_ids] if strategy == "hybrid" else [lexical_ids if strategy == "lexical" else dense_ids]
            output = []
            ranked = fuse(ranks)
            if strategy == "hybrid":
                ranked.sort(key=lambda item: (-identifier_matches(query, payloads[item[0]]["title"] + "\n" + payloads[item[0]]["heading"]),
                                               -item[1], item[0]))
            for pid, score in ranked[:limit]:
                p = payloads[pid]
                output.append({k: v for k, v in p.items() if k not in {"terms", "user_id", "kind", "key"}} | {
                    "score": score, "lexical_rank": lexical_ids.index(pid) + 1 if pid in lexical_ids else None,
                    "dense_rank": dense_ids.index(pid) + 1 if pid in dense_ids else None})
            return output

    def prune(self, user: str, manifest: list[dict]) -> int:
        """Remove only obsolete versions visible at start, never a shared collection."""
        with self._work():
            self._ensure()
            keep = {m["id"] + ":" + m["revision"] for m in manifest}
            scope = models.Filter(must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=user))])
            stale, offset = [], None
            while True:
                page, offset = self.client.scroll(self.collection, scroll_filter=scope, offset=offset, limit=256)
                stale.extend(p.id for p in page if p.payload["key"] not in keep)
                if offset is None:
                    break
            for start in range(0, len(stale), 128):
                self.client.delete(self.collection, models.PointIdsList(points=stale[start:start + 128]), wait=True)
            return len(stale)


@lru_cache(maxsize=1)
def get_retrieval():
    client = QdrantClient(url=os.getenv("QDRANT_URL", "http://127.0.0.1:6333"),
                          api_key=os.getenv("QDRANT_API_KEY") or None, timeout=30)
    return HybridRetrieval(client, LocalEmbedding())
