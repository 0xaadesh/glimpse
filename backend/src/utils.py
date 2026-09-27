from pathlib import Path

import config


SUPPORTED_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
}


def image_path(stem: str) -> Path:
    """
    Locate an image inside data/images.
    """

    for ext in SUPPORTED_IMAGE_EXTENSIONS:
        candidate = config.IMAGES_DIR / f"{stem}{ext}"

        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        f"No image found for '{stem}'."
    )


def metadata_path(stem: str) -> Path:
    return config.METADATA_DIR / f"{stem}.json"


def semantic_path(stem: str) -> Path:
    return config.SEMANTIC_DIR / f"{stem}.md"


def ensure_exists(path: Path):
    if not path.exists():
        raise FileNotFoundError(path)