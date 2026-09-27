from pathlib import Path

from dotenv import load_dotenv
import os

# Single .env at the project root, shared with the frontend.
PROJECT_ROOT = Path(__file__).resolve().parents[2]

load_dotenv(PROJECT_ROOT / ".env")


# =========================
# API Keys
# =========================

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is missing from .env")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing from .env")


# =========================
# Models
# =========================

VISION_MODEL = os.getenv("VISION_MODEL")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL")

if not VISION_MODEL:
    raise RuntimeError("VISION_MODEL is missing from .env")

if not EMBEDDING_MODEL:
    raise RuntimeError("EMBEDDING_MODEL is missing from .env")

# Vector size produced by EMBEDDING_MODEL. Must match the size of the
# existing Qdrant collection, so changing it requires a new collection.
EMBEDDING_DIMENSIONS = os.getenv("EMBEDDING_DIMENSIONS")

if not EMBEDDING_DIMENSIONS:
    raise RuntimeError("EMBEDDING_DIMENSIONS is missing from .env")

EMBEDDING_DIMENSIONS = int(EMBEDDING_DIMENSIONS)


# =========================
# Qdrant
# =========================

QDRANT_URL = os.getenv(
    "QDRANT_URL",
    "http://localhost:6333",
)

QDRANT_COLLECTION = os.getenv(
    "QDRANT_COLLECTION",
    "images",
)




# =========================
# Paths
# =========================

ROOT_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = ROOT_DIR / "data"

IMAGES_DIR = DATA_DIR / "images"

METADATA_DIR = DATA_DIR / "metadata"

SEMANTIC_DIR = DATA_DIR / "semantic"


# Automatically create directories
for directory in (
    DATA_DIR,
    IMAGES_DIR,
    METADATA_DIR,
    SEMANTIC_DIR,
):
    directory.mkdir(
        parents=True,
        exist_ok=True,
    )