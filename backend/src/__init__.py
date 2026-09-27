import sys
from pathlib import Path

# Ensure bare imports (config, models, etc.) resolve when
# this package is imported via `src.api` by uvicorn.
_src_dir = str(Path(__file__).resolve().parent)
if _src_dir not in sys.path:
    sys.path.insert(0, _src_dir)
