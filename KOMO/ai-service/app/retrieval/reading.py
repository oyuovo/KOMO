import asyncio

from app.reading.core import CONTEXT_CHARS, prepare_reading
from .engine import get_retrieval, revision


async def search_document(document, query, user_id):
    """Tool scope is bound by the caller, never accepted from model arguments."""
    if not user_id:
        raise ValueError("Reading retrieval requires an authorized user")
    def retrieve():
        engine = get_retrieval()
        engine.index(user_id, document)
        return engine.search(user_id, [{"id": document.id, "revision": revision(document)}], query, 24)
    return await asyncio.to_thread(retrieve)


async def prepare_hybrid(document, question, history=None, selection="", user_id=""):
    if len(document.content) <= CONTEXT_CHARS:
        return prepare_reading(document, question, history, selection)
    if not user_id:
        raise ValueError("Reading retrieval requires an authorized user")

    # Recent user questions resolve simple follow-ups without treating AI replies as evidence.
    previous = [m["content"] for m in (history or []) if m.get("role") == "user"][-2:]
    query = "\n".join([*previous, selection, question])[-6000:]
    hits = await search_document(document, query, user_id)
    prepared = prepare_reading(document, question, history, selection,
                               ranked_indices=[h["chunk_index"] for h in hits])
    prepared.context["retrieval"] = {
        "strategy": "bm25-dense-rrf-v1",
        "candidates": [{k: h[k] for k in ("chunk_index", "score", "lexical_rank", "dense_rank")} for h in hits]}
    return prepared
