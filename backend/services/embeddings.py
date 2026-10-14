"""The embedding model, chosen once per process.

Vectors from different models live in different spaces, and here in different
sizes too (Gemini's are 3072-d, the local model's 384-d), so one index can
never hold both. The model is picked at startup and never switched at runtime;
VectorStoreService keeps a separate Chroma collection per model.
"""
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from typing import Any, List, Optional, Tuple
import logging
import os
import re
import time

logger = logging.getLogger(__name__)

LOCAL_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_GEMINI_MODEL = "models/gemini-embedding-001"
# REST, not the SDK's default gRPC: Google's newer "AQ." auth keys are rejected
# over gRPC with 401 ACCESS_TOKEN_TYPE_UNSUPPORTED, and REST accepts both kinds.
GEMINI_TRANSPORT = "rest"
# The free tier allows 100 embedding requests a minute, and every text in a batch
# counts as one. Batches stay under that, and a 429 waits out the delay Google
# names instead of failing the upload.
EMBED_BATCH = 90
EMBED_ATTEMPTS = 4


# When the current rate-limit wait ends, so the upload progress can show it.
_wait_until = 0.0


def rate_limit_wait_remaining() -> float:
    return max(0.0, _wait_until - time.time())


def _retry_after(error: Exception) -> float:
    match = re.search(r"retry in ([0-9.]+)s", str(error)) or re.search(r"seconds: (\d+)", str(error))
    return min(float(match.group(1)) + 1 if match else 60.0, 65.0)


class GeminiEmbeddings(GoogleGenerativeAIEmbeddings):
    # langchain-google-genai 0.0.6's _embed swaps the task type it is given for
    # "retrieval_document", so questions were embedded as if they were
    # documents. Queries ask for "retrieval_query" directly.
    def embed_query(self, text: str) -> List[float]:
        return self._call(text, "retrieval_query")

    def embed_documents(self, texts: List[str], batch_size: int = EMBED_BATCH) -> List[List[float]]:
        vectors: List[List[float]] = []
        for i in range(0, len(texts), batch_size):
            vectors.extend(self._call(texts[i:i + batch_size], "retrieval_document"))
        return vectors

    def _call(self, content: Any, task_type: str) -> Any:
        for attempt in range(EMBED_ATTEMPTS):
            try:
                return genai.embed_content(model=self.model, content=content, task_type=task_type)["embedding"]
            except ResourceExhausted as e:
                if attempt == EMBED_ATTEMPTS - 1:
                    raise
                delay = _retry_after(e)
                global _wait_until
                _wait_until = time.time() + delay
                logger.warning(f"Gemini embedding quota hit; retrying in {delay:.0f}s")
                time.sleep(delay)


_chunking_model: Optional[Any] = None


def _local_chunking_model() -> Optional[Any]:
    global _chunking_model
    if _chunking_model is None:
        try:
            from langchain_community.embeddings import HuggingFaceEmbeddings
            _chunking_model = HuggingFaceEmbeddings(
                model_name=LOCAL_MODEL,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
        except Exception as e:  # sentence-transformers missing or model unavailable
            logger.warning(f"Local chunking model unavailable ({e}); chunking with Gemini")
            return None
    return _chunking_model


class _ChunkingEmbeddings:
    """Embeds sentences with the local model, loaded on first use (not at import,
    so the API starts as fast as before), falling back to Gemini if it can't load."""

    def __init__(self, gemini: "GeminiEmbeddings"):
        self.gemini = gemini

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return (_local_chunking_model() or self.gemini).embed_documents(texts)


def chunking_embeddings(embeddings: Any) -> Any:
    """The model the semantic chunker compares sentences with.

    Chunking embeds every sentence of every page only to find topic shifts, which
    would spend hundreds of Gemini requests per PDF (the free tier allows 100 a
    minute). Any sentence encoder finds the same shifts, so with Gemini the local
    model does it offline; the chunks themselves are still indexed with Gemini.
    """
    return _ChunkingEmbeddings(embeddings) if isinstance(embeddings, GeminiEmbeddings) else embeddings


def load_embeddings() -> Tuple[Any, str]:
    """Return (embeddings, model name) as configured by EMBEDDING_MODEL.

    EMBEDDING_MODEL=local runs offline on a sentence-transformers model; any
    other value names a Gemini embedding model. Unset: Gemini when
    GEMINI_API_KEY is set, local otherwise.
    """
    model = os.getenv("EMBEDDING_MODEL") or (DEFAULT_GEMINI_MODEL if os.getenv("GEMINI_API_KEY") else "local")
    if model == "local":
        # Imported here: sentence-transformers pulls in torch, which a
        # Gemini-only process never needs to load.
        from langchain_community.embeddings import HuggingFaceEmbeddings

        embeddings = HuggingFaceEmbeddings(
            model_name=LOCAL_MODEL,
            model_kwargs={'device': 'cpu'},
            encode_kwargs={'normalize_embeddings': True}
        )
        return embeddings, LOCAL_MODEL
    return GeminiEmbeddings(  # type: ignore[call-arg]
        model=model, google_api_key=os.getenv("GEMINI_API_KEY"), transport=GEMINI_TRANSPORT
    ), model
