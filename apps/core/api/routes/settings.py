"""Settings JSON bridge.

Exposes the contents of ``node-core-store.json`` (written by the Node-core
sidecar) over FastAPI so the Python sidecar can read and patch user settings
without duplicating them in ``momai.db``.

node-core-store.json is the **single source of truth** for user settings
(see privacy plan: 2026-06-23-momai-privacy-data-cleanup, Task 3.1 / U001).
The legacy SQLAlchemy ``Settings`` model in ``database/models.py`` is kept
read-only for compatibility but new writes go through this JSON store.
"""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/settings", tags=["settings"])


def _store_path() -> Path:
    data_dir = Path(os.environ.get("MOMAI_DATA_DIR", "."))
    return data_dir / "data" / "node-core-store.json"


@router.get("")
def get_settings():
    p = _store_path()
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8")).get("settings", {})


@router.patch("")
def patch_settings(patch: dict):
    p = _store_path()
    if not p.exists():
        raise HTTPException(404, "store not found")
    store = json.loads(p.read_text(encoding="utf-8"))
    store.setdefault("settings", {}).update(patch)
    p.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")
    return store["settings"]
