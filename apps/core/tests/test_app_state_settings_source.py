"""Tests for app_state.get_settings_cached().

The cached settings function is the chokepoint for all settings reads
(chat_voice, voice, i18n, startup). After the U001 cutover, it must
read from node-core-store.json (single source of truth) instead of
the legacy SQLite Settings table.
"""
import json
from pathlib import Path

import pytest


@pytest.fixture
def data_dir(tmp_path: Path, monkeypatch) -> Path:
    """Set MOMAI_DATA_DIR to a temp dir and create the data/ subdir."""
    data_dir = tmp_path / "momai"
    data_dir.mkdir()
    (data_dir / "data").mkdir()
    monkeypatch.setenv("MOMAI_DATA_DIR", str(data_dir))
    return data_dir


@pytest.fixture
def reset_settings_cache():
    """Reset app_state's module-level cache so each test reads fresh."""
    import app_state
    app_state._settings_cache = None
    app_state._settings_cache_time = 0
    yield
    app_state._settings_cache = None
    app_state._settings_cache_time = 0


def _write_store(data_dir: Path, payload: dict) -> Path:
    store_path = data_dir / "data" / "node-core-store.json"
    store_path.write_text(json.dumps(payload), encoding="utf-8")
    return store_path


async def test_get_settings_cached_returns_none_when_store_missing(
    data_dir, reset_settings_cache
):
    import app_state

    result = await app_state.get_settings_cached()

    assert result is None


async def test_get_settings_cached_returns_none_when_settings_block_missing(
    data_dir, reset_settings_cache
):
    _write_store(data_dir, {"thread_messages": {"t1": []}})
    import app_state

    result = await app_state.get_settings_cached()

    assert result is None


async def test_get_settings_cached_returns_settings_object_from_json(
    data_dir, reset_settings_cache
):
    from database.models import Settings

    _write_store(
        data_dir,
        {
            "settings": {
                "ai_tier": "ultra",
                "tts_engine": "kokoro",
                "tts_voice": "pf_dora",
                "tts_enabled": True,
                "wake_word_enabled": True,
                "locale": "en-US",
                "user_name": "Wesley",
            },
            "thread_messages": {"t1": []},
        },
    )
    import app_state

    result = await app_state.get_settings_cached()

    assert isinstance(result, Settings)
    assert result.ai_tier == "ultra"
    assert result.tts_engine == "kokoro"
    assert result.tts_voice == "pf_dora"
    assert result.tts_enabled is True
    assert result.wake_word_enabled is True
    assert result.locale == "en-US"
    assert result.user_name == "Wesley"


async def test_get_settings_cached_ignores_unknown_keys_in_json(
    data_dir, reset_settings_cache
):
    """Keys not declared on the Settings model must be ignored, not crash."""
    _write_store(
        data_dir,
        {
            "settings": {
                "ai_tier": "pro",
                "this_key_is_not_on_settings_model": "garbage",
            },
        },
    )
    import app_state

    result = await app_state.get_settings_cached()

    assert result is not None
    assert result.ai_tier == "pro"
    assert not hasattr(result, "this_key_is_not_on_settings_model") or \
        getattr(result, "this_key_is_not_on_settings_model", None) is None


async def test_get_settings_cached_returns_none_on_malformed_json(
    data_dir, reset_settings_cache
):
    """A corrupt store file must not break callers — return None gracefully."""
    store_path = data_dir / "data" / "node-core-store.json"
    store_path.write_text("{this is not valid json", encoding="utf-8")
    import app_state

    result = await app_state.get_settings_cached()

    assert result is None


async def test_get_settings_cached_uses_ttl_cache(
    data_dir, reset_settings_cache, monkeypatch
):
    """A second call within the TTL must return the same object instance."""
    import app_state
    from database.models import Settings

    _write_store(
        data_dir,
        {"settings": {"ai_tier": "lite"}},
    )

    first = await app_state.get_settings_cached()
    # Mutate the on-disk store: cached value should still be returned.
    _write_store(
        data_dir,
        {"settings": {"ai_tier": "ultra"}},
    )
    second = await app_state.get_settings_cached()

    assert first is second
    assert isinstance(first, Settings)
    assert first.ai_tier == "lite"


async def test_get_settings_cached_reflects_changes_after_ttl_expiry(
    data_dir, reset_settings_cache, monkeypatch
):
    """Once the TTL elapses, a fresh read must pick up the new value."""
    import app_state

    _write_store(data_dir, {"settings": {"ai_tier": "lite"}})
    first = await app_state.get_settings_cached()
    assert first.ai_tier == "lite"

    _write_store(data_dir, {"settings": {"ai_tier": "ultra"}})

    # Force the cache to look stale by rewinding the timestamp past the TTL.
    app_state._settings_cache_time = app_state._settings_cache_time - 100
    second = await app_state.get_settings_cached()

    assert second.ai_tier == "ultra"
