"""WebSocket live bus: pushes vitals, scores, alerts and device events to the
dashboard. Connect at ws://<host>:8000/ws/live"""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []
        self._loop = None

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)
        self._loop = asyncio.get_event_loop()
        await ws.send_json({"type": "connected", "data": {"clients": len(self.active)}})

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def broadcast_threadsafe(self, message: dict) -> None:
        """Called from worker threads / executors."""
        loop = self._loop
        if loop is None:
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(message), loop)
        except Exception:
            pass


manager = ConnectionManager()


@router.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # clients may send ping frames; we only broadcast server->client
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
