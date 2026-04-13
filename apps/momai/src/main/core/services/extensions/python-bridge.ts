import axios from "axios";

/**
 * The Python Bridge is responsible for communicating with the simplified 
 * Python Core, which now only acts as a plugin runner.
 */
export class PythonPluginBridge {
    private static instance: PythonPluginBridge;
    private baseUrl: string;

    private constructor() {
        this.baseUrl = process.env.MOMAI_CORE_URL || "http://localhost:8000";
    }

    public static getInstance(): PythonPluginBridge {
        if (!PythonPluginBridge.instance) {
            PythonPluginBridge.instance = new PythonPluginBridge();
        }
        return PythonPluginBridge.instance;
    }

    /**
     * Executes a specific tool/plugin in the Python environment.
     */
    public async executePluginTool(skillId: string, toolName: string, args: any): Promise<any> {
        try {
            const response = await axios.post(`${this.baseUrl}/plugins/execute`, {
                skill_id: skillId,
                tool_name: toolName,
                args: args
            });
            return response.data;
        } catch (error) {
            console.error(`[PythonBridge] Error executing plugin ${skillId}.${toolName}:`, error);
            throw error;
        }
    }

    /**
     * Discovers and registers plugins from the Python side into the Node.js database.
     */
    public async syncPlugins(): Promise<void> {
        try {
            const response = await axios.get(`${this.baseUrl}/plugins/list`);
            const plugins = response.data;
            console.log(`[PythonBridge] Synced ${plugins.length} plugins from Python.`);
        } catch (error) {
            console.error("[PythonBridge] Error syncing plugins:", error);
        }
    }
}

export const pythonBridge = PythonPluginBridge.getInstance();
