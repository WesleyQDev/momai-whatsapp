from api.router import api_router


def test_sidecar_routes_contract():
    routes = {
        (route.path, method)
        for route in api_router.routes
        for method in getattr(route, "methods", set())
        if method in {"GET", "POST"}
    }

    expected = {
        ("/voice/quick-transcribe", "POST"),
        ("/voice/wake-word", "POST"),
        ("/chat/speak", "POST"),
        ("/chat/stop-voice", "POST"),
        ("/plugins/list", "GET"),
        ("/plugins/execute", "POST"),
    }

    missing = expected - routes
    assert not missing, f"Missing sidecar routes: {sorted(missing)}"
