from api.router import api_router, include_routes


include_routes()


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
        ("/voice/call-mode", "POST"),
        ("/chat/speak", "POST"),
        ("/chat/stop-voice", "POST"),
    }

    missing = expected - routes
    assert not missing, f"Missing sidecar routes: {sorted(missing)}"


def test_legacy_routes_are_not_exposed():
    routes = {
        route.path
        for route in api_router.routes
    }

    forbidden_prefixes = (
        "/status",
        "/settings",
        "/reminders",
        "/extensions",
        "/mode",
        "/setup",
        "/chat/history",
        "/chat/stream",
        "/chat/title",
        "/chat/sessions",
    )

    leaked = sorted(path for path in routes if path.startswith(forbidden_prefixes))
    assert not leaked, f"Legacy routes still exposed in sidecar: {leaked}"
