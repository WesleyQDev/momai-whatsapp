from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import app_state

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    app_state.active_websockets.append(websocket)
    app_state.logger.info(f"[WS] Client connected. Total: {len(app_state.active_websockets)}")
    try:
        if not app_state.ai_stack_loaded:
            await app_state.initialize_ai_stack()

        if app_state.last_init_event["progress"] < 100:
            await websocket.send_json(
                {"type": "init_progress", "data": app_state.last_init_event}
            )

        await websocket.send_json(
            {
                "type": "extensions_sync",
                "data": app_state.extension_manager.get_all_skills(),
            }
        )

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in app_state.active_websockets:
            app_state.active_websockets.remove(websocket)
            app_state.logger.info(f"[WS] Client disconnected. Total: {len(app_state.active_websockets)}")
    except Exception as e:
        if websocket in app_state.active_websockets:
            app_state.active_websockets.remove(websocket)
        app_state.logger.error(f"[WS] Error: {e}")
