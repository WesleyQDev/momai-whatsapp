import os
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from api.middleware.auth import verify_token


@pytest.fixture
def app_with_token():
    os.environ["MOMAI_SESSION_TOKEN"] = "test-token-xyz"
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(verify_token)])
    def protected():
        return {"ok": True}

    return app


@pytest.fixture
def client(app_with_token):
    return TestClient(app_with_token)


def test_request_with_valid_token_passes(client):
    response = client.get("/protected", headers={"Authorization": "Bearer test-token-xyz"})
    assert response.status_code == 200


def test_request_without_token_returns_401(client):
    response = client.get("/protected")
    assert response.status_code == 401


def test_request_with_wrong_token_returns_401(client):
    response = client.get("/protected", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401


def test_request_with_malformed_header_returns_401(client):
    response = client.get("/protected", headers={"Authorization": "test-token-xyz"})
    assert response.status_code == 401


def test_no_token_in_env_returns_500(monkeypatch):
    monkeypatch.delenv("MOMAI_SESSION_TOKEN", raising=False)
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(verify_token)])
    def protected():
        return {"ok": True}

    client = TestClient(app)
    response = client.get("/protected", headers={"Authorization": "Bearer anything"})
    assert response.status_code == 500
