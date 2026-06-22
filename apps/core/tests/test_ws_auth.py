import os
import pytest
from api.middleware.auth import verify_ws_token


class _StubWS:
    def __init__(self, query_string: str = ""):
        self.query_params = {}
        if query_string:
            from urllib.parse import parse_qs
            self.query_params = {k: v[0] for k, v in parse_qs(query_string).items()}


def test_verify_ws_token_returns_true_on_match(monkeypatch):
    monkeypatch.setenv("MOMAI_SESSION_TOKEN", "tok-abc")
    ws = _StubWS("token=tok-abc")
    assert verify_ws_token(ws) is True


def test_verify_ws_token_returns_false_on_mismatch(monkeypatch):
    monkeypatch.setenv("MOMAI_SESSION_TOKEN", "tok-abc")
    ws = _StubWS("token=other")
    assert verify_ws_token(ws) is False


def test_verify_ws_token_returns_false_when_missing(monkeypatch):
    monkeypatch.setenv("MOMAI_SESSION_TOKEN", "tok-abc")
    ws = _StubWS("")
    assert verify_ws_token(ws) is False


def test_verify_ws_token_returns_false_when_env_unset(monkeypatch):
    monkeypatch.delenv("MOMAI_SESSION_TOKEN", raising=False)
    ws = _StubWS("token=anything")
    assert verify_ws_token(ws) is False
