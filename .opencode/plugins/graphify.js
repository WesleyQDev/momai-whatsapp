// graphify OpenCode plugin - Enhanced
// Injects knowledge graph context into tool execution and provides graph-aware behavior.
import { existsSync } from "fs";
import { join } from "path";

export const GraphifyPlugin = async ({ directory }) => {
  const graphDir = join(directory, "graphify-out");
  const graphJson = join(graphDir, "graph.json");
  const graphReport = join(graphDir, "GRAPH_REPORT.md");
  const hasGraph = existsSync(graphJson);

  return {
    // Inject graph reminder BEFORE any tool execution (not just bash)
    "tool.execute.before": async (input, output) => {
      if (!hasGraph) return;

      // For bash commands, prepend a visible reminder
      if (input.tool === "bash" && output.args?.command) {
        // Check if command is doing file search/exploration
        const cmd = output.args.command.toLowerCase();
        const isExploratory = 
          cmd.includes("grep") || 
          cmd.includes("find") || 
          cmd.includes("rg") ||
          cmd.includes("ls") ||
          cmd.includes("cat") ||
          cmd.includes("head") ||
          cmd.includes("tail");

        if (isExploratory) {
          output.args.command =
            'echo "[graphify] Knowledge graph available at graphify-out/. Consider using the graph for architecture questions instead of raw file search." && ' +
            output.args.command;
        }
      }
    },

    // After tool execution, if a file was read, check if graph could have answered it
    "tool.execute.after": async (input, output) => {
      if (!hasGraph) return;

      // If user is asking about architecture and we just did file reads,
      // suggest using the graph
      if (input.tool === "read" || input.tool === "glob" || input.tool === "grep") {
        // This hook can be used to log or suggest graph usage
        // Currently OpenCode plugins have limited post-execution hooks
      }
    },
  };
};
