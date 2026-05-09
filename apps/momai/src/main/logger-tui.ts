/**
 * TUI (Terminal User Interface) styled logging for Electron main process.
 *
 * Renders logs inside Unicode box-drawing tables. The timestamp lives only
 * in the table header — a new table starts whenever the hour:minute changes.
 *
 * Enable with the environment variable `TUI_LOGS=1`.
 */

const BOX = {
  tl: '┌',
  tr: '┐',
  bl: '└',
  br: '┘',
  h: '─',
  v: '│',
  lt: '├',
  rt: '┤',
  tt: '┬',
  bt: '┴',
  cx: '┼'
}

const ICONS: Record<string, string> = {
  debug: '◆',
  info: '●',
  warn: '▲',
  error: '■',
  critical: '◉'
}

const COLORS: Record<string, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  critical: '\x1b[1;31m'
}

const RESET = '\x1b[0m'

function termWidth(maxW = 120): number {
  try {
    const cols = process.stdout.columns ?? 100
    return Math.min(cols, maxW)
  } catch {
    return Math.min(100, maxW)
  }
}

function rule(left: string, mid: string, right: string, ...segments: number[]): string {
  const parts: string[] = [left]
  for (let i = 0; i < segments.length; i++) {
    parts.push(BOX.h.repeat(segments[i]))
    if (i < segments.length - 1) parts.push(mid)
  }
  parts.push(right)
  return parts.join('')
}

export class TuiLogger {
  private appName: string
  private maxWidth: number
  private width: number
  private tableOpen = false
  private currentTimeKey: string | null = null
  private iconW = 3

  constructor(appName = 'MomAI', maxWidth = 120) {
    this.appName = appName
    this.maxWidth = maxWidth
    this.width = termWidth(maxWidth)

    process.on('exit', () => this.closeTable())
    process.on('SIGINT', () => {
      this.closeTable()
      process.exit(0)
    })
  }

  private write(text: string): void {
    console.log(text)
  }

  private drawHeader(now: Date): void {
    this.width = termWidth(this.maxWidth)

    const timeStr = now.toTimeString().slice(0, 8)
    const dateStr = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })

    const leftText = ` ${this.appName} Logs `
    const rightText = ` ${timeStr}  ${dateStr} `
    const inner = this.width - 2
    let pad = inner - leftText.length - rightText.length
    if (pad < 1) pad = 1

    this.write(BOX.tl + BOX.h.repeat(inner) + BOX.tr)
    this.write(BOX.v + leftText + ' '.repeat(pad) + rightText + BOX.v)

    const iconCol = this.iconW + 2
    const msgCol = this.width - iconCol - 3
    this.write(rule(BOX.lt, BOX.tt, BOX.rt, iconCol, msgCol))
  }

  private drawRow(level: string, message: string): void {
    const icon = ICONS[level] || ICONS.info
    const color = COLORS[level] || COLORS.info
    const msgCol = this.width - this.iconW - 5

    const lines: string[] = []
    let remaining = message.replace(/\n/g, ' │ ')
    while (remaining.length > 0) {
      if (remaining.length <= msgCol) {
        lines.push(remaining)
        break
      }
      let bp = remaining.lastIndexOf(' ', msgCol)
      if (bp <= 0) bp = msgCol
      lines.push(remaining.slice(0, bp))
      remaining = remaining.slice(bp).trimStart()
    }

    for (const text of lines) {
      const padded = text.padEnd(msgCol, ' ')
      this.write(`${BOX.v} ${color}${icon}${RESET} ${color}${padded}${RESET} ${BOX.v}`)
    }
  }

  private drawFooter(): void {
    const iconCol = this.iconW + 2
    const msgCol = this.width - iconCol - 3
    this.write(rule(BOX.bl, BOX.bt, BOX.br, iconCol, msgCol))
  }

  log(level: string, message: string): void {
    const now = new Date()
    const timeKey = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    if (timeKey !== this.currentTimeKey) {
      if (this.tableOpen) this.drawFooter()
      this.currentTimeKey = timeKey
      this.tableOpen = true
      this.drawHeader(now)
    }

    this.drawRow(level.toLowerCase(), message)
  }

  closeTable(): void {
    if (this.tableOpen) {
      this.drawFooter()
      this.tableOpen = false
      this.currentTimeKey = null
    }
  }
}
