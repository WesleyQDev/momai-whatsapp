"""TUI (Terminal User Interface) styled logging handler.

Renders logs inside Unicode box-drawing tables. The timestamp appears only
in the table header — when the hour:minute changes the previous table is
closed and a new one is opened.

Enable with the environment variable ``TUI_LOGS=1``.
"""

from __future__ import annotations

import atexit
import logging
import shutil
import sys
from datetime import datetime
from typing import Optional

# ═══════════════════════════════════════════════════════════════
# Unicode box-drawing characters
# ═══════════════════════════════════════════════════════════════
BOX = {
    "tl": "┌",  # top left
    "tr": "┐",  # top right
    "bl": "└",  # bottom left
    "br": "┘",  # bottom right
    "h": "─",   # horizontal
    "v": "│",   # vertical
    "lt": "├",  # left T
    "rt": "┤",  # right T
    "tt": "┬",  # top T
    "bt": "┴",  # bottom T
    "cx": "┼",  # cross
}

# ═══════════════════════════════════════════════════════════════
# Icons per log level
# ═══════════════════════════════════════════════════════════════
ICONS: dict[str, str] = {
    "DEBUG": "◆",
    "INFO": "●",
    "WARNING": "▲",
    "ERROR": "■",
    "CRITICAL": "◉",
}

# ═══════════════════════════════════════════════════════════════
# ANSI colours
# ═══════════════════════════════════════════════════════════════
COLORS: dict[str, str] = {
    "DEBUG": "\033[90m",      # gray
    "INFO": "\033[36m",       # cyan
    "WARNING": "\033[33m",    # yellow
    "ERROR": "\033[31m",      # red
    "CRITICAL": "\033[1;31m", # bold red
}
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"


def _term_width(max_width: int = 120) -> int:
    """Return terminal width capped at *max_width*."""
    try:
        return min(shutil.get_terminal_size().columns, max_width)
    except Exception:
        return min(100, max_width)


class TuiTableHandler(logging.Handler):
    """Log handler that draws each time-slice inside a Unicode box table.

    The table header shows the timestamp; individual rows omit it.
    A new table is started whenever the *hour:minute* changes.
    """

    ICON_W = 3  # visual width reserved for the icon column (emoji / symbol)

    def __init__(
        self,
        stream: Optional[object] = None,
        app_name: str = "MomAI",
        max_width: int = 120,
    ) -> None:
        super().__init__()
        self.stream = stream or sys.stdout
        self.app_name = app_name
        self.max_width = max_width
        self._width = _term_width(max_width)
        self._table_open = False
        self._current_time_key: Optional[str] = None

        # Ensure the table footer is printed on graceful exit
        atexit.register(self._atexit_close)

    # ── low-level helpers ─────────────────────────────────────

    def _write(self, text: str) -> None:
        """Write *text* to the stream, forcing UTF-8 on Windows."""
        try:
            # Try to write via the underlying binary buffer (bypasses text
            # wrapper encoding issues on Windows cp1252 terminals).
            buf = getattr(self.stream, "buffer", None)
            if buf is not None:
                buf.write((text + "\n").encode("utf-8"))
                buf.flush()
                return
        except Exception:
            pass

        self.stream.write(text + "\n")  # type: ignore[attr-defined]
        self.stream.flush()              # type: ignore[attr-defined]

    def _rule(self, left: str, mid: str, right: str, *segments: int) -> str:
        """Build a horizontal rule from segment widths."""
        parts: list[str] = [left]
        for i, seg in enumerate(segments):
            parts.append(BOX["h"] * seg)
            if i < len(segments) - 1:
                parts.append(mid)
        parts.append(right)
        return "".join(parts)

    # ── drawing primitives ────────────────────────────────────

    def _draw_header(self, dt: datetime) -> None:
        """Print the table top + title line + separator."""
        self._width = _term_width(self.max_width)

        time_str = dt.strftime("%H:%M:%S")
        date_str = dt.strftime("%d %b %Y")

        left_text = f" {self.app_name} Logs "
        right_text = f" {time_str}  {date_str} "

        inner = self._width - 2
        pad = inner - len(left_text) - len(right_text)
        if pad < 1:
            pad = 1

        # Top border
        self._write(BOX["tl"] + BOX["h"] * inner + BOX["tr"])

        # Title row
        title_line = (
            BOX["v"]
            + left_text
            + " " * pad
            + right_text
            + BOX["v"]
        )
        self._write(title_line[: self._width])

        # Separator under header (splits icon col | message col)
        icon_col = self.ICON_W + 2  # space + icon + space
        msg_col = self._width - icon_col - 3  # borders + one pad
        self._write(
            self._rule(BOX["lt"], BOX["tt"], BOX["rt"], icon_col, msg_col)
        )

    def _draw_row(self, record: logging.LogRecord) -> None:
        """Print one (possibly wrapped) log row."""
        icon = ICONS.get(record.levelname, "•")
        color = COLORS.get(record.levelname, "")

        msg = self.format(record).replace("\n", " │ ")
        msg_col = self._width - self.ICON_W - 5  # 2 borders + 3 spaces

        # Simple greedy word-wrap
        lines: list[str] = []
        remaining = msg
        while remaining:
            if len(remaining) <= msg_col:
                lines.append(remaining)
                break
            bp = remaining.rfind(" ", 0, msg_col + 1)
            if bp <= 0:
                bp = msg_col
            lines.append(remaining[:bp])
            remaining = remaining[bp:].lstrip()

        for text in lines:
            padded = text.ljust(msg_col)
            self._write(
                f"{BOX['v']} {color}{icon}{RESET} "
                f"{color}{padded}{RESET} {BOX['v']}"
            )

    def _draw_footer(self) -> None:
        """Close the current table."""
        icon_col = self.ICON_W + 2
        msg_col = self._width - icon_col - 3
        self._write(
            self._rule(BOX["bl"], BOX["bt"], BOX["br"], icon_col, msg_col)
        )

    # ── Handler API ───────────────────────────────────────────

    def emit(self, record: logging.LogRecord) -> None:
        try:
            dt = datetime.fromtimestamp(record.created)
            time_key = dt.strftime("%H:%M")

            if time_key != self._current_time_key:
                if self._table_open:
                    self._draw_footer()
                self._current_time_key = time_key
                self._table_open = True
                self._draw_header(dt)

            self._draw_row(record)

        except Exception:
            self.handleError(record)

    def _atexit_close(self) -> None:
        """Ensure the last table is closed on process exit."""
        if self._table_open:
            self._draw_footer()
            self._table_open = False

    def close(self) -> None:
        self._atexit_close()
        atexit.unregister(self._atexit_close)
        super().close()


class TuiFormatter(logging.Formatter):
    """Minimal formatter for *TuiTableHandler*.

    Only the bare message is returned — timestamps live in the table header.
    """

    def format(self, record: logging.LogRecord) -> str:
        return record.getMessage()


def tui_handler(app_name: str = "MomAI") -> TuiTableHandler:
    """Convenience factory — returns a ready-to-use TUI handler."""
    handler = TuiTableHandler(app_name=app_name)
    handler.setFormatter(TuiFormatter())
    return handler
