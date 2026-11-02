from openai import OpenAI

import config


class OpenRouterEmbeddingProvider:
    """
    Wrapper around the OpenRouter Embeddings API.

    This class is the only place in the project that knows
    how the embedding provider works.

    OpenAI embedding models have no separate query/document
    task types, so queries and documents are embedded the same way.
    """

    def __init__(self):
        self.client = OpenAI(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL,
        )

    def _embed(self, contents: list[str]) -> list[list[float]]:
        response = self.client.embeddings.create(
            model=config.EMBEDDING_MODEL,
            input=contents,
            dimensions=config.EMBEDDING_DIMENSIONS,
        )

        return [
            item.embedding
            for item in sorted(response.data, key=lambda d: d.index)
        ]

    def embed_document(self, document: str) -> list[float]:
        """
        Generate an embedding for a semantic document.
        """

        return self._embed([document])[0]

    def embed_query(self, query: str) -> list[float]:
        """
        Generate an embedding for a search query.
        """

        return self._embed([query])[0]

    def embed_documents(
        self,
        documents: list[str],
    ) -> list[list[float]]:
        """
        Batch embedding.

        Useful when ingesting hundreds of images.
        """

        return self._embed(documents)


provider = OpenRouterEmbeddingProvider()
