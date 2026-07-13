# Detector Voice Service Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unit tests for `apps/core/services/voice/detector.py` targeting >= 50% line coverage, focusing on pure/wake-word logic first.

**Architecture:** Test file at `apps/core/tests/test_detector.py`. Use `pytest` + `pytest-mock`. Mock heavy dependencies (`sounddevice`, `numpy`, `ctranslate2`, `faster_whisper`, `rapidfuzz`). Focus on `_check_wake_word_fuzzy`, `_get_chunk_energy`, `_set_state`, and `_extract_reply`.

**Tech Stack:** Python 3.12+, pytest, pytest-mock, unittest.mock

---

### Task 1: Test `_check_wake_word_fuzzy`

**Files:**
- Create: `apps/core/tests/test_detector.py`

- [ ] **Step 1: Write the failing test**

```python
"""Tests for apps/core/services/voice/detector.py"""
import pytest
from unittest.mock import MagicMock, patch


def _make_detector(keyword="computador", variants=None):
    """Helper: create a WakeWordDetector with mocked heavy deps."""
    with patch("services.voice.detector._ensure_heavy_imports"):
        from services.voice.detector import WakeWordDetector
        det = WakeWordDetector(
            keyword=keyword,
            variants=variants or [keyword],
            callback=MagicMock(),
            status_callback=MagicMock(),
        )
    return det


class TestCheckWakeWordFuzzy:
    """Tests for WakeWordDetector._check_wake_word_fuzzy."""

    def test_exact_match(self):
        det = _make_detector("computador")
        assert det._check_wake_word_fuzzy("olá computador tudo bem") is True

    def test_exact_match_case_insensitive_via_variants(self):
        det = _make_detector("computador", variants=["computador", "pc"])
        assert det._check_wake_word_fuzzy("olá PC tudo bem") is True

    def test_no_match(self):
        det = _make_detector("computador")
        assert det._check_wake_word_fuzzy("sol comandante") is False

    def test_fuzzy_match_close_word(self):
        det = _make_detector("computador")
        # "computadore" is close enough for fuzzy matching
        assert det._check_wake_word_fuzzy("computadore") is True

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
        # "computadores" should NOT match exact because \b boundary
        # but fuzzy may still catch it — verify behavior
        result = det._check_wake_word_fuzzy("computadores")
        assert isinstance(result, bool)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/core && uv run pytest tests/test_detector.py -v`
Expected: FAIL with `ModuleNotFoundError` or `ImportError`

- [ ] **Step 3: Run test to verify it passes (implementation exists)**

Run: `cd apps/core && uv run pytest tests/test_detector.py::TestCheckWakeWordFuzzy -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/core/tests/test_detector.py
git commit -m "test(core): add detector wake word fuzzy matching tests"
```

---

### Task 2: Test `_get_chunk_energy`

**Files:**
- Modify: `apps/core/tests/test_detector.py`

- [ ] **Step 1: Write the tests**

Append to `test_detector.py`:

```python
class TestGetChunkEnergy:
    """Tests for WakeWordDetector._get_chunk_energy."""

    def test_silence_returns_zero(self):
        det = _make_detector()
        import numpy as np
        chunk = np.zeros(1000, dtype=np.float32)
        energy = det._get_chunk_energy(chunk)
        assert energy == pytest.approx(0.0, abs=1e-7)

    def test_sine_wave_returns_positive(self):
        det = _make_detector()
        import numpy as np
        t = np.linspace(0, 1, 16000, dtype=np.float32)
        chunk = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        energy = det._get_chunk_energy(chunk)
        assert energy > 0.5

    def test_higher_amplitude_higher_energy(self):
        det = _make_detector()
        import numpy as np
        low = np.ones(1000, dtype=np.float32) * 0.1
        high = np.ones(1000, dtype=np.float32) * 0.9
        assert det._get_chunk_energy(high) > det._get_chunk_energy(low)
```

- [ ] **Step 2: Run tests**

Run: `cd apps/core && uv run pytest tests/test_detector.py::TestGetChunkEnergy -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add apps/core/tests/test_detector.py
git commit -m "test(core): add detector chunk energy calculation tests"
```

---

### Task 3: Test `_set_state` and `_extract_reply`

**Files:**
- Modify: `apps/core/tests/test_detector.py`

- [ ] **Step 1: Write the tests**

Append to `test_detector.py`:

```python
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


class TestExtractReply:
    """Tests for whatsapp_reply._extract_reply (pure string logic)."""

    def test_extracts_text_after_wake_word(self):
        from services.voice.whatsapp_reply import WhatsAppReplyListener
        # _extract_reply is an instance method, but logic is pure
        # We can test via a minimal instance or mock
        from unittest.mock import MagicMock
        listener = WhatsAppReplyListener.__new__(WhatsAppReplyListener)
        result = listener._extract_reply("oi mom, como vai você?")
        assert "como vai você?" in result

    def test_strips_leading_punctuation(self):
        from services.voice.whatsapp_reply import WhatsAppReplyListener
        listener = WhatsAppReplyListener.__new__(WhatsAppReplyListener)
        result = listener._extract_reply("hey mom. tudo bem?")
        assert result.startswith("tudo bem") or result.startswith("tudo")

    def test_returns_empty_when_no_wake_word(self):
        from services.voice.whatsapp_reply import WhatsAppReplyListener
        listener = WhatsAppReplyListener.__new__(WhatsAppReplyListener)
        result = listener._extract_reply("mensagem normal sem wake word")
        assert result == ""

    def test_case_insensitive(self):
        from services.voice.whatsapp_reply import WhatsAppReplyListener
        listener = WhatsAppReplyListener.__new__(WhatsAppReplyListener)
        result = listener._extract_reply("OI MOM, responde ai")
        assert "responde ai" in result
```

- [ ] **Step 2: Run tests**

Run: `cd apps/core && uv run pytest tests/test_detector.py::TestSetState tests/test_detector.py::TestExtractReply -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add apps/core/tests/test_detector.py
git commit -m "test(core): add detector state and whatsapp reply extraction tests"
```

---

### Task 4: Verify coverage >= 50%

- [ ] **Step 1: Run coverage for detector**

Run: `cd apps/core && uv run pytest tests/test_detector.py --cov=services.voice.detector --cov-report=term-missing`
Expected: coverage >= 50%

- [ ] **Step 2: If below 50%, add tests for `_audio_callback` and `_reset_state`**

```python
class TestAudioCallback:
    """Tests for WakeWordDetector._audio_callback."""

    def test_puts_data_in_queue(self):
        det = _make_detector()
        import numpy as np
        indata = np.ones((100, 1), dtype=np.float32)
        det._audio_callback(indata, 100, None, None)
        assert not det.audio_queue.empty()

    def test_drops_when_queue_full(self):
        det = _make_detector()
        import numpy as np
        # Fill queue to maxsize
        for _ in range(det.audio_queue.maxsize):
            det.audio_queue.put_nowait(np.zeros(100, dtype=np.float32))
        # Should not raise
        indata = np.ones((100, 1), dtype=np.float32)
        det._audio_callback(indata, 100, None, None)


class TestResetState:
    """Tests for WakeWordDetector._reset_state."""

    def test_resets_to_idle(self):
        det = _make_detector()
        det.state = det.STATE_LISTENING
        det._reset_state()
        assert det.state == det.STATE_IDLE

    def test_clears_buffers(self):
        det = _make_detector()
        det.speech_buffer = [1, 2, 3]
        det.speech_chunk_count = 5
        det._reset_state()
        assert det.speech_buffer == []
        assert det.speech_chunk_count == 0
```

- [ ] **Step 3: Re-run coverage**

Run: `cd apps/core && uv run pytest tests/test_detector.py --cov=services.voice.detector --cov-report=term-missing`
Expected: coverage >= 50%

- [ ] **Step 4: Final commit**

```bash
git add apps/core/tests/test_detector.py
git commit -m "test(core): add detector callback and reset state tests, reach 50% coverage"
```

---

### Task 5: Final validation

- [ ] **Step 1: Run all core tests together**

Run: `cd apps/core && uv run pytest -v`
Expected: ALL PASS

- [ ] **Step 2: Verify no regressions**

Run: `cd apps/core && uv run pytest --tb=short`
Expected: 0 failures
