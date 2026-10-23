"""Chinese/identifier-aware BM25 and rank fusion over an authorized corpus."""
from collections import Counter
import math
import re

import jieba


def tokenize(text: str) -> list[str]:
    # Keep exact identifiers (including punctuation) alongside Chinese search words.
    tokens = re.findall(r"[a-z0-9_+#.-]+", text.lower())
    for run in re.findall(r"[\u3400-\u9fff]+", text):
        tokens.extend(jieba.cut_for_search(run, HMM=False))
    return [t for t in tokens if t.strip()]


def bm25(query: str, documents: list[list[str]], k1=1.2, b=0.75) -> list[tuple[int, float]]:
    if not documents:
        return []
    words = set(tokenize(query))
    counts = [Counter(d) for d in documents]
    avg = sum(map(len, documents)) / len(documents) or 1
    frequency = Counter()
    for count in counts:
        frequency.update(words & count.keys())
    idf = {w: math.log(1 + (len(documents) - frequency[w] + .5) / (frequency[w] + .5)) for w in words}
    scores = []
    for i, count in enumerate(counts):
        score = sum(idf[w] * count[w] * (k1 + 1)
                    / (count[w] + k1 * (1 - b + b * len(documents[i]) / avg))
                    for w in words if count[w])
        if score > 0:
            scores.append((i, score))
    return sorted(scores, key=lambda item: (-item[1], item[0]))


def fuse(rankings: list[list[str]], k=60) -> list[tuple[str, float]]:
    scores = Counter()
    for ranking in rankings:
        for rank, key in enumerate(dict.fromkeys(ranking), 1):
            scores[key] += 1 / (k + rank)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


def identifier_matches(query: str, heading: str) -> int:
    """Explicit code-like identifiers in a heading outrank merely related topics."""
    identifiers = {t for t in re.findall(r"[a-zA-Z][a-zA-Z0-9_+#.-]*", query)
                   if any(c.isdigit() or c in '_+#.' for c in t)}
    heading_terms = set(tokenize(heading))
    return sum(t.lower() in heading_terms for t in identifiers)
