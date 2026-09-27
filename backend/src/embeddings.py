from google import genai
from google.genai import types

import config


class GeminiEmbeddingProvider:
    """
    Wrapper around Gemini Embedding API.

    This class is the only place in the project that knows
    how Gemini works.
    """

    def __init__(self):
        self.client = genai.Client(
            api_key=config.GEMINI_API_KEY
        )

    def embed_document(self, document: str) -> list[float]:
        """
        Generate an embedding for a semantic document.
        """

        response = self.client.models.embed_content(
            model=config.EMBEDDING_MODEL,
            contents=document,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=config.EMBEDDING_DIMENSIONS,
            ),
        )

        return response.embeddings[0].values

    def embed_query(self, query: str) -> list[float]:
        """
        Generate an embedding for a search query.
        """

        response = self.client.models.embed_content(
            model=config.EMBEDDING_MODEL,
            contents=query,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=config.EMBEDDING_DIMENSIONS,
            ),
        )

        return response.embeddings[0].values

    def embed_documents(
        self,
        documents: list[str],
    ) -> list[list[float]]:
        """
        Batch embedding.

        Useful when ingesting hundreds of images.
        """

        response = self.client.models.embed_content(
            model=config.EMBEDDING_MODEL,
            contents=documents,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=config.EMBEDDING_DIMENSIONS,
            ),
        )

        return [
            embedding.values
            for embedding in response.embeddings
        ]


provider = GeminiEmbeddingProvider()