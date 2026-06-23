import os
import sys
from pathlib import Path


def test_app_state_sets_hf_home(monkeypatch, tmp_path):
    data_dir = tmp_path / "momai"
    data_dir.mkdir()
    monkeypatch.setenv("MOMAI_DATA_DIR", str(data_dir))

    if "HF_HOME" in os.environ:
        monkeypatch.delenv("HF_HOME")

    if "app_state" in sys.modules:
        del sys.modules["app_state"]
    import app_state  # noqa: F401

    expected = str(data_dir / "cache" / "huggingface")
    assert os.environ.get("HF_HOME") == expected, (
        f"HF_HOME not set. Expected {expected}, got {os.environ.get('HF_HOME')}"
    )
    assert Path(expected).exists(), "cache/huggingface dir not created"


def test_app_state_does_not_override_existing_hf_home(monkeypatch, tmp_path):
    data_dir = tmp_path / "momai"
    data_dir.mkdir()
    user_hf_home = tmp_path / "user_hf"
    user_hf_home.mkdir()
    monkeypatch.setenv("MOMAI_DATA_DIR", str(data_dir))
    monkeypatch.setenv("HF_HOME", str(user_hf_home))

    if "app_state" in sys.modules:
        del sys.modules["app_state"]
    import app_state  # noqa: F401

    assert os.environ.get("HF_HOME") == str(user_hf_home), (
        f"app_state overrode user HF_HOME. Expected {user_hf_home}, "
        f"got {os.environ.get('HF_HOME')}"
    )


def test_app_state_does_nothing_without_momai_data_dir(monkeypatch):
    if "MOMAI_DATA_DIR" in os.environ:
        monkeypatch.delenv("MOMAI_DATA_DIR")
    if "HF_HOME" in os.environ:
        monkeypatch.delenv("HF_HOME")

    if "app_state" in sys.modules:
        del sys.modules["app_state"]
    import app_state  # noqa: F401

    assert "HF_HOME" not in os.environ, (
        "app_state set HF_HOME even though MOMAI_DATA_DIR was not set"
    )
