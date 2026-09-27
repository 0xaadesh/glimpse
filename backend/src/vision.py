import base64
import json
from pathlib import Path

from groq import BadRequestError, Groq
from pydantic import ValidationError

import config
from models import RetrievalMetadata


client = Groq(api_key=config.GROQ_API_KEY)

# The vision model occasionally emits malformed JSON, which Groq rejects
# with json_validate_failed. A fresh sample usually succeeds.
MAX_ATTEMPTS = 3

# Models sometimes fall into a repetition loop and stuff the title with
# keywords. Anything this long is treated as a bad sample and retried.
MAX_TITLE_LENGTH = 120


class VisionError(Exception):
    """Raised when the vision model cannot produce valid metadata."""


# List fields have defaults so older metadata files still load, but the
# model treats non-required fields as optional and may skip them all.
# Require every field in the schema sent to the model.
RESPONSE_SCHEMA = RetrievalMetadata.model_json_schema()
RESPONSE_SCHEMA["required"] = list(RESPONSE_SCHEMA["properties"])

LIST_FIELDS = [
    name
    for name in RetrievalMetadata.model_fields
    if name not in ("title", "summary")
]


def _has_details(metadata: RetrievalMetadata) -> bool:
    return any(getattr(metadata, name) for name in LIST_FIELDS)


SYSTEM_PROMPT = """
You are an expert semantic indexing assistant.

The user will provide:

1. An image.
2. Their own assumption or description of the image.

The user's description is NOT guaranteed to be correct.
Treat it only as additional context.

Your job is to carefully inspect the image and produce structured metadata
optimized for semantic image retrieval.

The metadata will later be embedded and stored in a vector database.

Guidelines:

- Prefer what is actually visible.
- If the user's assumption is incorrect, ignore it.
- Do not invent facts.
- Describe only what can reasonably be inferred.

Output completeness (mandatory):

- Include EVERY field below in every response. Never omit a field.
- Every array field MUST contain at least one item.
- The only exceptions: "people" may be [] when no person is visible or
  identifiable, and "clothing" may be [] when no clothing is visible.
- Returning only "title" and "summary" is a failed response. The metadata
  is embedded for search, so every empty field is lost search context.
- If an image is simple or low quality, still describe what is visible:
  objects, text overlays, colors, gestures, mood, and likely uses.
- The user description may contain slang, profanity, or crude humor,
  which is common in memes. Treat it as context and still fill every field.

title
A short descriptive title: one phrase, at most 12 words. Never a list of
keywords, never repeated phrases. Search terms belong in "keywords" and
"possible_search_queries", not in the title.

summary
A natural language description of the image.

people
Named people if confidently identifiable.

objects
Visible objects.

actions
Visible actions.

setting
Environment/location (always a JSON array).

clothing
Important clothing.

emotions
Visible expressions or mood.

concepts
High-level concepts.

keywords
Important searchable words.

possible_search_queries
Alternative ways someone might search for this image.

usage_contexts
Contexts where this image could be used (reactions, captions, articles, presentations, etc.).

Every field except "title" and "summary" MUST be a JSON array of strings.
Every field MUST be present in the output.
Return ONLY valid JSON.
"""


def _encode_image(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("utf-8")


def generate_metadata(
    image_path: Path,
    user_description: str,
) -> RetrievalMetadata:
    """
    Analyze an image using Groq Vision and return RetrievalMetadata.
    """

    encoded = _encode_image(image_path)

    last_error: Exception | None = None
    sparse: RetrievalMetadata | None = None

    for _ in range(MAX_ATTEMPTS):
        try:
            metadata = _request_metadata(encoded, user_description)
        except BadRequestError as err:
            if "json_validate_failed" not in str(err):
                raise
            last_error = err
            continue
        except (json.JSONDecodeError, ValidationError) as err:
            last_error = err
            continue

        if len(metadata.title) > MAX_TITLE_LENGTH:
            last_error = ValueError(
                f"Title is {len(metadata.title)} characters long"
            )
            continue

        if _has_details(metadata):
            return metadata

        # Valid JSON but only title and summary: try again, and keep it
        # as a fallback since it is still searchable.
        sparse = metadata

    if sparse is not None:
        return sparse

    raise VisionError(
        f"Vision model returned invalid output {MAX_ATTEMPTS} times. "
        "Try again or adjust the description."
    ) from last_error


def _request_metadata(
    encoded: str,
    user_description: str,
) -> RetrievalMetadata:
    response = client.chat.completions.create(
        model=config.VISION_MODEL,
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"""
User Description:

{user_description}
""",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{encoded}"
                        },
                    },
                ],
            },
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "retrieval_metadata",
                "schema": RESPONSE_SCHEMA,
            },
        },
    )

    return RetrievalMetadata.model_validate(
        json.loads(response.choices[0].message.content)
    )