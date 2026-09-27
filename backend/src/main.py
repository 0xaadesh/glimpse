import sys
import io

# Force UTF-8 output on Windows (cp1252 can't render Rich box-drawing chars)
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path
import json

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

import config

from vision import generate_metadata
from semantic import build_semantic_document
from qdrant_db import ImageVectorStore
from models import RetrievalMetadata


app = typer.Typer(
    no_args_is_help=True,
    pretty_exceptions_show_locals=False,
)

console = Console(force_terminal=True)

store = ImageVectorStore()


# ---------------------------------------------------------
# Generate
# ---------------------------------------------------------

@app.command()
def generate(
    image: Path,
    description: str,
):
    """
    Generate metadata + semantic document.
    """

    console.print(
        Panel.fit(
            f"Analyzing [bold cyan]{image.name}[/bold cyan]"
        )
    )

    metadata = generate_metadata(
        image,
        description,
    )

    metadata_path = (
        config.METADATA_DIR
        / f"{image.stem}.json"
    )

    semantic_path = (
        config.SEMANTIC_DIR
        / f"{image.stem}.md"
    )

    metadata_path.write_text(
        metadata.model_dump_json(indent=2),
        encoding="utf8",
    )

    semantic_doc = build_semantic_document(
        metadata,
        description,
    )

    semantic_path.write_text(
        semantic_doc,
        encoding="utf8",
    )

    console.print()

    console.print(
        "[bold green]OK[/] Metadata saved:",
        metadata_path,
    )

    console.print(
        "[bold green]OK[/] Semantic document saved:",
        semantic_path,
    )


# ---------------------------------------------------------
# Ingest
# ---------------------------------------------------------

@app.command()
def ingest(
    semantic_file: Path,
):
    """
    Embed and insert into Qdrant.
    """

    stem = semantic_file.stem

    metadata_file = (
        config.METADATA_DIR
        / f"{stem}.json"
    )

    image = None

    for ext in (
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
    ):
        candidate = (
            config.IMAGES_DIR
            / f"{stem}{ext}"
        )

        if candidate.exists():
            image = candidate
            break

    if image is None:
        raise typer.BadParameter(
            "Matching image not found."
        )

    metadata = RetrievalMetadata.model_validate_json(
        metadata_file.read_text(
            encoding="utf8"
        )
    )

    semantic_doc = semantic_file.read_text(
        encoding="utf8"
    )

    store.upsert(
        image_path=image,
        semantic_document=semantic_doc,
        metadata=metadata.model_dump(),
    )

    console.print()

    console.print(
        f"[bold green]OK[/] Indexed {image.name}"
    )


# ---------------------------------------------------------
# Search
# ---------------------------------------------------------

@app.command()
def search(
    query: str,
    limit: int = 10,
):
    """
    Semantic search.
    """

    results = store.search(
        query=query,
        limit=limit,
    )

    table = Table(
        title=f'Results for "{query}"'
    )

    table.add_column(
        "Score",
        style="cyan",
    )

    table.add_column(
        "Image",
        style="green",
    )

    table.add_column(
        "Title",
    )

    for result in results:

        payload = result.payload

        table.add_row(
            f"{result.score:.3f}",
            payload["filename"],
            payload["title"],
        )

    console.print(table)


# ---------------------------------------------------------
# Count
# ---------------------------------------------------------

@app.command()
def count():
    """
    Number of indexed images.
    """

    console.print(
        f"[bold cyan]{store.count()}[/bold cyan] indexed images."
    )


if __name__ == "__main__":
    app()