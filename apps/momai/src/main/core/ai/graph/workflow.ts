import {
  BaseMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { StateGraph, Annotation } from "@langchain/langgraph";
import { vectorDB } from "../../database/vector-db";
import { v4 as uuidv4 } from "uuid";

// Define the state schema
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  discovered_skills: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  active_skill_id: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  tool_usage: Annotation<Record<string, number>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  fast_path: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

export function createMomaiGraph(llm: any) {
  
  /**
   * Discovery Router: Identifies which skills/plugins are relevant.
   */
  async function discoveryRouter(state: typeof AgentState.State) {
    if (!state.messages.length) {
      return { fast_path: true, messages: [] };
    }

    const lastMsg = state.messages[state.messages.length - 1].content.toString();
    
    // Simple greeting check
    const isGreeting = /^(oi|ola|bom dia|ola|hello|hi)/i.test(lastMsg.trim());
    
    if (isGreeting || lastMsg.length < 3) {
      return { fast_path: true, discovered_skills: [], messages: [] };
    }

    // Search skills in LanceDB (now in Node.js!)
    const skillHits = await vectorDB.searchSkills(lastMsg, 3);
    
    const discovered = skillHits.map(hit => ({
      id: hit.id,
      name: hit.name,
      description: hit.description,
      confidence: 90
    }));

    let shortcutMsg: AIMessage | null = null;
    if (discovered.length === 1 && discovered[0].confidence > 85) {
      shortcutMsg = new AIMessage({
        content: "",
        tool_calls: [
          {
            id: `shortcut_${uuidv4().slice(0, 8)}`,
            name: "activate_skill",
            args: {
              skill_id: discovered[0].id,
              task_description: lastMsg,
            },
          }
        ],
      });
    }

    return {
      discovered_skills: discovered,
      fast_path: shortcutMsg === null,
      messages: shortcutMsg ? [shortcutMsg] : [],
    };
  }

  /**
   * Manager Node: The main orchestrator LLM.
   */
  async function managerNode(state: typeof AgentState.State) {
    const systemPrompt = "You are MomAI, a helpful assistant. Use tools to help the user.";
    
    const prompt = [
      new SystemMessage(systemPrompt),
      ...state.messages
    ];

    const response = await llm.invoke(prompt);
    return { messages: [response] };
  }

  /**
   * Specialist Node: Calls the Python bridge for plugin execution.
   */
  async function specialistNode(state: typeof AgentState.State) {
    const lastMsg = state.messages[state.messages.length - 1];
    let skillId = "unknown";
    
    if (lastMsg instanceof AIMessage && lastMsg.tool_calls?.length) {
        skillId = lastMsg.tool_calls[0].args.skill_id;
    }

    return {
      messages: [new AIMessage(`Specialist for ${skillId} would run here.`) ]
    };
  }

  // Build the graph
  const workflow = new StateGraph(AgentState)
    .addNode("router", discoveryRouter)
    .addNode("momai_agent", managerNode)
    .addNode("specialist_worker", specialistNode);

  workflow.addEdge("__start__", "router");
  
  workflow.addConditionalEdges("router", (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg instanceof AIMessage && lastMsg.tool_calls?.length) {
        return "specialist_worker";
    }
    return "momai_agent";
  });

  workflow.addConditionalEdges("momai_agent", (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg instanceof AIMessage && lastMsg.tool_calls?.length) {
      return lastMsg.tool_calls[0].name === "activate_skill" ? "specialist_worker" : "__end__";
    }
    return "__end__";
  });

  workflow.addEdge("specialist_worker", "__end__");

  return workflow.compile();
}
