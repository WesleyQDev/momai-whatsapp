# Python Core Performance Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all Python Core performance issues (8 High, 9 Medium, 8 Low) to make the backend extremely responsive.

**Architecture:** Fixes target `apps/core/` — FastAPI routes, SQLAlchemy, voice pipeline, WebSocket broadcasting, and caching.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy, httpx, sounddevice, numpy

---

## Phase 1: Critical Responsiveness (P1)

### Task P1.1: Move sync SQLAlchemy to async with `asyncio.to_thread()`

**Files:**
- Modify: `apps/core/api/routes/voice.py:160-180`, `:220-240`
- Modify: `apps/core/api/routes/chat_voice.py:30-50`
- Modify: `apps/core/startup.py:15-25`
- Modify: `apps/core/utils/i18n.py:60-75`

**Problem:** Sync SQLAlchemy calls in `async def` endpoints block the entire event loop, preventing concurrent requests.

- [ ] **Step 1: Add helper to app_state.py**

Create a reusable async DB helper:

```python
# apps/core/app_state.py - add at top
import asyncio
from database.models import SessionLocal, Settings

async def get_settings_async() -> Settings | None:
    def _query():
        db = SessionLocal()
        try:
            return db.query(Settings).first()
        finally:
            db.close()
    return await asyncio.to_thread(_query)
```

- [ ] **Step 2: Fix voice.py endpoints**

```python
# apps/core/api/routes/voice.py:170 - change from:
# settings = db.query(Settings).first()
# to:
from app_state import get_settings_async
settings = await get_settings_async()
```

Apply same pattern to all 4 locations.

- [ ] **Step 3: Fix chat_voice.py**

```python
# apps/core/api/routes/chat_voice.py:38-42 - replace:
# db = SessionLocal()
# settings = db.query(Settings).first()
# db.close()
# with:
settings = await get_settings_async()
```

- [ ] **Step 4: Fix startup.py**

```python
# apps/core/startup.py:17-21
settings = await get_settings_async()
```

- [ ] **Step 5: Fix i18n.py**

```python
# apps/core/utils/i18n.py:66-70
def _get_locale():
    db = SessionLocal()
    try:
        s = db.query(Settings).first()
        return s.locale if s else "en"
    finally:
        db.close()

async def get_locale_async() -> str:
    return await asyncio.to_thread(_get_locale)
```

- [ ] **Step 6: Verify with test**

Run: `cd apps/core && pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/core/api/routes/voice.py apps/core/api/routes/chat_voice.py apps/core/startup.py apps/core/utils/i18n.py apps/core/app_state.py
git commit -m "perf(core): move sync SQLAlchemy calls to asyncio.to_thread()"
```

### Task P1.2: httpx connection pooling

**Files:**
- Modify: `apps/core/app_state.py:160-185`

**Problem:** New `httpx.AsyncClient` created per voice command, adding TCP/SSL overhead every time.

- [ ] **Step 1: Add shared httpx client**

```python
# apps/core/app_state.py - add at module level
import httpx

_http_client: httpx.AsyncClient | None = None

async def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=15.0, pool=5.0),
            limits=limits
        )
    return _http_client
```

- [ ] **Step 2: Refactor process_voice_command**

```python
# apps/core/app_state.py:174 - replace:
# async with httpx.AsyncClient(timeout=timeout) as client:
#     response = await client.post(node_url, json=payload)
# with:
client = await get_http_client()
response = await client.post(node_url, json=payload)
```

- [ ] **Step 3: Verify**

Run: `cd apps/core && pnpm test`
Expected: Tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/core/app_state.py
git commit -m "perf(core): add httpx connection pooling"
```

### Task P1.3: Gate FFT computation behind active WebSocket clients

**Files:**
- Modify: `apps/core/services/voice/detector.py:220-245`
- Modify: `apps/core/services/voice/tts.py:395-420`

**Problem:** FFT computed on every 250ms audio chunk even when zero WebSocket clients are connected.

- [ ] **Step 1: Gate FFT in detector.py**

```python
# apps/core/services/voice/detector.py:225-238 - wrap in:
if app_state.active_websockets:
    magnitude = np.abs(np.fft.rfft(audio_samples[:chunk_size]))
    # ... rest of FFT computation
```

- [ ] **Step 2: Gate FFT in tts.py**

```python
# apps/core/services/voice/tts.py:399-414 - wrap in:
if app_state.active_websockets:
    # ... FFT computation
```

- [ ] **Step 3: Commit**

```bash
git add apps/core/services/voice/detector.py apps/core/services/voice/tts.py
git commit -m "perf(core): gate FFT computation behind active WebSocket clients"
```

### Task P1.4: Replace time.sleep with event-based retry

**Files:**
- Modify: `apps/core/services/voice/detector.py:145-155`

**Problem:** `time.sleep(5)` blocks the processing thread for up to 15s during retries.

- [ ] **Step 1: Replace with event-based wait**

```python
# apps/core/services/voice/detector.py:149 - replace:
# time.sleep(5)
# with:
if self._stop_event.wait(timeout=5):
    return None  # stopped during retry wait
```

- [ ] **Step 2: Add _stop_event to class**

```python
# In __init__:
self._stop_event = threading.Event()
```

- [ ] **Step 3: Set event on stop**

```python
# In stop():
self._stop_event.set()
```

- [ ] **Step 4: Commit**

```bash
git add apps/core/services/voice/detector.py
git commit -m "perf(core): replace time.sleep with event-based retry in detector"
```

---

## Phase 2: Stability & Performance (P2)

### Task P2.1: Concurrent WebSocket broadcast

**Files:**
- Modify: `apps/core/app_state.py:108-120`

- [ ] **Step 1: Rewrite broadcast_to_sockets**

```python
async def broadcast_to_sockets(message: dict) -> None:
    if not active_websockets:
        return

    async def _safe_send(ws):
        try:
            await asyncio.wait_for(ws.send_json(message), timeout=2.0)
        except Exception:
            active_websockets.discard(ws)

    tasks = [asyncio.create_task(_safe_send(ws)) for ws in list(active_websockets)]
    await asyncio.gather(*tasks, return_exceptions=True)
```

- [ ] **Step 2: Commit**

```bash
git add apps/core/app_state.py
git commit -m "perf(core): make WebSocket broadcast concurrent"
```

### Task P2.2: Add Settings TTL cache

**Files:**
- Modify: `apps/core/app_state.py`
- Modify: `apps/core/startup.py`

- [ ] **Step 1: Add TTL cache**

```python
# apps/core/app_state.py - add:
import time
from threading import Lock

_settings_cache: Settings | None = None
_settings_cache_time: float = 0
_settings_cache_ttl: float = 10.0  # 10 seconds
_settings_lock = Lock()

async def get_settings_cached() -> Settings | None:
    global _settings_cache, _settings_cache_time
    now = time.monotonic()
    if _settings_cache is not None and (now - _settings_cache_time) < _settings_cache_ttl:
        return _settings_cache
    async with _settings_lock:
        if _settings_cache is not None and (now - _settings_cache_time) < _settings_cache_ttl:
            return _settings_cache
        settings = await get_settings_async()
        _settings_cache = settings
        _settings_cache_time = now
        return settings
```

- [ ] **Step 2: Replace all get_settings_async calls with get_settings_cached**

Replace in: `voice.py`, `chat_voice.py`, `startup.py`, `i18n.py`

- [ ] **Step 3: Commit**

```bash
git add apps/core/app_state.py apps/core/api/routes/voice.py apps/core/api/routes/chat_voice.py apps/core/startup.py apps/core/utils/i18n.py
git commit -m "perf(core): add TTL cache for Settings queries"
```

### Task P2.3: Pre-compile regex patterns in _strip_markdown

**Files:**
- Modify: `apps/core/services/voice/tts.py:575-625`

- [ ] **Step 1: Move patterns to module level**

```python
# apps/core/services/voice/tts.py - at module level:
import re
_RE_EMOJI = re.compile(r'[\U00010000-\U0010ffff]')
_RE_CODEBLOCK = re.compile(r"```[\s\S]*?```")
_RE_INLINE_CODE = re.compile(r"`([^`]+)`")
_RE_HEADING = re.compile(r'^#{1,6}\s+', re.MULTILINE)
_RE_BOLD = re.compile(r'\*\*(.+?)\*\*')
_RE_ITALIC = re.compile(r'\*(.+?)\*')
_RE_STRIKETHROUGH = re.compile(r'~~(.+?)~~')
_RE_LINK = re.compile(r'\[([^\]]+)\]\([^)]+\)')
_RE_HR = re.compile(r'^[-*_]{3,}\s*$', re.MULTILINE)
_RE_BLOCKQUOTE = re.compile(r'^>\s?', re.MULTILINE)
_RE_LIST = re.compile(r'^[\s]*[-*+]\s+', re.MULTILINE)
_RE_NUMBERED = re.compile(r'^\s*\d+\.\s+', re.MULTILINE)
_RE_MULTILINE = re.compile(r'\n{3,}')
_RE_TRAILING = re.compile(r'\s+$', re.MULTILINE)
```

- [ ] **Step 2: Update _strip_markdown**

```python
@staticmethod
def _strip_markdown(text: str) -> str:
    s = text
    s = _RE_EMOJI.sub('', s)
    s = _RE_CODEBLOCK.sub('', s)
    s = _RE_INLINE_CODE.sub(r'\1', s)
    s = _RE_HEADING.sub('', s)
    s = _RE_BOLD.sub(r'\1', s)
    s = _RE_ITALIC.sub(r'\1', s)
    s = _RE_STRIKETHROUGH.sub(r'\1', s)
    s = _RE_LINK.sub(r'\1', s)
    s = _RE_HR.sub('', s)
    s = _RE_BLOCKQUOTE.sub('', s)
    s = _RE_LIST.sub('', s)
    s = _RE_NUMBERED.sub('', s)
    s = _RE_MULTILINE.sub('\n\n', s)
    s = _RE_TRAILING.sub('', s)
    return s.strip()
```

- [ ] **Step 3: Commit**

```bash
git add apps/core/services/voice/tts.py
git commit -m "perf(core): pre-compile regex patterns in _strip_markdown"
```

### Task P2.4: Add SQLite pool configuration

**Files:**
- Modify: `apps/core/database/models.py:55-60`

- [ ] **Step 1: Configure pool**

```python
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    pool_pre_ping=True,
    connect_args={"timeout": 10},
)
```

- [ ] **Step 2: Commit**

```bash
git add apps/core/database/models.py
git commit -m "perf(core): add SQLite pool_pre_ping and timeout"
```

---

## Phase 3: Hardening (P3)

### Task P3.1: Add logging to bare except blocks

**Files:** All files with `except Exception: pass`

- [ ] **Step 1: Audit and fix all bare excepts**

Add `logger.exception(...)` or `logger.debug(...)` to each bare except in:
- `services/voice/tts.py:413, 437`
- `services/voice/detector.py:605, 617`
- `app_state.py:49-51`
- `api/routes/chat_voice.py:17-19`

- [ ] **Step 2: Commit**

```bash
git add apps/core/services/voice/tts.py apps/core/services/voice/detector.py apps/core/app_state.py apps/core/api/routes/chat_voice.py
git commit -m "refactor(core): add logging to bare except blocks"
```

### Task P3.2: Add input validation for chat/speak

**Files:**
- Modify: `apps/core/api/routes/chat_voice.py:26-30`

- [ ] **Step 1: Add max length check**

```python
text = data.get("text")
if not text:
    raise HTTPException(status_code=400, detail="No text provided")
if len(text) > 10000:
    raise HTTPException(status_code=413, detail="Text too long")
```

- [ ] **Step 2: Commit**

```bash
git add apps/core/api/routes/chat_voice.py
git commit -m "feat(core): add input length validation for /chat/speak"
```

### Task P3.3: Use rapidfuzz instead of SequenceMatcher

**Files:**
- Modify: `apps/core/services/voice/detector.py:630, 671`

- [ ] **Step 1: Replace SequenceMatcher with rapidfuzz**

```python
# At top:
from rapidfuzz import fuzz

# Replace:
# ratio = SequenceMatcher(None, word, kw).ratio()
# with:
ratio = fuzz.ratio(word, kw) / 100.0
```

- [ ] **Step 2: Add rapidfuzz to dependencies**

```bash
cd apps/core && uv add rapidfuzz
```

- [ ] **Step 3: Commit**

```bash
git add apps/core/services/voice/detector.py apps/core/pyproject.toml apps/core/uv.lock
git commit -m "perf(core): replace SequenceMatcher with rapidfuzz"
```
