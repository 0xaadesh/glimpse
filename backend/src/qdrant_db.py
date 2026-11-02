from hashlib import sha256
from pathlib import Path
from uuid import UUID

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

import config
from embeddings import provider


class ImageVectorStore:
    def __init__(self):
        self.client = QdrantClient(
            url=config.QDRANT_URL
        )

        self.ensure_collection()

    # ---------------------------------------------------------
    # Collection
    # ---------------------------------------------------------

    def ensure_collection(self):
        collections = self.client.get_collections()

        exists = any(
            c.name == config.QDRANT_COLLECTION
            for c in collections.collections
        )

        if exists:
            # Vectors from a different embedding size cannot share a
            # collection. Fail early instead of on the first upsert.
            size = self.client.get_collection(
                config.QDRANT_COLLECTION
            ).config.params.vectors.size

            if size != config.EMBEDDING_DIMENSIONS:
                raise RuntimeError(
                    f"Qdrant collection '{config.QDRANT_COLLECTION}' has "
                    f"vector size {size}, but EMBEDDING_DIMENSIONS is "
                    f"{config.EMBEDDING_DIMENSIONS}. Use a new "
                    "QDRANT_COLLECTION and re-ingest."
                )

            return

        self.client.create_collection(
            collection_name=config.QDRANT_COLLECTION,
            vectors_config=VectorParams(
                size=config.EMBEDDING_DIMENSIONS,
                distance=Distance.COSINE,
            ),
        )

    # ---------------------------------------------------------
    # Stable ID
    # ---------------------------------------------------------

    @staticmethod
    def image_id(path: Path) -> str:
        """
        Deterministic UUID derived from image contents.
        Qdrant requires point IDs to be unsigned ints or UUIDs.
        """

        digest = sha256(path.read_bytes()).digest()
        return str(UUID(bytes=digest[:16], version=4))

    # ---------------------------------------------------------
    # Upsert
    # ---------------------------------------------------------

    def upsert(
        self,
        image_path: Path,
        semantic_document: str,
        metadata: dict,
    ):
        vector = provider.embed_document(
            semantic_document
        )

        point = PointStruct(
            id=self.image_id(image_path),
            vector=vector,
            payload={
                "filename": image_path.name,
                "image_path": str(image_path),

                "semantic_document": semantic_document,

                **metadata,
            },
        )

        self.client.upsert(
            collection_name=config.QDRANT_COLLECTION,
            points=[point],
        )

    # ---------------------------------------------------------
    # Search
    # ---------------------------------------------------------

    def search(
        self,
        query: str,
        limit: int = 10,
    ):
        vector = provider.embed_query(query)

        return self.client.query_points(
            collection_name=config.QDRANT_COLLECTION,
            query=vector,
            limit=limit,
        ).points

    # ---------------------------------------------------------
    # Delete
    # ---------------------------------------------------------

    def delete(
        self,
        image_path: Path,
    ):
        self.client.delete(
            collection_name=config.QDRANT_COLLECTION,
            points_selector=[
                self.image_id(image_path)
            ],
        )

    # ---------------------------------------------------------
    # Count
    # ---------------------------------------------------------

    def count(self):
        return self.client.count(
            config.QDRANT_COLLECTION,
            exact=True,
        ).count