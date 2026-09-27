"""
FastAPI backend for Glimpse.

Exposes the existing Python pipeline (vision, embeddings, qdrant)
as a REST API consumed by the Next.js frontend.
"""

import shutil
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
from models import RetrievalMetadata
from qdrant_db import ImageVectorStore
from semantic import build_semantic_document
from vision import VisionError, generate_metadata


# ---------------------------------------------------------
# App
# ---------------------------------------------------------

app = FastAPI(
    title="Glimpse API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images as static files
app.mount(
    "/images",
    StaticFiles(directory=str(config.IMAGES_DIR)),
    name="images",
)

store = ImageVectorStore()


# ---------------------------------------------------------
# Response Models
# ---------------------------------------------------------

class UploadResponse(BaseModel):
    filename: str
    message: str


class GenerateResponse(BaseModel):
    filename: str
    metadata: RetrievalMetadata
    semantic_document: str


class IngestResponse(BaseModel):
    filename: str
    message: str


class ImageResponse(BaseModel):
    id: str
    filename: str
    image_path: str
    title: str
    summary: str
    semantic_document: str
    people: list[str]
    objects: list[str]
    actions: list[str]
    setting: list[str]
    clothing: list[str]
    emotions: list[str]
    concepts: list[str]
    keywords: list[str]
    possible_search_queries: list[str]
    usage_contexts: list[str]
    score: float | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[ImageResponse]


class ImageListResponse(BaseModel):
    images: list[ImageResponse]
    count: int


# ---------------------------------------------------------
# Upload
# ---------------------------------------------------------

@app.post("/api/upload", response_model=UploadResponse)
async def upload_image(file: UploadFile = File(...)):
    """
    Upload an image file to data/images/.
    """

    if not file.filename:
        raise HTTPException(400, "No filename provided.")

    # Sanitize filename
    safe_name = Path(file.filename).name
    dest = config.IMAGES_DIR / safe_name

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return UploadResponse(
        filename=safe_name,
        message=f"Uploaded {safe_name}",
    )


# ---------------------------------------------------------
# Generate
# ---------------------------------------------------------

@app.post("/api/generate", response_model=GenerateResponse)
async def generate(
    filename: str = Form(...),
    description: str = Form(...),
):
    """
    Run vision LLM on an uploaded image to produce metadata
    and a semantic document.
    """

    image_path = config.IMAGES_DIR / filename

    if not image_path.exists():
        raise HTTPException(
            404,
            f"Image {filename} not found. Upload it first.",
        )

    # Generate metadata via Groq Vision
    try:
        metadata = generate_metadata(image_path, description)
    except VisionError as err:
        raise HTTPException(502, str(err)) from err

    # Save metadata JSON
    metadata_path = config.METADATA_DIR / f"{image_path.stem}.json"
    metadata_path.write_text(
        metadata.model_dump_json(indent=2),
        encoding="utf8",
    )

    # Build semantic document
    semantic_doc = build_semantic_document(metadata, description)

    # Save semantic document
    semantic_path = config.SEMANTIC_DIR / f"{image_path.stem}.md"
    semantic_path.write_text(semantic_doc, encoding="utf8")

    return GenerateResponse(
        filename=filename,
        metadata=metadata,
        semantic_document=semantic_doc,
    )


# ---------------------------------------------------------
# Ingest
# ---------------------------------------------------------

@app.post("/api/ingest", response_model=IngestResponse)
async def ingest(filename: str = Form(...)):
    """
    Embed the semantic document and upsert into Qdrant.
    """

    stem = Path(filename).stem

    # Find the image
    image_path = None
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        candidate = config.IMAGES_DIR / f"{stem}{ext}"
        if candidate.exists():
            image_path = candidate
            break

    if image_path is None:
        raise HTTPException(404, "Matching image not found.")

    # Read semantic document
    semantic_path = config.SEMANTIC_DIR / f"{stem}.md"
    if not semantic_path.exists():
        raise HTTPException(
            404,
            "Semantic document not found. Run /api/generate first.",
        )

    semantic_doc = semantic_path.read_text(encoding="utf8")

    # Read metadata
    metadata_path = config.METADATA_DIR / f"{stem}.json"
    if not metadata_path.exists():
        raise HTTPException(404, "Metadata not found.")

    metadata = RetrievalMetadata.model_validate_json(
        metadata_path.read_text(encoding="utf8")
    )

    # Upsert into Qdrant
    store.upsert(
        image_path=image_path,
        semantic_document=semantic_doc,
        metadata=metadata.model_dump(),
    )

    return IngestResponse(
        filename=filename,
        message=f"Indexed {filename}",
    )


# ---------------------------------------------------------
# Search
# ---------------------------------------------------------

@app.get("/api/search", response_model=SearchResponse)
async def search(q: str, limit: int = 10):
    """
    Semantic search across all indexed images.
    """

    results = store.search(query=q, limit=limit)

    images = [
        ImageResponse(
            id=str(r.id),
            score=r.score,
            **r.payload,
        )
        for r in results
    ]

    return SearchResponse(query=q, results=images)


# ---------------------------------------------------------
# List All Images
# ---------------------------------------------------------

@app.get("/api/images", response_model=ImageListResponse)
async def list_images():
    """
    Return all indexed images by scrolling the Qdrant collection.
    """

    points, _ = store.client.scroll(
        collection_name=config.QDRANT_COLLECTION,
        limit=100,
        with_payload=True,
        with_vectors=False,
    )

    images = [
        ImageResponse(id=str(p.id), **p.payload)
        for p in points
    ]

    return ImageListResponse(
        images=images,
        count=len(images),
    )


# ---------------------------------------------------------
# Single Image Detail
# ---------------------------------------------------------

@app.get("/api/images/{image_id}", response_model=ImageResponse)
async def get_image(image_id: str):
    """
    Get a single image by its Qdrant point ID.
    """

    results = store.client.retrieve(
        collection_name=config.QDRANT_COLLECTION,
        ids=[image_id],
        with_payload=True,
        with_vectors=False,
    )

    if not results:
        raise HTTPException(404, "Image not found.")

    point = results[0]

    return ImageResponse(
        id=str(point.id),
        **point.payload,
    )
