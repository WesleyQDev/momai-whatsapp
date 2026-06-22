from api.middleware.error_handler import sanitize_message, is_safe_message


def test_sanitize_message_returns_generic_in_prod():
    out = sanitize_message("ENOENT: no such file or directory, open '/etc/passwd'", is_dev=False)
    assert out == "Internal server error"


def test_sanitize_message_returns_full_in_dev():
    out = sanitize_message("ENOENT: no such file or directory", is_dev=True)
    assert "ENOENT" in out


def test_is_safe_message_accepts_generic():
    for m in ("Internal server error", "Service unavailable", "Bad request", "Not found"):
        assert is_safe_message(m) is True


def test_is_safe_message_rejects_paths():
    assert is_safe_message("/etc/passwd") is False
    assert is_safe_message("C:\\Users\\admin\\file.txt") is False


def test_is_safe_message_rejects_stacks():
    assert is_safe_message("Error: foo at /path/to/file.py:42") is False
    assert is_safe_message("Traceback (most recent call last):") is False
