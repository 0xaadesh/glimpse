# Glimpse: Viva Preparation Notes

Technical walkthrough of the codebase, the reasoning behind each design choice, and questions an examiner is likely to ask. Read alongside `README.md`.

---

## 1. One-Paragraph Pitch

Glimpse is a semantic image search engine. Instead of searching images by filename or manual tags, a user searches in plain language ("guy looking nervous in a meeting"). To make that possible, every uploaded image is first described by a **vision LLM** (Qwen, `qwen/qwen3.8-27b`, served by Groq) as **structured JSON metadata**. That metadata is rendered into a **semantic document** (Markdown text), turned into a **vector embedding** (Gemini `gemini-embedding-001`), and stored in a **vector database** (Qdrant). At search time the query is embedded with the same model and the closest image vectors are returned by **cosine similarity**.

Core idea: **convert the image search problem into a text search problem**, then solve text search with embeddings.

---

## 2. Architecture

```text
 Browser (Next.js, :3000)
   │   /api/*  and  /images/*   (Next.js rewrites = reverse proxy)
   ▼
 FastAPI backend (:8000)  ──── Typer CLI (same pipeline, no web)
   │          │            │
   ▼          ▼            ▼
 Groq      Gemini        Qdrant (Docker, :6333 REST / :6334 gRPC)
 vision    embeddings    vector store
   │
   ▼
 backend/data/{images, metadata, semantic}   (files on disk)
```

Three layers:

| Layer | Tech | Role |
|-------|------|------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 | Gallery, search bar, upload wizard, detail page |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic v2, Typer, Rich | REST API + CLI over one shared pipeline |
| Storage | Qdrant (vectors + payload), local filesystem (images, JSON, Markdown) | Persistence |

External AI services: **Groq** (fast inference host for the open-weight vision model) and **Google Gemini** (embeddings).

---

## 3. The Pipeline, Step by Step

### Step 1: Upload (`POST /api/upload`, `backend/src/api.py`)
- Multipart file received via FastAPI `UploadFile` (needs `python-multipart`).
- Filename sanitised with `Path(file.filename).name`, which strips directory parts and blocks path traversal like `../../etc/passwd`.
- Streamed to disk with `shutil.copyfileobj` into `backend/data/images/`.
- Frontend renames clipboard pastes to `pasted-<timestamp>.png` because every clipboard image is called `image.png` and would overwrite the previous one.

### Step 2: Generate (`POST /api/generate`, `backend/src/vision.py`)
1. Image read and **base64-encoded**, sent as a `data:` URL in an OpenAI-style chat message (`image_url` content part). Groq exposes an OpenAI-compatible API.
2. A long **system prompt** tells the model: the user description is a *hint, not ground truth*; prefer what is visible; do not invent facts; fill every field.
3. **Structured output**: `response_format={"type": "json_schema", ...}` with a schema generated from the Pydantic model (`RetrievalMetadata.model_json_schema()`). The schema is patched so *every* field is `required`, because the model otherwise treats fields with defaults as optional and skips them.
4. Response parsed with `json.loads` and validated with `RetrievalMetadata.model_validate`.
5. **Retry loop** (`MAX_ATTEMPTS = 3`) handles known LLM failure modes:
   - Groq `json_validate_failed` (model emitted JSON that does not match schema): retry.
   - `JSONDecodeError` / Pydantic `ValidationError`: retry.
   - Title longer than 120 chars (model fell into a repetition loop stuffing keywords): retry.
   - Only title + summary, all lists empty ("sparse"): retry, but keep as fallback since it is still searchable.
   - All attempts fail: raise `VisionError`, mapped to **HTTP 502 Bad Gateway** (upstream service failed, not our server).
6. Metadata saved to `data/metadata/<stem>.json`.
7. `build_semantic_document()` (`semantic.py`) renders Markdown: title, summary, user description, then people, actions, objects, setting, clothing, emotions, concepts, keywords, alternative search phrases, usage contexts. Saved to `data/semantic/<stem>.md`.
8. Frontend shows the result for **human review** before indexing (human-in-the-loop).

### Step 3: Ingest (`POST /api/ingest`, `backend/src/qdrant_db.py`)
1. Locates image by stem, trying `.png .jpg .jpeg .webp`.
2. Reads semantic document + metadata JSON from disk.
3. Embeds the document with `task_type="RETRIEVAL_DOCUMENT"`.
4. Builds a Qdrant `PointStruct`: `id` = deterministic UUID, `vector` = embedding, `payload` = filename, path, semantic document, plus all metadata fields.
5. `client.upsert(...)`: insert or overwrite.

### Step 4: Search (`GET /api/search?q=...&limit=10`)
1. Query embedded with `task_type="RETRIEVAL_QUERY"`.
2. `client.query_points(collection, query=vector, limit=k)` returns top-k nearest points by cosine similarity, each with `score` and `payload`.
3. Frontend shows score as a percentage badge on each card.

### Why save each step to disk?
Each stage is **inspectable and re-runnable independently**. You can re-embed without paying for another vision call, hand-edit a semantic doc, or rebuild the whole Qdrant collection from `data/` if you change embedding model.

---

## 4. Key Concepts You Must Be Able to Explain

### Embeddings
A model maps text to a fixed-length vector of floats (here 1536). Texts with similar meaning land close together in that space, even with no shared words ("nervous" vs "anxious"). This is what makes search *semantic* rather than keyword-based.

### Cosine similarity
`cos(θ) = (A · B) / (|A| |B|)`. Measures the angle between vectors, ignoring magnitude. Range -1 to 1; higher is more similar. Collection created with `Distance.COSINE` in `ensure_collection()`. Qdrant normalises vectors on insert for cosine, so internally it becomes a dot product.

### Asymmetric retrieval (task types)
Gemini embeddings accept a `task_type`. Documents use `RETRIEVAL_DOCUMENT`, queries use `RETRIEVAL_QUERY`. A 5-word query and a 40-line document are very different texts; task types optimise each side so a short question lands near the long document that answers it. See `embeddings.py`.

### Output dimensionality / Matryoshka embeddings
`gemini-embedding-001` natively outputs 3072 dims. We request `output_dimensionality=1536`. The model is trained with **Matryoshka Representation Learning (MRL)**, so the leading dimensions carry most of the meaning and truncating keeps quality high while halving storage and search cost. The dimension **must match the Qdrant collection size**, which is fixed at creation; changing it needs a new collection and re-ingestion.

### Vector database (Qdrant)
- Stores **points**: `id` + `vector` + JSON `payload`.
- Nearest-neighbour search uses an **HNSW** index (Hierarchical Navigable Small World graph): approximate nearest neighbour (ANN), roughly logarithmic search time instead of scanning every vector.
- Point IDs must be unsigned ints or UUIDs.
- Runs in Docker, data persisted by a volume at `backend/qdrant_storage` (segments, WAL, etc.).
- `scroll` = paginated listing without a query (used by `/api/images`). `retrieve` = fetch by ID (used by `/api/images/{id}`).

### Deterministic point IDs (idempotent ingest)
```python
digest = sha256(path.read_bytes()).digest()
return str(UUID(bytes=digest[:16], version=4))
```
ID is derived from the **image bytes**, not the filename. Re-ingesting the same image updates the same point (upsert) instead of creating duplicates. Same image uploaded under two names = one point. `version=4` only sets the UUID version bits so Qdrant accepts it; the value is not random.

### Structured outputs + Pydantic
One Pydantic model (`RetrievalMetadata`) is the single source of truth for the shape of metadata. It is used to:
1. generate the JSON Schema sent to the LLM,
2. validate the LLM response,
3. serialise to disk (`model_dump_json`),
4. define the API response model (FastAPI auto-generates OpenAPI docs at `/docs`).

A `model_validator(mode="before")` coerces LLM quirks: a bare string where a list is expected becomes `[string]`; the old field name `meme_contexts` is migrated to `usage_contexts` (backward compatibility with files written before the rebrand).

### Why a "semantic document" instead of embedding raw JSON?
- Embedding models are trained on natural language, not JSON syntax. Braces, quotes and keys add noise.
- **Ordering matters**: highest-signal fields (title, summary, people, actions) come first. Many embedding models weight earlier text more and may truncate long input.
- `possible_search_queries` is effectively **query expansion done at index time**: the document already contains phrasings users are likely to type, closing the gap between how images are described and how people search.

### Why not CLIP (direct image embeddings)?
Good alternative, should be mentioned as a trade-off:
| | Glimpse (caption then text embedding) | CLIP-style multimodal embedding |
|--|--|--|
| Understands text in image, named people, memes, cultural context | Yes (LLM reads it) | Weak |
| Explainable / editable | Yes, metadata is human-readable and stored | No, opaque vector |
| Cost / latency per image | Higher (LLM call) | Lower |
| Search-time cost | Same (one text embedding) | Same |
| Risk | LLM can hallucinate | Model bias only |

Glimpse targets memes and reaction images, where overlaid text, named people and emotional context matter, so the captioning approach fits.

---

## 5. Backend File-by-File

| File | Responsibility | Talking points |
|------|----------------|----------------|
| `config.py` | Loads root `.env` via `python-dotenv`, validates required vars, creates data folders | **Fail fast**: raises `RuntimeError` at import if keys/models missing, so misconfiguration surfaces at startup, not mid-request |
| `models.py` | `RetrievalMetadata` + helper models | Single source of truth; before-validator for LLM coercion. `ImageRecord`, `EmbeddingRecord`, `SearchResult` are defined but currently unused |
| `vision.py` | Groq client, system prompt, schema, retry logic | Structured output, retry on specific failure modes, sparse fallback, `VisionError` |
| `semantic.py` | Metadata to Markdown | Ordered by signal strength, empty sections skipped |
| `embeddings.py` | `GeminiEmbeddingProvider` | **Adapter pattern**: "only place that knows how Gemini works"; swap provider by replacing one class. Has unused `embed_documents` for batch ingestion |
| `qdrant_db.py` | `ImageVectorStore` | Ensures collection, deterministic IDs, upsert, search, delete, count. **Repository pattern** over Qdrant |
| `api.py` | FastAPI routes, CORS, static files | Response models, HTTP error codes (400, 404, 502), `/images` mounted with `StaticFiles` |
| `main.py` | Typer CLI: `generate`, `ingest`, `search`, `count` | Same pipeline without web; forces UTF-8 stdout on Windows so Rich box characters render |
| `server.py` | Uvicorn entrypoint, port 8000, `reload=True` | Adds `src/` to `sys.path` so bare imports (`import config`) work |
| `__init__.py` | Same `sys.path` fix when imported as package `src.api` | |
| `utils.py` | Path helpers | Currently unused by the rest of the code |

Dependencies are managed with **uv** (`pyproject.toml` + `uv.lock`), a fast Rust-based Python package manager. `package = false` means it is an app, not a publishable library.

---

## 6. Frontend File-by-File

| File | Responsibility | Talking points |
|------|----------------|----------------|
| `next.config.ts` | Loads the shared root `.env` with `@next/env`; **rewrites** `/api/*` and `/images/*` to the backend | Rewrites act as a reverse proxy: browser only talks to `:3000`, so no cross-origin requests and backend URL is configurable via `BACKEND_URL` |
| `app/lib/api.ts` | Typed fetch client, TS interfaces mirror Pydantic models | Uses `FormData` for upload/generate/ingest because backend reads `Form(...)` fields; surfaces backend `detail` error message on generate |
| `app/layout.tsx` | Root layout, font (Bricolage Grotesque via `next/font/google`), Navbar | `Navbar` wrapped in `<Suspense>` because it uses `useSearchParams` |
| `app/page.tsx` | Gallery + search results | Search state lives **in the URL** (`/?q=...`), so results are shareable, bookmarkable, and back button works. `useEffect` refetches when `q` changes |
| `app/image/[id]/page.tsx` | Detail page | **Dynamic route**; `id` is the Qdrant point UUID. Shows all tags and the semantic document |
| `components/Navbar.tsx` | Brand, search form, Upload button | `router.push('/?q=' + encodeURIComponent(...))` |
| `components/UploadDialog.tsx` | Upload wizard | **Finite state machine**: `upload → generating → review → ingesting → done`. Drag-and-drop, file picker, clipboard paste (`paste` event listener, cleaned up in effect return). Can't close dialog mid-request |
| `components/ImageCard.tsx` | Grid tile | Score badge shown only when `score != null` (search results, not plain listing) |
| `globals.css` | Tailwind v4 `@theme` design tokens | Spotify-inspired dark theme: accent `#1ed760`, surfaces `#121212`/`#181818` |

All pages are **Client Components** (`"use client"`) that fetch in `useEffect`. Next.js is used mainly for routing, rewrites and fonts, not server-side rendering of data.

Tooling: **Bun** as package manager/runtime, TypeScript 5, ESLint 9.

---

## 7. Configuration

Models currently configured in `.env`:

| Variable | Value |
|----------|-------|
| `VISION_MODEL` | `qwen/qwen3.8-27b` (Qwen, open-weight, 27B parameters, served by Groq) |
| `EMBEDDING_MODEL` | `gemini-embedding-001` |
| `EMBEDDING_DIMENSIONS` | `1536` |

The model is not hard-coded anywhere: `vision.py` reads `config.VISION_MODEL`, so swapping models is an `.env` change. Note that `README.md` and `.env.example` still show the older default `meta-llama/llama-4-scout-17b-16e-instruct`.

Single `.env` at the project root, read by both apps (backend in `config.py`, frontend in `next.config.ts`). See `.env.example`.

Important constraint: `EMBEDDING_DIMENSIONS` must equal the Qdrant collection vector size. Changing model or dimensions means a new `QDRANT_COLLECTION` and re-ingest.

Secrets (`.env`, `qdrant_storage/`, uploaded data) are git-ignored.

---

## 8. Honest Limitations (know these before the examiner finds them)

Being upfront about these, with a fix for each, usually scores well.

1. **Blocking calls inside `async def` routes.** Groq, Gemini and Qdrant clients are synchronous, but routes are declared `async`. This blocks the event loop, so one slow vision call stalls every other request. Fix: declare routes with plain `def` (FastAPI runs them in a threadpool) or use async clients.
2. **`/api/generate` does not sanitise `filename`.** Upload uses `Path(...).name`, but generate does `IMAGES_DIR / filename` directly, so a crafted `../` path could read a file outside the images folder. Fix: apply the same `Path(filename).name` and check the resolved path stays inside `IMAGES_DIR`.
3. **No file type or size validation** on upload. Any file is accepted and a same-named file silently overwrites the old one.
4. **MIME type hard-coded** as `data:image/png` for every image, including JPEG/WEBP. Works in practice, but should use the real type.
5. **Extension lists inconsistent**: ingest checks `.png .jpg .jpeg .webp`; `utils.py` also lists `.gif` but is unused. A `.gif` upload can be generated but not ingested.
6. **`/api/images` returns at most 100** (single `scroll` call, no pagination).
7. **No relevance threshold** in search: top-k is always returned, even if every match is poor.
8. **No authentication**, single user, CORS limited to `localhost:3000`.
9. **Stem-based file keys vs content-based point IDs**: disk files are keyed by filename, Qdrant points by content hash. Two different images with the same name overwrite each other on disk.
10. **Hallucination risk**: the vision model may misidentify people. The prompt says "only if confidently identifiable" and the review step lets a human catch errors, but nothing enforces it.
11. **Dead code**: `utils.py`, `embed_documents`, `delete`, and three unused Pydantic models.
12. **Sequential per-image ingest**: batch embedding exists but is not used.
13. **No automated tests.**
14. Qdrant image pinned to `latest`, not a fixed version.

---

## 9. Possible Improvements / Future Work

- **Hybrid search**: combine dense vectors with sparse keyword search (BM25 / SPLADE), fused with Reciprocal Rank Fusion. Helps exact names and quoted meme text.
- **Payload filtering**: Qdrant filters (e.g. `people == "Ravi Kishan"`) alongside vector search. `FieldCondition`/`Filter`/`MatchValue` are already imported in `qdrant_db.py`.
- **Re-ranking** top results with a cross-encoder or LLM.
- **Reverse image search** by adding a CLIP vector as a second named vector per point.
- Async clients, background job queue for vision calls, batch ingest.
- Edit metadata in the review step before ingesting.
- Delete endpoint + UI (store already has `delete`).
- Pagination, thumbnails, auth, containerise backend and frontend in `docker-compose.yml`.
- Evaluation: build a small labelled query set and measure Recall@k / MRR.

---

## 10. Likely Viva Questions with Short Answers

**Q: What problem does the project solve?**
Finding images by meaning. Filenames and manual tags don't scale and miss synonyms; Glimpse lets you describe what you remember.

**Q: Why use an LLM at all? Why not just tags?**
Manual tagging is slow and inconsistent. The LLM produces rich, consistent metadata (objects, emotions, concepts, likely search phrases) automatically.

**Q: What is an embedding? What is a vector database?**
See section 4. Embedding = meaning as a vector. Vector DB = stores vectors and finds nearest neighbours quickly (HNSW index).

**Q: Why cosine similarity and not Euclidean distance?**
Cosine compares direction (meaning) and ignores vector length. For normalised vectors both give the same ranking; cosine is the standard for text embeddings.

**Q: Why Qdrant over FAISS / pgvector / Pinecone?**
Qdrant is open source, runs locally in Docker, stores payload with the vector (no separate DB), supports filtering, and has a simple Python client. FAISS is only a library with no persistence or payload; Pinecone is hosted/paid; pgvector would need Postgres.

**Q: Why Groq? Why Gemini for embeddings?**
Groq serves open-weight models with very low latency and supports vision + JSON-schema output. Gemini embedding model is strong on retrieval benchmarks, supports task types and adjustable dimensions. Both are wrapped in one module each, so they can be swapped.

**Q: How do you guarantee the LLM returns valid JSON?**
Three layers: JSON-schema structured output on the API, Pydantic validation, and a retry loop for known failure modes, with a sparse fallback and a 502 error if all fail.

**Q: What if the user description is wrong?**
The system prompt treats it as a hint; the model is told to prefer what is visible and ignore a wrong description. It is still stored in the semantic document as extra context.

**Q: How do you avoid duplicates?**
Point ID is a SHA-256 of image bytes turned into a UUID, and we use upsert, so re-ingesting the same image overwrites instead of duplicating.

**Q: Why are there RETRIEVAL_DOCUMENT and RETRIEVAL_QUERY task types?**
Asymmetric search: short queries vs long documents. Each is embedded in the way that maximises matching between them.

**Q: What happens if you change embedding model?**
Vectors from different models live in different spaces and cannot be compared. Create a new collection and re-ingest from `data/semantic/`, which is why every step is saved to disk.

**Q: Why does the frontend use rewrites?**
Browser only calls its own origin, avoiding CORS issues, and the backend address is configurable in one env variable.

**Q: How does the upload dialog work?**
A small state machine with five steps. Upload + generate happen together, then the user reviews, then ingests. Close is disabled during network calls.

**Q: Why is the search query in the URL?**
Shareable, bookmarkable, back-button friendly, and the page re-fetches whenever `q` changes.

**Q: What is FastAPI giving you over Flask?**
Type-hint based request parsing and validation through Pydantic, automatic OpenAPI/Swagger docs at `/docs`, async support, response models.

**Q: What is time complexity of search?**
One embedding API call (constant w.r.t. collection size) + HNSW ANN search, roughly O(log n). Brute force would be O(n·d).

**Q: What's approximate about ANN?**
HNSW may occasionally miss the true nearest neighbour in exchange for big speed gains; recall is tunable via `ef`/`m` parameters.

**Q: How would you scale this to a million images?**
Async/background ingestion queue, batch embeddings, Qdrant quantization and sharding, object storage (S3) for images, pagination, caching frequent query embeddings.

**Q: How do you evaluate search quality?**
Currently qualitative. Proper approach: labelled query→image set, measure Recall@k, Precision@k, MRR, nDCG, and compare variants (e.g. with/without `possible_search_queries`).

**Q: Any security concerns?**
Be honest: no auth, generate-endpoint path handling, no upload validation, API keys only server-side (good: never sent to the browser because only the backend reads them, and the frontend `.env` usage is limited to `BACKEND_URL` in the Next config).

**Q: What was the hardest part?**
Making LLM output reliable: missing fields, strings instead of lists, malformed JSON, repetition loops in titles. Solved with the required-field schema patch, the before-validator, and targeted retries.

---

## 11. Demo Checklist

1. `docker compose up -d` (Qdrant). Check `http://localhost:6333/dashboard`.
2. `cd backend && uv run src/server.py`. Show `http://localhost:8000/docs`.
3. `cd frontend && bun run dev`. Open `http://localhost:3000`.
4. Upload (or paste) an image with a description, show generated metadata and semantic document, ingest.
5. Search with words that do **not** appear literally in the metadata (synonyms, a mood) to prove it is semantic, not keyword search.
6. Open detail page, show tags + semantic document.
7. Optional CLI: `uv run src/main.py search "..."` and `uv run src/main.py count`.

Have `.env` filled and a few images pre-ingested in case the network or API rate limits misbehave during the demo.
