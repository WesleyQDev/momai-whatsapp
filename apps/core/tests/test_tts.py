"""Tests for apps/core/services/voice/tts.py"""
import pytest


class TestStripMarkdown:
    """Tests for TTSManager._strip_markdown (static method, pure logic)."""

    def test_strips_bold_markers(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("**hello**") == "hello"

    def test_strips_triple_bold(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("***hello***") == "hello"

    def test_strips_italic_markers(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("*hello*") == "hello"

    def test_strips_underline_bold(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("__hello__") == "hello"

    def test_strips_underline_italic(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("_hello_") == "hello"

    def test_strips_strikethrough(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("~~hello~~") == "hello"

    def test_strips_inline_code(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("`code`") == "code"

    def test_strips_code_block(self):
        from services.voice.tts import TTSManager
        text = "```python\nprint('hi')\n```"
        assert TTSManager._strip_markdown(text) == ""

    def test_strips_headings(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("# Title") == "Title"
        assert TTSManager._strip_markdown("## Subtitle") == "Subtitle"

    def test_strips_list_markers(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("- item") == "item"
        assert TTSManager._strip_markdown("* item") == "item"

    def test_strips_numbered_list(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("1. first") == "first"

    def test_strips_blockquote(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("> quote") == "quote"

    def test_strips_link_text_only(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("[text](url)") == "text"

    def test_strips_image_alt(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("![alt](url)") == "alt"

    def test_strips_separator(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("---") == ""

    def test_strips_table_pipe(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("a | b") == "a b"

    def test_strips_emojis(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("hello 🌍") == "hello"

    def test_collapses_multiple_spaces(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("hello    world") == "hello world"

    def test_collapses_multiple_newlines(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("a\n\n\n\nb") == "a\nb"

    def test_strips_trailing_whitespace(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("hello   ") == "hello"

    def test_empty_string(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("") == ""

    def test_plain_text_unchanged(self):
        from services.voice.tts import TTSManager
        assert TTSManager._strip_markdown("simple text") == "simple text"

    def test_mixed_markdown(self):
        from services.voice.tts import TTSManager
        text = "# Hello **world** and _foo_"
        result = TTSManager._strip_markdown(text)
        assert result == "Hello world and foo"


class TestTTSDataMaps:
    """Tests for module-level data constants."""

    def test_lang_code_map_covers_expected_languages(self):
        from services.voice.tts import LANG_CODE_MAP
        assert LANG_CODE_MAP["p"] == "pt-br"
        assert LANG_CODE_MAP["a"] == "en-us"
        assert LANG_CODE_MAP["e"] == "es"

    def test_voice_prefix_map_pairs_match_lang_codes(self):
        from services.voice.tts import VOICE_PREFIX_MAP, LANG_CODE_MAP
        for prefix, (lang, gender) in VOICE_PREFIX_MAP.items():
            assert lang in LANG_CODE_MAP.values(), f"Lang {lang} not in LANG_CODE_MAP"
            assert gender in ("male", "female")

    def test_default_voice_exists(self):
        from services.voice.tts import DEFAULT_VOICE, DEFAULT_LANG
        assert isinstance(DEFAULT_VOICE, str)
        assert len(DEFAULT_VOICE) > 0
        assert DEFAULT_LANG == "p"


class TestFindOutputDevice:
    """Tests for _find_output_device (mocked sounddevice)."""

    def test_returns_default_when_no_sounddevice(self, monkeypatch):
        from services.voice import tts
        monkeypatch.setattr(tts, "HAS_SOUNDDEVICE", False)
        monkeypatch.setattr(tts, "_ensure_tts_imports", lambda: None)
        idx, sr = tts._find_output_device()
        assert idx is None
        assert sr == 24000

    def _make_mock_sd(self, default_device_idx=0, query_fn=None):
        """Build a mock sounddevice module with proper .default.device structure."""
        mock_default = type("MockDefault", (), {"device": (None, default_device_idx)})()
        mock_sd = type("MockSD", (), {
            "default": mock_default,
            "query_devices": staticmethod(query_fn or (lambda idx=None: {
                "name": "Realtek Speakers",
                "default_samplerate": 48000,
            })),
        })()
        return mock_sd

    def test_returns_default_when_device_is_physical(self, monkeypatch):
        from services.voice import tts
        monkeypatch.setattr(tts, "HAS_SOUNDDEVICE", True)
        monkeypatch.setattr(tts, "_ensure_tts_imports", lambda: None)
        monkeypatch.setattr(tts, "sd", self._make_mock_sd())
        idx, sr = tts._find_output_device()
        assert idx is None
        assert sr == 48000

    def test_falls_back_to_physical_when_default_is_virtual(self, monkeypatch):
        from services.voice import tts
        monkeypatch.setattr(tts, "HAS_SOUNDDEVICE", True)
        monkeypatch.setattr(tts, "_ensure_tts_imports", lambda: None)

        call_count = [0]
        def mock_query(idx=None):
            call_count[0] += 1
            if call_count[0] == 1:
                return {"name": "Voicemeeter", "default_samplerate": 48000}
            return {"name": "USB Audio", "default_samplerate": 44100}

        monkeypatch.setattr(tts, "sd", self._make_mock_sd(query_fn=mock_query))
        idx, sr = tts._find_output_device()
        assert sr == 44100

    def test_returns_default_on_exception(self, monkeypatch):
        from services.voice import tts
        monkeypatch.setattr(tts, "HAS_SOUNDDEVICE", True)
        monkeypatch.setattr(tts, "_ensure_tts_imports", lambda: None)

        def mock_query(idx=None):
            raise RuntimeError("no device")

        monkeypatch.setattr(tts, "sd", self._make_mock_sd(query_fn=mock_query))
        idx, sr = tts._find_output_device()
        assert idx is None
        assert sr == 24000

    def test_finds_physical_device_by_iteration(self, monkeypatch):
        from services.voice import tts
        monkeypatch.setattr(tts, "HAS_SOUNDDEVICE", True)
        monkeypatch.setattr(tts, "_ensure_tts_imports", lambda: None)

        devices = [
            {"name": "Voicemeeter", "max_output_channels": 2, "default_samplerate": 48000},
            {"name": "USB Audio", "max_output_channels": 2, "default_samplerate": 44100},
        ]

        def mock_query(idx=None):
            if idx is None:
                return devices
            return {"name": "Voicemeeter", "default_samplerate": 48000}

        mock_default = type("MockDefault", (), {"device": (None, 0)})()
        mock_sd = type("MockSD", (), {
            "default": mock_default,
            "query_devices": staticmethod(mock_query),
        })()
        monkeypatch.setattr(tts, "sd", mock_sd)
        idx, sr = tts._find_output_device()
        assert idx == 1
        assert sr == 44100

    def test_no_physical_device_falls_back(self, monkeypatch):
        from services.voice import tts
        monkeypatch.setattr(tts, "HAS_SOUNDDEVICE", True)
        monkeypatch.setattr(tts, "_ensure_tts_imports", lambda: None)

        devices = [
            {"name": "Voicemeeter", "max_output_channels": 2, "default_samplerate": 48000},
        ]

        def mock_query(idx=None):
            if idx is None:
                return devices
            return {"name": "Voicemeeter", "default_samplerate": 48000}

        mock_default = type("MockDefault", (), {"device": (None, 0)})()
        mock_sd = type("MockSD", (), {
            "default": mock_default,
            "query_devices": staticmethod(mock_query),
        })()
        monkeypatch.setattr(tts, "sd", mock_sd)
        idx, sr = tts._find_output_device()
        assert idx is None
        assert sr == 48000

    def test_input_device_skipped(self, monkeypatch):
        from services.voice import tts
        monkeypatch.setattr(tts, "HAS_SOUNDDEVICE", True)
        monkeypatch.setattr(tts, "_ensure_tts_imports", lambda: None)

        devices = [
            {"name": "Microphone", "max_output_channels": 0, "default_samplerate": 16000},
            {"name": "Speakers", "max_output_channels": 2, "default_samplerate": 48000},
        ]

        def mock_query(idx=None):
            if idx is None:
                return devices
            return {"name": "Voicemeeter", "default_samplerate": 48000}

        mock_default = type("MockDefault", (), {"device": (None, 0)})()
        mock_sd = type("MockSD", (), {
            "default": mock_default,
            "query_devices": staticmethod(mock_query),
        })()
        monkeypatch.setattr(tts, "sd", mock_sd)
        idx, sr = tts._find_output_device()
        assert idx == 1
        assert sr == 48000


class TestTTSManagerState:
    """Tests for TTSManager singleton and state methods."""

    def test_singleton_returns_same_instance(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        m1 = TTSManager()
        m2 = TTSManager()
        assert m1 is m2

    def test_set_voice_updates_state(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.set_voice("af_heart")
        assert mgr.voice == "af_heart"

    def test_set_voice_empty_string_noop(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        original = mgr.voice
        mgr.set_voice("")
        assert mgr.voice == original

    def test_set_voice_legacy_mapping(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.set_voice("pt-BR-FranciscaNeural")
        assert mgr.voice == "pf_dora"

    def test_set_voice_invalid_format_falls_back(self):
        from services.voice.tts import TTSManager, DEFAULT_VOICE
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.set_voice("invalid")
        assert mgr.voice == DEFAULT_VOICE

    def test_set_voice_updates_lang_code(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.set_voice("af_heart")  # "af" -> "en-us"
        assert mgr.lang_code == "a"

    def test_speak_adds_to_queue(self, monkeypatch):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        monkeypatch.setattr(mgr, "start", lambda: None)
        mgr.enabled = True
        mgr.speak("hello world")
        assert not mgr.text_queue.empty()

    def test_speak_ignores_short_text(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.enabled = True
        mgr.speak("hi")
        assert mgr.text_queue.empty()

    def test_speak_ignores_when_disabled(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.enabled = False
        mgr.speak("hello world")
        assert mgr.text_queue.empty()

    def test_shutdown_sets_stop_event(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.shutdown()
        assert mgr.stop_event.is_set()

    def test_stop_clears_queue(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.text_queue.put("test")
        mgr.stop()
        assert mgr.text_queue.empty()

    def test_is_busy_false_when_not_playing(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        assert mgr.is_busy() is False

    def test_is_busy_true_when_queue_has_items(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.text_queue.put("hello")
        assert mgr.is_busy() is True

    def test_wait_until_ready_when_already_ready(self):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        mgr.has_tts = True
        assert mgr.wait_until_ready() is True

    def test_set_enabled_false_triggers_stop(self, monkeypatch):
        from services.voice.tts import TTSManager
        TTSManager._instance = None
        mgr = TTSManager()
        stop_called = [False]
        monkeypatch.setattr(mgr, "stop", lambda: stop_called.__setitem__(0, True))
        mgr.set_enabled(False)
        assert mgr.enabled is False
        assert stop_called[0]
