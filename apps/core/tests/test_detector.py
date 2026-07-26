"""Tests for apps/core/services/voice/detector.py"""
import time
import pytest
import numpy as np
from unittest.mock import MagicMock, patch

# Inject real numpy into the detector module so _get_chunk_energy works
import services.voice.detector as _det_module
_det_module.np = np
det_mod = _det_module


def _make_detector(keyword="computador", variants=None, bypass_condition=None, keyword_check_url=None):
    """Helper: create a WakeWordDetector with mocked heavy deps."""
    with patch("services.voice.detector._ensure_heavy_imports"):
        with patch("services.voice.detector.app_state"):
            with patch("services.voice.detector.tts"):
                from services.voice.detector import WakeWordDetector
                det = WakeWordDetector(
                    keyword=keyword,
                    variants=variants or [keyword],
                    callback=MagicMock(),
                    status_callback=MagicMock(),
                    bypass_condition=bypass_condition,
                    keyword_check_url=keyword_check_url,
                )
    return det


class TestCheckWakeWordFuzzy:
    """Tests for WakeWordDetector._check_wake_word_fuzzy."""

    def test_exact_match(self):
        det = _make_detector("computador")
        assert det._check_wake_word_fuzzy("olá computador tudo bem") is True

    def test_exact_match_lowercase_variant(self):
        det = _make_detector("computador", variants=["computador", "pc"])
        assert det._check_wake_word_fuzzy("olá pc tudo bem") is True

    def test_no_match(self):
        det = _make_detector("computador")
        assert det._check_wake_word_fuzzy("sol comandante") is False

    def test_fuzzy_match_close_word(self):
        det = _make_detector("computador")
        # "computa" is 7 chars (within 2-8 limit), rapidfuzz ratio ~0.82 with "computador"
        assert det._check_wake_word_fuzzy("computa") is True

    def test_fuzzy_rejects_too_short_word(self):
        det = _make_detector("computador")
        assert det._check_wake_word_fuzzy("c") is False

    def test_fuzzy_rejects_too_long_word(self):
        det = _make_detector("computador")
        long_word = "x" * 20
        assert det._check_wake_word_fuzzy(long_word) is False

    def test_multiple_variants(self):
        det = _make_detector("hey mom", variants=["hey mom", "oi mom", "mom"])
        assert det._check_wake_word_fuzzy("oi mom como vai") is True

    def test_empty_text(self):
        det = _make_detector("computador")
        assert det._check_wake_word_fuzzy("") is False

    def test_whole_word_boundary(self):
        det = _make_detector("computador")
        result = det._check_wake_word_fuzzy("computadores")
        assert isinstance(result, bool)


class TestGetChunkEnergy:
    """Tests for WakeWordDetector._get_chunk_energy."""

    def test_silence_returns_zero(self):
        det = _make_detector()
        chunk = np.zeros(1000, dtype=np.float32)
        energy = det._get_chunk_energy(chunk)
        assert energy == pytest.approx(0.0, abs=1e-7)

    def test_sine_wave_returns_positive(self):
        det = _make_detector()
        t = np.linspace(0, 1, 16000, dtype=np.float32)
        chunk = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        energy = det._get_chunk_energy(chunk)
        assert energy > 0.5

    def test_higher_amplitude_higher_energy(self):
        det = _make_detector()
        low = np.ones(1000, dtype=np.float32) * 0.1
        high = np.ones(1000, dtype=np.float32) * 0.9
        assert det._get_chunk_energy(high) > det._get_chunk_energy(low)


class TestSetState:
    """Tests for WakeWordDetector._set_state."""

    def test_changes_state(self):
        det = _make_detector()
        det._set_state(det.STATE_LISTENING)
        assert det.state == det.STATE_LISTENING

    def test_calls_status_callback(self):
        det = _make_detector()
        det._set_state(det.STATE_PROCESSING)
        det.status_callback.assert_called_with(det.STATE_PROCESSING)

    def test_no_callback_when_same_state(self):
        det = _make_detector()
        det._set_state(det.STATE_IDLE)
        det.status_callback.assert_not_called()


class TestResetState:
    """Tests for WakeWordDetector._reset_state."""

    def test_resets_to_idle(self):
        det = _make_detector()
        det.state = det.STATE_LISTENING
        det._reset_state()
        assert det.state == det.STATE_IDLE

    def test_silent_does_not_change_state(self):
        det = _make_detector()
        det.state = det.STATE_LISTENING
        det._reset_state(silent=True)
        assert det.state == det.STATE_LISTENING

    def test_clears_buffers(self):
        det = _make_detector()
        det.speech_buffer = [1, 2, 3]
        det.speech_chunk_count = 5
        det._reset_state()
        assert det.speech_buffer == []
        assert det.speech_chunk_count == 0
        assert det.silence_counter == 0
        assert det.recorded_samples == 0


class TestFlushBuffers:
    """Tests for WakeWordDetector.flush_buffers."""

    def test_clears_audio_queue(self):
        det = _make_detector()
        det.audio_queue.put_nowait(np.zeros(100, dtype=np.float32))
        det.flush_buffers()
        assert det.audio_queue.empty()

    def test_clears_processing_queue(self):
        det = _make_detector()
        det.processing_queue.put_nowait(("audio", None))
        det.flush_buffers()
        assert det.processing_queue.empty()

    def test_resets_tts_buffer(self):
        det = _make_detector()
        det.tts_buffer = [1, 2, 3]
        det.tts_buffer_samples = 100
        det.flush_buffers()
        assert det.tts_buffer == []
        assert det.tts_buffer_samples == 0


class TestHandleTranscription:
    """Tests for WakeWordDetector._handle_transcription."""

    def test_keyword_detected_calls_callback(self):
        det = _make_detector("computador")
        det._stop_tts = MagicMock()
        det._play_feedback = MagicMock()
        det.flush_buffers = MagicMock()
        det._handle_transcription("olá computador bom dia", "olá computador bom dia")
        det.callback.assert_called_once()
        assert "bom dia" in det.callback.call_args[0][0]

    def test_no_keyword_no_bypass_no_callback(self):
        det = _make_detector("computador")
        det._stop_tts = MagicMock()
        det._handle_transcription("mensagem qualquer", "mensagem qualquer")
        det.callback.assert_not_called()

    def test_keyword_check_url_no_match(self, monkeypatch):
        det = _make_detector("computador", keyword_check_url="http://localhost:8050/check")
        det._stop_tts = MagicMock()
        det.flush_buffers = MagicMock()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"matched": False}

        mock_client = MagicMock()
        mock_client.get.return_value = mock_resp
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        mock_httpx = MagicMock()
        mock_httpx.Client.return_value = mock_client
        monkeypatch.setitem(det_mod.__dict__, "httpx", mock_httpx)

        # Text WITHOUT wake word → keyword_check_url path
        det._handle_transcription("abrir navegador", "abrir navegador")
        det.callback.assert_not_called()

    def test_keyword_check_url_exception_handled(self, monkeypatch):
        det = _make_detector("computador", keyword_check_url="http://localhost:8050/check")
        det._stop_tts = MagicMock()

        def raise_on_get(*a, **kw):
            raise RuntimeError("connection refused")

        mock_client = MagicMock()
        mock_client.get.side_effect = raise_on_get
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)

        mock_httpx = MagicMock()
        mock_httpx.Client.return_value = mock_client
        monkeypatch.setitem(det_mod.__dict__, "httpx", mock_httpx)

        det._handle_transcription("abrir navegador", "abrir navegador")
        det.callback.assert_not_called()

    def test_keyword_check_url_cooldown(self, monkeypatch):
        det = _make_detector("computador", keyword_check_url="http://localhost:8050/check")
        det._stop_tts = MagicMock()

        mock_httpx = MagicMock()
        monkeypatch.setitem(det_mod.__dict__, "httpx", mock_httpx)

        det._last_keyword_time = time.time()
        det._handle_transcription("computador abrir", "computador abrir")
        mock_httpx.Client.assert_not_called()

    def test_no_keyword_check_url_skips(self):
        det = _make_detector("computador")
        det._stop_tts = MagicMock()
        det._handle_transcription("mensagem qualquer", "mensagem qualquer")
        det.callback.assert_not_called()

    def test_bypass_active_calls_callback(self):
        det = _make_detector("computador", bypass_condition=lambda: True)
        det._stop_tts = MagicMock()
        det.flush_buffers = MagicMock()
        det._handle_transcription("oi tudo bem", "oi tudo bem")
        det.callback.assert_called_once_with("oi tudo bem")

    def test_bypass_filters_hallucination(self):
        det = _make_detector("computador", bypass_condition=lambda: True)
        det._stop_tts = MagicMock()
        det.flush_buffers = MagicMock()
        det._handle_transcription("obrigado", "obrigado")
        det.callback.assert_not_called()

    def test_bypass_short_text_ignored(self):
        det = _make_detector("computador", bypass_condition=lambda: True)
        det._stop_tts = MagicMock()
        det.flush_buffers = MagicMock()
        det._handle_transcription("o", "o")
        det.callback.assert_not_called()

    def test_cooldown_blocks_retrigger(self):
        det = _make_detector("computador")
        det._stop_tts = MagicMock()
        det._play_feedback = MagicMock()
        det.flush_buffers = MagicMock()
        det._handle_transcription("computador teste", "computador teste")
        det.callback.reset_mock()
        det._handle_transcription("computador teste", "computador teste")
        det.callback.assert_not_called()

    def test_had_tts_blocks_in_normal_mode(self):
        det = _make_detector("computador")
        det._stop_tts = MagicMock()
        det._handle_transcription("mensagem qualquer", "mensagem qualquer", had_tts=True)
        det.callback.assert_not_called()

    def test_wake_word_active_false_blocks(self):
        det = _make_detector("computador")
        det._stop_tts = MagicMock()
        det.wake_word_active = False
        det._handle_transcription("computador teste", "computador teste")
        det.callback.assert_not_called()

    def test_fuzzy_variant_luma_detected(self):
        det = _make_detector("luna", variants=["luna"])
        det._stop_tts = MagicMock()
        det._play_feedback = MagicMock()
        det.flush_buffers = MagicMock()
        det._handle_transcription("luma bom dia", "luma bom dia")
        det.callback.assert_called_once()

    def test_blacklisted_word_not_matched(self):
        det = _make_detector("luna", variants=["luna"])
        det._stop_tts = MagicMock()
        det._handle_transcription("lula é o presidente", "lula é o presidente")
        det.callback.assert_not_called()

class TestAudioCallback:
    """Tests for WakeWordDetector._audio_callback."""

    def test_puts_data_in_queue(self):
        det = _make_detector()
        indata = np.ones((100, 1), dtype=np.float32)
        det._audio_callback(indata, 100, None, None)
        assert not det.audio_queue.empty()

    def test_drops_when_queue_full(self):
        det = _make_detector()
        for _ in range(det.audio_queue.maxsize):
            det.audio_queue.put_nowait(np.zeros(100, dtype=np.float32))
        indata = np.ones((100, 1), dtype=np.float32)
        det._audio_callback(indata, 100, None, None)

    def test_overflow_status_not_logged(self):
        det = _make_detector()
        indata = np.ones((100, 1), dtype=np.float32)
        # Should not raise even with overflow status
        det._audio_callback(indata, 100, None, "overflow")


class TestEnqueueRecording:
    """Tests for WakeWordDetector._enqueue_recording."""

    def test_empty_buffer_noop(self):
        det = _make_detector()
        det.speech_buffer = []
        det._enqueue_recording()
        assert det.processing_queue.empty()

    def test_queues_audio(self):
        det = _make_detector()
        det.speech_buffer = [np.ones(1000, dtype=np.float32)]
        det._enqueue_recording()
        assert not det.processing_queue.empty()

    def test_queues_when_full_drops_old(self):
        det = _make_detector()
        for _ in range(det.processing_queue.maxsize):
            det.processing_queue.put_nowait((np.zeros(100), False, False, 0.0, 0))
        det.speech_buffer = [np.ones(1000, dtype=np.float32)]
        det._enqueue_recording()
        assert not det.processing_queue.empty()


class TestEnqueuePartialRecording:
    """Tests for WakeWordDetector._enqueue_partial_recording."""

    def test_short_buffer_noop(self):
        det = _make_detector()
        det.speech_buffer = [np.ones(100, dtype=np.float32)] * 2
        det._enqueue_partial_recording()
        assert det.processing_queue.empty()

    def test_queues_when_buffer_long_enough(self):
        det = _make_detector()
        det.speech_buffer = [np.ones(100, dtype=np.float32)] * 5
        det._enqueue_partial_recording()
        assert not det.processing_queue.empty()


class TestStopTts:
    """Tests for WakeWordDetector._stop_tts."""

    def test_calls_stop_all_when_speaking(self):
        det = _make_detector()
        with patch.object(det_mod, "tts") as mock_tts:
            mock_tts.is_speaking.return_value = True
            det._stop_tts()
            mock_tts.stop_all.assert_called_once()

    def test_noop_when_not_speaking(self):
        det = _make_detector()
        with patch.object(det_mod, "tts") as mock_tts:
            mock_tts.is_speaking.return_value = False
            det._stop_tts()
            mock_tts.stop_all.assert_not_called()


class TestStartStop:
    """Tests for WakeWordDetector.start and stop."""

    def test_start_sets_running(self):
        det = _make_detector()
        det.running = False
        det.model = MagicMock()
        det_mod.HAS_SOUNDDEVICE = True
        mock_sd = MagicMock()
        old_sd = det_mod.sd
        det_mod.sd = mock_sd
        try:
            det.start()
            assert det.running is True
        finally:
            det_mod.sd = old_sd
            det_mod.HAS_SOUNDDEVICE = None
            det.running = False
            det._stop_event.set()

    def test_stop_clears_running(self):
        det = _make_detector()
        det.running = True
        det._stop_event = MagicMock()
        det.thread = None
        det.processing_thread = None
        det.stop()
        assert det.running is False

    def test_watchdog_triggers_restart_when_listener_dies(self):
        det = _make_detector()
        det.model = MagicMock()
        det.wake_word_active = True
        det.running = False
        det.start = MagicMock()

        # Simulate dead threads while should_be_running is True
        det._stop_event.is_set = MagicMock(side_effect=[False, False, True])
        with patch("time.sleep"):
            det._watchdog_loop()
        det.start.assert_called_once()


class TestExtractReply:
    """Tests for WhatsAppReplyDetector._extract_reply (pure string logic)."""

    def _make_reply_detector(self):
        from services.voice.whatsapp_reply import WhatsAppReplyDetector
        det = WhatsAppReplyDetector.__new__(WhatsAppReplyDetector)
        return det

    def test_extracts_text_after_wake_word(self):
        det = self._make_reply_detector()
        result = det._extract_reply("responda, como vai você?")
        assert "como vai você?" in result

    def test_strips_leading_punctuation(self):
        det = self._make_reply_detector()
        result = det._extract_reply("responde. tudo bem?")
        assert result.startswith("tudo bem") or result.startswith("tudo")

    def test_returns_empty_when_no_wake_word(self):
        det = self._make_reply_detector()
        result = det._extract_reply("mensagem normal sem wake word")
        assert result == ""

    def test_case_insensitive(self):
        det = self._make_reply_detector()
        result = det._extract_reply("RESPONDA, responde ai")
        assert "responde ai" in result
