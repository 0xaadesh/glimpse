# Glimpse: Viva Preparation Notes

Part A explains how the project works: how an image gets ingested and how search finds it. Part B lists questions an examiner is likely to ask, with short answers. The frontend is treated as a thin client throughout; the interesting work happens in the backend pipeline.

---

# Part A: How Glimpse Works

## 1. What the Project Is

Glimpse is a **semantic image search engine**. You search your images by describing them in plain language, for example "family celebrating a birthday" or "someone looking nervous in a meeting", instead of by filename or hand-typed tags.

Computers cannot compare a sentence to a picture directly. Glimpse solves this in two moves:

1. **Turn every image into text.** When an image is uploaded, a vision language model (GLM 5.3 Flash, `z-ai/glm-5.3-flash`) looks at it and writes detailed, structured metadata: what is in it, what is happening, the mood, the concepts, and the phrases someone would type to find it.
2. **Search that text by meaning.** The text is converted into an **embedding**, a list of 1536 numbers that captures its meaning (model: OpenAI `text-embedding-3-small`). Embeddings are stored in **Qdrant**, a vector database. A search query is converted into an embedding the same way, and Qdrant returns the images whose embeddings are closest to it.

The one-line summary: **Glimpse converts image search into text search, and solves text search with embeddings.**

Both AI models are reached through **OpenRouter**, a gateway that offers many models behind one OpenAI-compatible API and one API key.

## 2. Architecture

```text
 Browser (Next.js app, port 3000)
   │   calls /api/* and /images/* on its own origin
   │   (Next.js rewrites forward them to the backend: a reverse proxy)
   ▼
 FastAPI backend (port 8000)          Typer CLI (same pipeline, no web)
   │                 │                   │
   ▼                 ▼                   ▼
 OpenRouter        OpenRouter          Qdrant (Docker, port 6333)
 vision model      embedding model     vectors + payload
   │
   ▼
 backend/data/
   images/    original uploaded files
   metadata/  <name>.json   structured metadata from the vision model
   semantic/  <name>.md     the text document that gets embedded
```

| Component | Technology | Job |
|---|---|---|
| Backend API | Python 3.11+, FastAPI, Uvicorn, Pydantic v2 | Runs the pipeline, exposes REST endpoints |
| CLI | Typer + Rich | Same pipeline from the terminal (`generate`, `ingest`, `search`, `count`) |
| Vision model | GLM 5.3 Flash via OpenRouter | Image to structured metadata |
| Embedding model | `text-embedding-3-small` via OpenRouter | Text to a 1536-number vector |
| Vector database | Qdrant in Docker | Stores vectors with their data, finds nearest neighbours |
| File storage | Local disk (`backend/data/`) | Keeps every intermediate result |
| Frontend | Next.js | Upload, review, gallery, search, detail page |

The pipeline lives in small Python modules, each with one job:

| Module | Job |
|---|---|
| `config.py` | Reads the shared `.env`, refuses to start if a required value is missing, creates the data folders |
| `models.py` | `RetrievalMetadata`: the single definition of what metadata looks like |
| `vision.py` | Sends the image to the vision model and gets back validated metadata |
| `semantic.py` | Turns metadata into the semantic document (Markdown text) |
| `embeddings.py` | Turns text into vectors. The only file that knows about the embedding API |
| `qdrant_db.py` | `ImageVectorStore`: creates the collection, stores points, searches |
| `api.py` | FastAPI routes that wire the steps together |
| `main.py` | The CLI |

## 3. Ingestion: How an Image Gets Into the Index

Ingestion has three stages. They run as three separate API calls, with a human review step between stages 2 and 3.

### Stage 1: Upload (`POST /api/upload`)

- The image arrives as a multipart form upload.
- The filename is cleaned with `Path(file.filename).name`, which drops any directory part. This blocks path-traversal names such as `../../etc/passwd`.
- The file is streamed to `backend/data/images/`.

### Stage 2: Generate metadata (`POST /api/generate`)

This is the heart of the project.

**2a. Ask the vision model to describe the image.**

- The image is read from disk and **base64-encoded**, then sent as a `data:` URL inside an OpenAI-style chat message, next to the user's optional description.
- A long **system prompt** sets the rules:
  - the user's description is a hint, not the truth; if it is wrong, ignore it;
  - describe only what is visible or reasonably inferable, do not invent facts;
  - fill every field (only `people` and `clothing` may be empty);
  - the title is one short phrase, never a keyword list.
- The model must answer with **structured output**: `response_format` carries a JSON Schema generated from the Pydantic model `RetrievalMetadata`, with `strict: True`. Two patches make the schema strict:
  - every field is marked `required`, because otherwise the model treats fields that have defaults as optional and skips them;
  - `additionalProperties: false`, which strict mode demands.

**2b. Validate the answer.** The reply is parsed with `json.loads` and validated by `RetrievalMetadata.model_validate`. A "before" validator fixes common model quirks: a bare string where a list was expected becomes a one-item list, and the old field name `meme_contexts` is renamed to `usage_contexts` so older files still load.

**2c. Retry on known failure modes.** LLMs are not perfectly reliable, so `generate_metadata()` makes up to **3 attempts**:

| Failure | What happens |
|---|---|
| Provider rejects the response as invalid JSON (`BadRequestError` mentioning JSON) | Retry |
| Empty reply (the model spent its output on reasoning) | Fails `json.loads`, retry |
| JSON does not match the schema (`ValidationError`) | Retry |
| Title longer than 120 characters (model stuck in a repetition loop) | Retry |
| Valid but "sparse": only title and summary, every list empty | Retry, but keep it as a fallback since it is still searchable |
| All 3 attempts fail | Raise `VisionError`, returned to the client as **HTTP 502 Bad Gateway** (an upstream service failed, not our server) |

**2d. The metadata fields.**

| Field | Meaning |
|---|---|
| `title`, `summary` | Short title and a natural-language description |
| `people` | Named people, only if confidently identifiable |
| `objects`, `actions`, `setting`, `clothing` | What is visible and happening, and where |
| `emotions`, `concepts` | Mood and higher-level ideas ("family bonding") |
| `keywords` | Important search words |
| `possible_search_queries` | Phrases a person might type to find this image |
| `usage_contexts` | Where the image could be used (reactions, presentations...) |

**2e. Build the semantic document.** `build_semantic_document()` in `semantic.py` renders the metadata as Markdown in a fixed order of importance: title, summary, the user's description, people, actions, objects, setting, clothing, emotions, concepts, keywords, alternative search phrases, usage contexts. Empty sections are skipped.

The metadata is saved to `data/metadata/<name>.json` and the document to `data/semantic/<name>.md`.

**2f. Human review.** The generated metadata is shown to the user before anything is indexed, so mistakes (a wrong name, a hallucinated object) can be caught. This is a human-in-the-loop step.

**Worked example.** For a photo of a family birthday, the stored document starts like this (trimmed):

```markdown
# Multigenerational family celebrating birthday with cake and candles

## Summary
A cheerful multigenerational family gathers around a wooden table in a
bright home kitchen to celebrate a birthday. A chocolate birthday cake
with four lit candles sits at the center...

## Actions
- celebrating a birthday
- clapping hands
- lighting or blowing out candles

## Emotions
- joy
- excitement
- warmth

## Concepts
- family bonding
- multigenerational family
- togetherness
```

### Stage 3: Ingest (`POST /api/ingest`)

1. Find the image file by name, trying `.png`, `.jpg`, `.jpeg` and `.webp`.
2. Read its semantic document and metadata from disk.
3. **Embed** the semantic document: one call to the embedding model, which returns 1536 numbers (`dimensions=1536` is passed explicitly).
4. Build a Qdrant **point**:
   - `id`: a UUID derived from the image's bytes (explained below);
   - `vector`: the embedding;
   - `payload`: filename, path, the semantic document and every metadata field.
5. **Upsert** the point: insert it, or overwrite it if that ID already exists.

**Deterministic IDs.** The point ID is computed from the file contents, not the filename:

```python
digest = sha256(path.read_bytes()).digest()
return str(UUID(bytes=digest[:16], version=4))
```

So the same image always gets the same ID. Ingesting it twice updates one point instead of creating a duplicate, which makes ingest **idempotent**. `version=4` only sets the version bits so Qdrant accepts the value as a UUID; the value itself is not random.

**The collection.** On startup `ensure_collection()` creates the Qdrant collection `images` with vector size 1536 and **cosine** distance if it does not exist. If it exists but its vector size differs from `EMBEDDING_DIMENSIONS`, the backend refuses to start with a clear error, instead of failing later on the first insert.

### Why every stage is saved to disk

Each stage's output is a file you can open, edit and re-run from:

- re-embed all images (for example after switching embedding model) without paying for vision calls again;
- hand-edit a semantic document and re-ingest it;
- rebuild the whole Qdrant collection from `data/` if it is lost.

## 4. Search: How a Query Finds Images

`GET /api/search?q=family+party&limit=10`

1. **Embed the query** with the same embedding model, giving a 1536-number vector. Queries and documents must be embedded by the same model, otherwise their vectors are not comparable.
2. **Nearest-neighbour search.** `query_points()` asks Qdrant for the 10 stored vectors closest to the query vector by cosine similarity.
3. **Return results.** Each hit comes back with its `score` (the similarity) and its `payload`. Because the payload holds all the metadata, no second database lookup is needed. The frontend shows the score as a match percentage.

**Why it finds images without matching words.** Searching "kids party" can return the birthday photo even though the word "party" never appears in its document. The embedding model places texts with similar meaning close together: "party" sits near "celebrating a birthday", "kids" near "young girl" and "young boy". This is the difference between semantic search and keyword search.

**Why `possible_search_queries` matters.** A query is a few words; a semantic document is 40+ lines. `text-embedding-3-small` embeds both the same way, with no separate query and document modes. Writing likely search phrases into the document puts query-like text inside it, which moves the document's vector closer to real queries. This is **query expansion done at index time**.

The other endpoints are simple reads: `GET /api/images` lists stored points with Qdrant `scroll` (up to 100), and `GET /api/images/{id}` fetches one point with `retrieve`.

## 5. Key Concepts

### Embeddings

An embedding model maps a piece of text to a fixed-length vector of floats, here 1536 of them. It is trained so that texts with similar meaning get vectors pointing in similar directions. "nervous" and "anxious" end up close together even though they share no letters.

### Cosine similarity

```text
cos(θ) = (A · B) / (|A| × |B|)
```

It measures the angle between two vectors and ignores their length. 1 means the same direction, 0 means unrelated. Qdrant normalises vectors to length 1 when the collection uses cosine distance, so internally it reduces to a fast dot product.

### Vector database and HNSW

Qdrant stores **points**: an ID, a vector and a JSON payload. Comparing a query against every vector costs O(n × d) for n vectors of dimension d. Qdrant instead builds an **HNSW** index (Hierarchical Navigable Small World), a layered graph:

- the top layers link far-apart points, like highways;
- the lower layers link close neighbours, like local streets.

A search starts at the top, greedily moves toward the query, and drops down a layer each time it can get no closer. Cost grows roughly with log n. It is **approximate** nearest-neighbour search: it can occasionally miss the true closest point, in exchange for a large speed-up. Accuracy is tuned with the parameters `m` (links per node) and `ef` (how many candidates are explored). For a small collection like a demo library, Qdrant does not build the index at all and simply compares against every vector, so results are exact.

### Embedding dimensions

`text-embedding-3-small` outputs 1536 dimensions by default. It was trained with **Matryoshka Representation Learning**, so shorter vectors (for example 512) still work with a small quality loss. The dimension is fixed when the Qdrant collection is created; changing it needs a new collection and re-ingestion.

### Structured outputs with Pydantic

One Pydantic model, `RetrievalMetadata`, is the single source of truth for the shape of metadata. It is used to:

1. generate the JSON Schema sent to the vision model;
2. validate the model's reply;
3. save metadata to disk (`model_dump_json`);
4. define the API response, from which FastAPI generates interactive docs at `/docs`.

### Why embed a Markdown document instead of the raw JSON

- Embedding models are trained on natural language. JSON braces, quotes and key names add noise.
- **Order carries weight.** The highest-signal fields come first, and very long inputs can be cut off at the model's limit (8191 tokens for this model).
- Alternative search phrases inside the document close the gap between how an image is described and how people search for it.

## 6. Reliability and Fail-Fast Design

- **Config validation at import.** `config.py` raises an error at startup if `OPENROUTER_API_KEY`, `VISION_MODEL`, `EMBEDDING_MODEL` or `EMBEDDING_DIMENSIONS` is missing. A misconfiguration shows up immediately, not halfway through a request.
- **Collection size check.** The backend refuses to start against a Qdrant collection whose vector size does not match the configured embedding size.
- **Three layers of output safety.** A strict JSON schema on the request, Pydantic validation on the reply, and targeted retries, with a sparse fallback and a clean 502 error.
- **Meaningful HTTP codes.**
  - 400: missing filename.
  - 404: image, metadata or semantic document not found.
  - 502: the vision model failed.
- **Swappable providers.** Models are read from `.env`, not hard-coded. `embeddings.py` is the only module that talks to the embedding API (an **adapter**), and `qdrant_db.py` the only one that talks to Qdrant (a **repository**). Changing either touches one file.

## 7. Design Choices and Alternatives

### Why caption-then-embed instead of CLIP

CLIP embeds images and text into one shared vector space directly, with no captioning step.

| | Glimpse (vision LLM, then text embedding) | CLIP-style image embedding |
|---|---|---|
| Reads text inside the image, recognises people, memes, cultural context | Yes | Weak |
| Explainable and editable | Yes, metadata is stored as readable text | No, an opaque vector |
| Cost and time per uploaded image | Higher (one LLM call) | Lower |
| Cost per search | One text embedding | One text embedding |
| Main risk | The LLM can hallucinate | Model bias, poor fine detail |

Glimpse targets everyday photos, memes and reaction images, where overlaid text, people and emotional context matter. The captioning approach suits that.

### Why Qdrant

It is open source, runs locally in Docker, stores the payload next to the vector (so no second database is needed), supports filtering, and has a simple Python client. The alternatives each lack something:

- FAISS is only a library: no server, no persistence, no payload.
- Pinecone is a paid hosted service.
- pgvector needs a PostgreSQL server.

### Why OpenRouter

One OpenAI-compatible API and one key for both models. The official `openai` Python SDK works unchanged by pointing `base_url` at OpenRouter. Swapping either model is a one-line `.env` change.

## 8. Known Limitations

Raising these yourself, together with a fix for each, scores better than being caught out.

1. **Blocking calls inside `async` routes.** The OpenRouter and Qdrant clients are synchronous but the routes are `async def`, so one slow vision call blocks every other request. Fix: plain `def` routes (FastAPI runs them in a thread pool) or async clients.
2. **`/api/generate` does not clean the filename.** Upload does, but generate joins `IMAGES_DIR / filename` directly. Fix: apply `Path(filename).name` and check the resolved path stays inside the images folder.
3. **No upload validation.** There is no file-type or size check, and an upload with an existing name silently overwrites the old file.
4. **MIME type hard-coded** as `image/png` in the data URL, even for JPEG or WEBP. It works in practice but should use the real type.
5. **Listing caps at 100** images: `/api/images` makes a single `scroll` call with no pagination.
6. **No relevance threshold.** Search always returns the top k, even when every match is weak.
7. **Filename keys vs content keys.** Files on disk are keyed by name, Qdrant points by content hash. Two different images with the same name overwrite each other on disk.
8. **Hallucination.** The model may misidentify people or objects. The prompt and the review step reduce this, but nothing enforces it.
9. **Single user, no authentication.** CORS only allows `localhost:3000`.
10. **One-by-one ingestion.** Batch embedding (`embed_documents`) exists but is not used.
11. **No automated tests**, some unused code (`utils.py`, three unused Pydantic models), and Qdrant pinned to `latest` rather than a fixed version.

## 9. Future Work

- **Hybrid search.** Combine dense vectors with sparse keyword search (BM25 or SPLADE), merged with Reciprocal Rank Fusion. This helps with exact names and quoted text.
- **Payload filters.** Search inside a subset, for example only images with a given person. `Filter` and `FieldCondition` are already imported in `qdrant_db.py`.
- **Re-ranking.** Re-score the top results with a cross-encoder or an LLM.
- **Reverse image search.** Add a CLIP vector as a second named vector on each point.
- **Throughput.** Async clients, a background job queue for vision calls, batch ingestion.
- **Features.** Edit metadata before indexing, delete images, paginate the gallery, authentication.
- **Evaluation.** Build a labelled set of queries and their correct images, then measure Recall@k and MRR.

---

# Part B: Likely Viva Questions

## Basics

**Q: What problem does Glimpse solve?**
Finding images by meaning. Filenames say nothing and manual tags are slow, inconsistent and miss synonyms. Glimpse lets you describe what you remember.

**Q: Explain the project in one sentence.**
A vision model describes each image as text, the text is turned into an embedding and stored in Qdrant, and a search query is embedded the same way and matched by cosine similarity.

**Q: What is the difference between semantic search and keyword search?**
Keyword search matches exact words, so "party" will not find "birthday celebration". Semantic search compares meanings via embeddings, so related words and paraphrases still match.

**Q: Walk me through what happens when I upload an image.**
Upload saves the file. Generate sends it to the vision model, validates the JSON, builds the semantic document, and saves both to disk. The user reviews the result. Ingest embeds the document and upserts a point into Qdrant. Section 3 has the details.

**Q: Walk me through what happens when I search.**
The query is embedded with the same model. Qdrant returns the top 10 nearest vectors by cosine similarity, each with its score and stored metadata, which the frontend displays.

**Q: Why are upload, generate and ingest separate steps?**
So a human can review the metadata before it is indexed, and so each step can be retried or re-run on its own. For example, you can re-ingest without calling the vision model again.

## Vision Model and Metadata

**Q: Why use an LLM? Why not tag images by hand?**
Manual tagging does not scale and is inconsistent between people. The model writes rich, consistent metadata automatically, including emotions, concepts and likely search phrases that people rarely tag.

**Q: How do you make sure the model returns valid JSON?**
Three layers: a strict JSON-schema structured-output request, Pydantic validation of the reply, and up to 3 retries for known failure modes. If all fail, we keep a sparse result if one exists, otherwise return a 502 error.

**Q: Why did you mark every schema field as required?**
In the Pydantic model, the list fields have defaults so older files still load. The model treated fields with defaults as optional and often skipped them, leaving only a title and summary. Requiring every field in the schema sent to the model fixed that.

**Q: What is structured output?**
An API feature where you send a JSON Schema and the provider constrains the model's output to match it. With `strict: True` the output must follow the schema exactly, with no extra keys.

**Q: What if the user's description is wrong?**
The system prompt says the description is only a hint and the model should trust what it sees. The description is still kept in the semantic document as extra context.

**Q: What does the `model_validator` in `models.py` do?**
It runs before validation and fixes predictable model mistakes: a single string where a list was expected becomes a one-item list. It also renames the old field `meme_contexts` to `usage_contexts` for backward compatibility.

**Q: Why retry when the title is over 120 characters?**
Sometimes the model falls into a repetition loop and fills the title with keywords. A fresh attempt usually produces a normal title.

**Q: What is a "sparse" result and why keep it?**
Valid JSON with only a title and summary, and every list empty. We retry because it carries little search context. If no attempt does better, we still return it, since a title and summary are searchable.

**Q: Why HTTP 502 when the vision model fails?**
502 Bad Gateway means an upstream service the server depends on failed. Our server is working; the model provider is not. 500 would wrongly suggest a bug in our code.

**Q: How is the image sent to the model?**
Base64-encoded inside a `data:` URL, as an `image_url` part of an OpenAI-style chat message, next to a text part holding the user's description.

**Q: Can the model hallucinate? How do you handle it?**
Yes. The prompt says not to invent facts and to name people only when confidently identifiable. The review step lets a human catch errors before indexing. Nothing fully prevents it, which is a known limitation.

## Embeddings and Semantic Document

**Q: What is an embedding?**
A list of numbers (1536 here) representing the meaning of a text. Similar meanings give vectors pointing in similar directions.

**Q: Why 1536 dimensions?**
It is the native output size of `text-embedding-3-small`. More dimensions can hold finer distinctions, at the cost of storage and compute.

**Q: Can you use fewer dimensions?**
Yes. The model was trained with Matryoshka Representation Learning, so a shortened vector (for example 512) keeps most of its quality. The Qdrant collection would need to be recreated at that size.

**Q: Why not embed the JSON directly?**
Embedding models are trained on natural language; JSON syntax is noise. The Markdown document also puts the most important fields first, which matters because long inputs can be cut off.

**Q: Why do you put possible search queries into the document?**
Queries are short and documents are long. Writing likely queries into the document makes its vector closer to real queries: query expansion at index time.

**Q: Why must the query and documents use the same embedding model?**
Each model has its own vector space. Vectors from different models, or different dimensions, cannot be compared meaningfully.

**Q: What happens if you change the embedding model?**
Every stored vector becomes incompatible. You create a new collection and re-embed every semantic document from `data/semantic/`. No vision calls are needed, which is one reason every stage is saved to disk.

**Q: Why is the section order in the semantic document fixed?**
High-signal content (title, summary, people, actions) comes first, so it dominates the meaning and survives if text is truncated. A fixed order also makes every document consistent.

## Similarity and Vector Search

**Q: What is cosine similarity?**
The cosine of the angle between two vectors: (A · B) / (|A| |B|). It measures direction and ignores length. Higher means more similar.

**Q: Why cosine and not Euclidean distance?**
For text embeddings direction carries the meaning, and length is not meaningful. For vectors normalised to length 1, both give the same ranking anyway. Cosine is the standard choice for text embeddings.

**Q: What score range do you see?**
In theory -1 to 1. In practice text embeddings of related content score positive. The frontend shows the score multiplied by 100 as a percentage.

**Q: What is a vector database and why not a normal database?**
It stores vectors and is built to find nearest neighbours fast, using an index like HNSW. A normal database can store vectors, but would have to compare against every row for each query.

**Q: What is HNSW?**
Hierarchical Navigable Small World: a layered graph of vectors. Search starts on sparse upper layers with long links, greedily moves toward the query, then drops to denser layers for precision. It is approximate but roughly logarithmic in time.

**Q: What does "approximate" mean in ANN?**
It may occasionally miss the true closest vector in exchange for speed. Recall is tuned with the `m` and `ef` parameters.

**Q: What is the time complexity of a search?**
One embedding API call, whose cost does not depend on collection size, plus HNSW search at roughly O(log n). Brute force would be O(n × d).

**Q: What is stored in a Qdrant point?**
An ID (content-derived UUID), the 1536-number vector, and a payload: filename, path, the semantic document and every metadata field.

**Q: Why store the metadata in the payload?**
Search results can be displayed directly, with no second lookup. It also allows future filters on payload fields.

**Q: What is the difference between `query_points`, `scroll` and `retrieve`?**
`query_points` finds the nearest neighbours of a vector (search). `scroll` lists points page by page without a query (the gallery). `retrieve` fetches points by ID (the detail page).

**Q: Why Qdrant over FAISS, Pinecone or pgvector?**
Open source, runs locally, stores payload with vectors, supports filtering, simple client. FAISS has no server or persistence, Pinecone is paid and hosted, pgvector needs PostgreSQL.

## IDs, Storage and Data Flow

**Q: How do you avoid duplicate images in the index?**
The point ID is a SHA-256 hash of the image bytes turned into a UUID, and we upsert. Re-ingesting the same image overwrites its point.

**Q: Why hash the content instead of using the filename?**
The same image under two names is still one point, and the ID never changes because of a rename. The trade-off: on disk, two different images with the same name still overwrite each other.

**Q: Why `version=4` in the UUID?**
Qdrant only accepts integers or valid UUIDs as IDs. `version=4` sets the version bits so the hash forms a valid UUID. The value is deterministic, not random.

**Q: What is an upsert?**
Insert if the ID is new, update if it exists. It makes ingestion safe to repeat.

**Q: What is on disk and why?**
Originals in `data/images`, metadata JSON in `data/metadata`, semantic documents in `data/semantic`, and Qdrant's own files in `backend/qdrant_storage`. Keeping every stage means any step can be inspected, edited or re-run, and the index can be rebuilt.

**Q: What happens if Qdrant's data is deleted?**
Re-ingest every image from `data/`. The metadata and documents still exist, so only embedding calls are needed, not vision calls.

## Backend and API Design

**Q: Why FastAPI?**
Requests are parsed and validated from Python type hints via Pydantic. It generates OpenAPI and Swagger docs automatically at `/docs`, supports async, and has response models.

**Q: List the API endpoints.**

| Method and path | Purpose |
|---|---|
| `POST /api/upload` | Save the file |
| `POST /api/generate` | Vision model, metadata and semantic document |
| `POST /api/ingest` | Embed and store in Qdrant |
| `GET /api/search` | Semantic search |
| `GET /api/images` | List indexed images |
| `GET /api/images/{id}` | One image's details |
| `/images/*` | Static image files |

**Q: Why is there both a CLI and an API?**
Both call the same modules. The CLI was useful for building and testing the pipeline without a browser, and for batch work. The API serves the web app.

**Q: How does configuration work?**
One `.env` at the project root, read by `config.py`. It holds the OpenRouter key, model names, embedding dimensions and Qdrant settings. Missing required values stop the backend at startup.

**Q: What design patterns did you use?**
Adapter (`embeddings.py` hides the embedding provider), repository (`ImageVectorStore` hides Qdrant), single source of truth (one Pydantic model for metadata), and fail-fast configuration.

**Q: How does the frontend talk to the backend?**
Next.js rewrites forward `/api/*` and `/images/*` to the backend, acting as a reverse proxy. The browser only talks to its own origin, which avoids cross-origin issues, and the backend address lives in one variable, `BACKEND_URL`.

**Q: Is the API key exposed to the browser?**
No. Only the backend reads it. The frontend only knows the backend's URL.

## Evaluation, Scaling and Security

**Q: How do you know the search is good?**
So far by manual testing: queries using words that do not appear in the metadata still find the right image. A proper evaluation would use a labelled set of queries and correct images, measuring Recall@k, Precision@k, MRR or nDCG, and compare variants such as with and without `possible_search_queries`.

**Q: What is Recall@k?**
Of the correct images for a query, the fraction that appear in the top k results.

**Q: What is MRR?**
Mean Reciprocal Rank: for each query, take 1 divided by the rank of the first correct result, then average over all queries. 1.0 means the correct image is always first.

**Q: How would you scale to a million images?**
- Move vision calls to a background job queue.
- Batch the embedding calls.
- Use async clients.
- Use Qdrant quantization and sharding.
- Store images in object storage such as S3.
- Paginate the gallery and cache frequent query embeddings.

**Q: What does ingesting one image cost?**
One vision call (the expensive part) and one embedding call. Searching costs one embedding call. Embedding calls are cheap.

**Q: Any security concerns?**
Yes, and they are in the limitations list:
- no authentication;
- the generate endpoint does not clean the filename;
- uploads are not checked for type or size.

The API key is kept server-side.

**Q: What is path traversal and how did you handle it?**
A filename like `../../secret` that escapes the intended folder. Upload strips directories with `Path(name).name`. Generate does not yet, which is a known gap with a one-line fix.

**Q: Why are the routes async if the clients are synchronous?**
Honestly, that is a flaw. Synchronous calls inside `async def` block the event loop. The fix is plain `def` routes, which FastAPI runs in a thread pool, or async clients.

## Comparisons and "Why" Questions

**Q: Why not CLIP?**
CLIP is cheaper per image but weak at reading text in images and understanding context, and its vectors cannot be explained or edited. Glimpse's text metadata is readable, editable and better for memes and reaction images. See section 7.

**Q: Could you add keyword search too?**
Yes, as hybrid search: run BM25 alongside vector search and merge the two rankings with Reciprocal Rank Fusion. It helps with exact names and quoted text.

**Q: Why OpenRouter instead of calling OpenAI directly?**
One key and one API for both the vision and embedding models, and either can be swapped by changing `.env`.

**Q: Why GLM 5.3 Flash?**
It accepts images, supports strict JSON-schema output, and is fast and cheap. The model name is configurable, so it is not locked in.

**Q: Why `text-embedding-3-small`?**
Strong retrieval quality for its price, 1536 dimensions, Matryoshka support for shorter vectors, and an 8191-token input limit that fits our documents easily.

**Q: What was the hardest part?**
Making model output reliable: skipped fields, strings instead of lists, malformed JSON, repetition loops in titles. It was solved with the required-field schema, the before-validator and targeted retries.

**Q: What would you do differently or add next?**
Hybrid search, payload filters, a proper evaluation set, async and batch ingestion, and editing metadata before indexing. Section 9 has the full list.

---

## Demo Checklist

1. `docker compose up -d --build` starts Qdrant, the backend and the frontend together. (For local development instead: `docker compose up -d qdrant`, then `cd backend && uv run start` and `cd frontend && bun run dev`.)
2. Open the Qdrant dashboard at `http://localhost:6333/dashboard` and the API docs at `http://localhost:8000/docs`.
3. Open the app at `http://localhost:3000`.
4. Upload or paste an image with a description. Show the generated metadata and semantic document, then ingest.
5. Search using words that do **not** appear in the metadata (a synonym or a mood) to prove the search is semantic, not keyword-based.
6. Open the detail page and show the tags and semantic document.
7. Optional CLI: `uv run src/main.py search "..."` and `uv run src/main.py count`.

Have `.env` filled in and a few images already ingested, in case the network or the API misbehaves during the demo.
