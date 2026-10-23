"""Local ONNX embeddings; download happens only when retrieval is first used."""
import os
import threading
import logging

import numpy as np


class LocalEmbedding:
    def __init__(self):
        self.name = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5")
        self.dimension = 512
        self.identity = self.name + ":token-windows-v1"
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        if self._model is None:
            from fastembed import TextEmbedding
            options = dict(cache_dir=os.getenv("EMBEDDING_CACHE_DIR", ".cache/embeddings"),
                           threads=int(os.getenv("EMBEDDING_THREADS", "2")))
            try:
                self._model = TextEmbedding(self.name, local_files_only=True, **options)
            except (ValueError, OSError):
                if os.getenv("EMBEDDING_ALLOW_DOWNLOAD", "true").lower() != "true":
                    raise
                logging.getLogger(__name__).info("Embedding cache unavailable; downloading configured model %s", self.name)
                self._model = TextEmbedding(self.name, **options)
            self.dimension = next(m["dim"] for m in TextEmbedding.list_supported_models() if m["model"] == self.name)
        return self._model

    def vectors(self, texts: list[str], query=False) -> list[list[float]]:
        # Bounded windows avoid silently embedding only the start of long chunks.
        # Pool windows across the entire chunk instead of truncating the tail.
        with self._lock:
            model = self._load()
            windows, groups = [], []
            for text in texts:
                parts = [text[i:i + 200] for i in range(0, len(text), 200)] or [""]
                groups.append(len(parts))
                windows.extend(parts)
            method = model.query_embed if query else model.passage_embed
            encoded = list(method(windows, batch_size=32))
            result, offset = [], 0
            for count in groups:
                vector = np.mean(encoded[offset:offset + count], axis=0)
                vector /= max(float(np.linalg.norm(vector)), 1e-12)
                result.append(vector.tolist())
                offset += count
            return result
