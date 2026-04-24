import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin/tool"

const TOOL_FILE = fileURLToPath(import.meta.url)
const TOOL_DIR = dirname(TOOL_FILE)
const REPO_ROOT = resolve(TOOL_DIR, "..", "..")
const GRAPH_REPORT_PATH = resolve(REPO_ROOT, "graphify-out", "GRAPH_REPORT.md")
const GRAPHIFY_RUNNER = resolve(REPO_ROOT, ".opencode", "scripts", "run-graphify.bat")

function extractReportSection(section) {
  const report = readFileSync(GRAPH_REPORT_PATH, "utf8")
  if (section === "all") return report

  const lines = report.split("\n")
  const headers = {
    god_nodes: ["god node", "god nodes"],
    communities: ["community", "communities"],
    surprising_connections: ["surprising connection", "surprising connections"],
    suggested_questions: ["suggested question", "suggested questions"],
  }

  const needles = headers[section] ?? []
  const start = lines.findIndex((line) =>
    needles.some((needle) => line.toLowerCase().includes(needle)),
  )
  if (start === -1) return report

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("#")) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join("\n").trim()
}

async function runGraphify(args) {
  try {
    const output = execFileSync(GRAPHIFY_RUNNER, args, {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: REPO_ROOT,
      shell: true,
    })
    return output.trim()
  } catch (error) {
    if (error.status) {
      throw new Error(`graphify exited with code ${error.status}: ${error.message}`)
    }
    if (error.signal === 'SIGTERM' || error.message?.includes('timeout')) {
      throw new Error(`Timeout executing graphify command`)
    }
    throw error
  }
}

export const query = tool({
  description: "Query the graphify knowledge graph with natural language.",
  args: {
    question: tool.schema.string().describe("Question about architecture or relationships."),
    mode: tool.schema.enum(["bfs", "dfs"]).default("bfs"),
    budget: tool.schema.number().int().positive().default(2000),
  },
  async execute(args) {
    try {
      const text = await runGraphify([
        "query",
        args.question,
        "--mode",
        args.mode,
        "--budget",
        String(args.budget),
      ])
      return text || "No output from graphify query."
    } catch (error) {
      return `graphify query failed: ${String(error)}\nFallback: read graphify_report(section=all).`
    }
  },
})

export const path = tool({
  description: "Find relationship path between two graph concepts.",
  args: {
    from: tool.schema.string().describe("Source concept."),
    to: tool.schema.string().describe("Target concept."),
  },
  async execute(args) {
    try {
      const text = await runGraphify(["path", args.from, args.to])
      return text || "No path result returned by graphify."
    } catch (error) {
      return `graphify path failed: ${String(error)}\nFallback: use graphify_query with both concepts.`
    }
  },
})

export const explain = tool({
  description: "Explain a single concept/node from the graph.",
  args: {
    concept: tool.schema.string().describe("Node or concept label."),
  },
  async execute(args) {
    try {
      const text = await runGraphify(["explain", args.concept])
      return text || "No explanation returned by graphify."
    } catch (error) {
      return `graphify explain failed: ${String(error)}\nFallback: use graphify_report(section=all).`
    }
  },
})

export const report = tool({
  description: "Read sections from graphify-out/GRAPH_REPORT.md.",
  args: {
    section: tool.schema
      .enum(["all", "god_nodes", "communities", "surprising_connections", "suggested_questions"])
      .default("all"),
  },
  async execute(args) {
    try {
      return extractReportSection(args.section)
    } catch (error) {
      return `Unable to read graph report: ${String(error)}`
    }
  },
})

export const update = tool({
  description: "Update graphify graph for a path (default current repository).",
  args: {
    path: tool.schema.string().default("."),
  },
  async execute(args) {
    try {
      const text = await runGraphify(["update", args.path])
      return text || "Graph updated."
    } catch (error) {
      return `graphify update failed: ${String(error)}`
    }
  },
})
