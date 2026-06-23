"""E2E tests for the settings JSON bridge (U001).

The settings router at apps/core/api/routes/settings.py reads/writes
node-core-store.json so the Core Python sidecar can see the same settings
that node-core writes. The SQLAlchemy Settings model in momai.db is
deprecated for new writes but kept for legacy reads.
"""
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def data_dir(tmp_path: Path, monkeypatch) -> Path:
    """Set MOMAI_DATA_DIR to a temp dir and create the data/ subdir."""
    data_dir = tmp_path / "momai"
    data_dir.mkdir()
    (data_dir / "data").mkdir()
    monkeypatch.setenv("MOMAI_DATA_DIR", str(data_dir))
    return data_dir


@pytest.fixture
def client(data_dir: Path) -> TestClient:
    from api.routes import settings as settings_route

    app = FastAPI()
    app.include_router(settings_route.router)
    return TestClient(app)


def _write_store(data_dir: Path, payload: dict) -> Path:
    store_path = data_dir / "data" / "node-core-store.json"
    store_path.write_text(json.dumps(payload), encoding="utf-8")
    return store_path


def test_get_settings_returns_empty_dict_when_store_missing(data_dir, client):
    response = client.get("/settings")
    assert response.status_code == 200
    assert response.json() == {}


def test_get_settings_returns_settings_block_from_store(data_dir, client):
    _write_store(
        data_dir,
        {
            "settings": {
                "ai_tier": "ultra",
                "tts_engine": "kokoro",
                "wake_word_enabled": True,
            },
            "threads": {"t1": {}},
        },
    )

    response = client.get("/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["ai_tier"] == "ultra"
    assert body["tts_engine"] == "kokoro"
    assert body["wake_word_enabled"] is True
    # The endpoint must not leak the `threads` block — only `settings` is exposed.
    assert "threads" not in body


def test_patch_settings_merges_into_existing_block(data_dir, client):
    _write_store(
        data_dir,
        {
            "settings": {"ai_tier": "lite", "tts_engine": "edge-tts"},
        },
    )

    response = client.patch("/settings", json={"tts_engine": "kokoro", "wake_word_enabled": True})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tts_engine"] == "kokoro"
    assert body["wake_word_enabled"] is True
    # Pre-existing keys not in the patch must be preserved.
    assert body["ai_tier"] == "lite"

    # And the file on disk must reflect the merge.
    store_path = data_dir / "data" / "node-core-store.json"
    persisted = json.loads(store_path.read_text(encoding="utf-8"))
    assert persisted["settings"]["tts_engine"] == "kokoro"
    assert persisted["settings"]["wake_word_enabled"] is True
    assert persisted["settings"]["ai_tier"] == "lite"


def test_patch_settings_404_when_store_missing(data_dir, client):
    response = client.patch("/settings", json={"ai_tier": "ultra"})

    assert response.status_code == 404


def test_patch_settings_preserves_other_top_level_keys(data_dir, client):
    _write_store(
        data_dir,
        {
            "settings": {"ai_tier": "pro"},
            "thread_messages": {"t1": [{"role": "user", "content": "hi"}]},
        },
    )

    response = client.patch("/settings", json={"ai_tier": "ultra"})

    assert response.status_code == 200
    store_path = data_dir / "data" / "node-core-store.json"
    persisted = json.loads(store_path.read_text(encoding="utf-8"))
    # Non-settings keys must survive the patch.
    assert persisted["thread_messages"] == {"t1": [{"role": "user", "content": "hi"}]}
    assert persisted["settings"]["ai_tier"] == "ultra"
