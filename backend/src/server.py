import sys
from pathlib import Path

# Add this directory (src/) to Python path so bare imports (config, models, etc.) resolve.
src_dir = Path(__file__).resolve().parent
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

import uvicorn


def main():
    """
    Entry point for `uv run start`.
    """

    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        # The reload worker is a fresh process, so it needs src/ on its
        # path too; app_dir adds it there.
        app_dir=str(src_dir),
        reload_dirs=[str(src_dir)],
    )


if __name__ == "__main__":
    main()
