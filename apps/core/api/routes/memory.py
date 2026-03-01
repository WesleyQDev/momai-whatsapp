import os
from fastapi import APIRouter, BackgroundTasks

from api.schemas import MemorySearch, NoteCreate, NoteUpdate, NotesImport, FolderRename

router = APIRouter()


@router.get("/memory/notes")
async def list_memory_notes():
    from services.memory.external_memory import list_notes
    return list_notes()


@router.get("/memory/folders")
async def list_memory_folders():
    from services.memory.external_memory import list_folders
    return list_folders()


@router.post("/memory/folders")
async def create_memory_folder(payload: dict):
    from services.memory.external_memory import _ensure_notes_dir, _resolve_note_path, NOTES_DIR_NAME
    path_val = payload.get("path")
    if not path_val:
        return {"status": "error", "message": "Path is required"}
    
    _ensure_notes_dir()
    rel_path = os.path.join(NOTES_DIR_NAME, path_val.strip("/\\"))
    abs_path = _resolve_note_path(rel_path)
    abs_path.mkdir(parents=True, exist_ok=True)
    return {"status": "created", "path": path_val}


@router.patch("/memory/folders")
async def rename_memory_folder(payload: FolderRename):
    from services.memory.external_memory import rename_folder
    success = rename_folder(payload.old_path, payload.new_path)
    if not success:
        return {"status": "error", "message": "Failed to rename folder"}
    return {"status": "success"}


@router.get("/memory/notes/{note_id}")
async def get_memory_note(note_id: str):
    from services.memory.external_memory import get_note
    note = get_note(note_id)
    if not note:
        return {"status": "error", "message": "Note not found"}
    return note


@router.post("/memory/notes")
async def create_memory_note(payload: NoteCreate):
    from services.memory.external_memory import create_note
    return create_note(payload.title, payload.content, path=payload.path)


@router.patch("/memory/notes/{note_id}")
async def update_memory_note(note_id: str, payload: NoteUpdate):
    from services.memory.external_memory import update_note
    updated = update_note(note_id, payload.title, payload.content, path=payload.path)
    if not updated:
        return {"status": "error", "message": "Note not found"}
    return updated


@router.delete("/memory/notes/{note_id}")
async def delete_memory_note(note_id: str):
    from services.memory.external_memory import delete_note
    deleted = delete_note(note_id)
    return {"status": "deleted" if deleted else "not_found"}


@router.post("/memory/notes/import")
async def import_memory_notes(payload: NotesImport, background: BackgroundTasks):
    from services.memory.external_memory import import_notes

    def _do_import() -> None:
        import_notes([item.model_dump() for item in payload.files])

    background.add_task(_do_import)
    return {"status": "queued", "count": len(payload.files)}


@router.post("/memory/notes/{note_id}/open-folder")
async def open_note_folder_route(note_id: str):
    from services.memory.external_memory import open_note_folder
    success = open_note_folder(note_id)
    return {"success": success}


@router.post("/memory/search")
async def search_memory(payload: MemorySearch):
    from services.memory.external_memory import search_memory
    limit = payload.limit or None
    results = await search_memory(payload.query, limit=limit or 6)
    return {"query": payload.query, "results": results}
