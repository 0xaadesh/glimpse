from models import RetrievalMetadata


def build_semantic_document(
    metadata: RetrievalMetadata,
    user_description: str,
) -> str:
    """
    Convert structured metadata into a semantic document optimized for
    embedding models.

    The ordering of sections is intentional:
    - Most important semantic information comes first.
    - High-signal fields (people/actions) precede lower-signal ones.
    - Lists are rendered as natural language rather than JSON.
    """

    sections = []

    # ---------------------------------------------------------
    # Title
    # ---------------------------------------------------------

    sections.append(
        f"# {metadata.title.strip()}"
    )

    # ---------------------------------------------------------
    # Summary
    # ---------------------------------------------------------

    sections.append(
        "## Summary\n"
        f"{metadata.summary.strip()}"
    )

    # ---------------------------------------------------------
    # User Description
    # ---------------------------------------------------------

    if user_description.strip():
        sections.append(
            "## User Description\n"
            f"{user_description.strip()}"
        )

    # ---------------------------------------------------------
    # People
    # ---------------------------------------------------------

    if metadata.people:
        sections.append(
            "## People\n"
            + "\n".join(
                f"- {person}" for person in metadata.people
            )
        )

    # ---------------------------------------------------------
    # Actions
    # ---------------------------------------------------------

    if metadata.actions:
        sections.append(
            "## Actions\n"
            + "\n".join(
                f"- {action}" for action in metadata.actions
            )
        )

    # ---------------------------------------------------------
    # Objects
    # ---------------------------------------------------------

    if metadata.objects:
        sections.append(
            "## Objects\n"
            + "\n".join(
                f"- {obj}" for obj in metadata.objects
            )
        )

    # ---------------------------------------------------------
    # Setting
    # ---------------------------------------------------------

    if metadata.setting:
        sections.append(
            "## Setting\n"
            + "\n".join(
                f"- {item}" for item in metadata.setting
            )
        )

    # ---------------------------------------------------------
    # Clothing
    # ---------------------------------------------------------

    if metadata.clothing:
        sections.append(
            "## Clothing\n"
            + "\n".join(
                f"- {item}" for item in metadata.clothing
            )
        )

    # ---------------------------------------------------------
    # Emotions
    # ---------------------------------------------------------

    if metadata.emotions:
        sections.append(
            "## Emotions\n"
            + "\n".join(
                f"- {item}" for item in metadata.emotions
            )
        )

    # ---------------------------------------------------------
    # Concepts
    # ---------------------------------------------------------

    if metadata.concepts:
        sections.append(
            "## Concepts\n"
            + "\n".join(
                f"- {item}" for item in metadata.concepts
            )
        )

    # ---------------------------------------------------------
    # Keywords
    # ---------------------------------------------------------

    if metadata.keywords:
        sections.append(
            "## Keywords\n"
            + "\n".join(
                f"- {item}" for item in metadata.keywords
            )
        )

    # ---------------------------------------------------------
    # Aliases
    # ---------------------------------------------------------

    if metadata.possible_search_queries:
        sections.append(
            "## Alternative Search Phrases\n"
            + "\n".join(
                f"- {item}" for item in metadata.possible_search_queries
            )
        )

    # ---------------------------------------------------------
    # Usage Contexts
    # ---------------------------------------------------------

    if metadata.usage_contexts:
        sections.append(
            "## Usage Contexts\n"
            + "\n".join(
                f"- {item}" for item in metadata.usage_contexts
            )
        )

    return "\n\n".join(sections).strip()