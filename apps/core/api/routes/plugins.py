from fastapi import APIRouter, HTTPException
import app_state
from api.schemas import PluginExecuteRequest, PluginInfo
import asyncio

router = APIRouter()


@router.get("/plugins/list", response_model=list[PluginInfo])
async def list_plugins():
    """Returns the list of available plugins/skills and their tools."""
    await app_state.ensure_extension_manager_loaded()
    app_state.extension_manager.load_all()
    skills = app_state.extension_manager.get_all_skills()

    plugin_list = []
    for skill in skills:
        # Assuming skill object has these attributes or we can derive them
        plugin_list.append(
            PluginInfo(
                id=skill["id"],
                name=skill.get("name", skill["id"]),
                description=skill.get("description", ""),
                intents=skill.get("intents", []),
                tools=[t.name for t in skill.get("tools", [])]
                if "tools" in skill
                else [],
            )
        )
    return plugin_list


@router.post("/plugins/execute")
async def execute_plugin(req: PluginExecuteRequest):
    """Executes a specific tool from a plugin."""
    await app_state.ensure_extension_manager_loaded()
    skill = app_state.extension_manager.get_skill(req.skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Plugin {req.skill_id} not found")

    # Logic to find and execute the tool
    # This depends on how the extension_manager / skill object is structured
    # Usually it involves getting the tool by name and calling it.
    try:
        # Simplified execution logic
        tools = await asyncio.to_thread(skill.get_tools)
        target_tool = next((t for t in tools if t.name == req.tool_name), None)

        if not target_tool:
            raise HTTPException(
                status_code=404,
                detail=f"Tool {req.tool_name} not found in plugin {req.skill_id}",
            )

        result = await target_tool.ainvoke(req.args)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
