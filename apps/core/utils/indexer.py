import os
import json
import asyncio
import logging
from database.vector_db import vector_db
from tools.system_actions import TOOLS
from ai.embeddings import embeddings
from services.extensions.manager import skill_registry

logger = logging.getLogger(__name__)


async def index_all_system_tools(on_progress=None):
    tools_to_index = []
    for tool in TOOLS:
        if on_progress:
            on_progress(f"Indexing system tool: {tool.name}")
        tools_to_index.append(
            {
                "name": tool.name,
                "description": tool.description,
            }
        )

    skill_tools = skill_registry.get_tools()
    for tool in skill_tools:
        if on_progress:
            on_progress(f"Indexing skill tool: {tool.name}")
        tools_to_index.append(
            {
                "name": tool.name,
                "description": tool.description,
            }
        )

    if tools_to_index:
        await vector_db.add_tools(tools_to_index)


async def index_all_skills(on_progress=None):
    skills_to_index = []
    from domain.skill import Skill

    for skill_id, skill in skill_registry.skills.items():
        if not skill.file_path:
            continue

        try:
            if on_progress:
                on_progress(f"Indexing skill manifest: {skill_id}")
            
            # O objeto skill já está carregado no registry
            skills_to_index.append(
                {
                    "id": skill.id,
                    "name": skill.name,
                    "description": skill.description,
                    "intents": skill.intents,
                }
            )
        except Exception as e:
            logger.error(f"[Indexer] Error indexing skill {skill_id}: {e}")

    if skills_to_index:
        await vector_db.add_skills(skills_to_index)


if __name__ == "__main__":
    skill_registry.load_all()
    asyncio.run(index_all_system_tools())
    asyncio.run(index_all_skills())
