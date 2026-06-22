from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from api.middleware.rate_limit import build_limiter, rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


def _build_app(limit: str = "2/minute"):
    app = FastAPI()
    limiter = build_limiter(limit)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    @app.get("/ping")
    @limiter.limit(limit)
    def ping(request: Request):
        return {"ok": True}

    return app


def test_rate_limit_allows_under_limit():
    app = _build_app()
    client = TestClient(app)
    r1 = client.get("/ping")
    r2 = client.get("/ping")
    assert r1.status_code == 200
    assert r2.status_code == 200


def test_rate_limit_blocks_over_limit():
    app = _build_app(limit="2/minute")
    client = TestClient(app)
    client.get("/ping")
    client.get("/ping")
    r3 = client.get("/ping")
    assert r3.status_code == 429
