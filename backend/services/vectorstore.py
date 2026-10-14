import os
import re
from typing import Callable, List, Optional, Set

# Chroma's anonymized telemetry is off unless the environment turns it on.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

from langchain_community.vectorstores import Chroma
from langchain.schema import Document
from services.embeddings import EMBED_BATCH, load_embeddings

class VectorStoreService:
    def __init__(self):
        self.embeddings, self.embedding_model = load_embeddings()
        # One collection per embedding model, e.g. documents-gemini-embedding-001:
        # vectors from different models can't share an index, so switching
        # EMBEDDING_MODEL uses (or starts) that model's own collection.
        name = re.sub(r"[^A-Za-z0-9._-]", "-", self.embedding_model.split("/")[-1])
        self.vectorstore = Chroma(
            persist_directory=os.getenv("CHROMA_PERSIST_DIRECTORY", "./data/vectorstore"),
            embedding_function=self.embeddings,
            collection_name=f"documents-{name}"
        )
    
    def add_documents(self, documents: List[Document], source: str,
                      on_progress: Optional[Callable[[int, int], None]] = None) -> None:
        """Index a document's chunks, replacing any previously indexed version.

        Chunks are embedded in batches so on_progress(done, total) can report
        progress; if any batch fails, the batches already added are removed.
        """
        for doc in documents:
            doc.metadata["source"] = source

        # Old chunks go only after the new ones are in, so a failed
        # re-index leaves the previous version searchable.
        old_ids = self.vectorstore.get(where={"source": source})["ids"]
        added: List[str] = []
        try:
            for i in range(0, len(documents), EMBED_BATCH):
                added += self.vectorstore.add_documents(documents[i:i + EMBED_BATCH])
                if on_progress:
                    on_progress(min(i + EMBED_BATCH, len(documents)), len(documents))
        except Exception:
            if added:
                self.vectorstore.delete(ids=added)
            raise
        if old_ids:
            self.vectorstore.delete(ids=old_ids)
        self.vectorstore.persist()
    
    def indexed_sources(self) -> Set[str]:
        """Names of the documents that have chunks in this model's collection"""
        return {m["source"] for m in self.vectorstore.get(include=["metadatas"])["metadatas"]}

    def get_retriever(self, k: int = 4):
        """Get a retriever for querying"""
        return self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": k}
        )
    
    def delete_document(self, source: str):
        """Delete a document's chunks"""
        ids = self.vectorstore.get(where={"source": source})["ids"]
        if ids:
            self.vectorstore.delete(ids=ids)
            self.vectorstore.persist()
