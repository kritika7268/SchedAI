"""
WebSocket connection manager for SchedAI real-time notifications.

Place this file at: backend/app/websocket_manager.py

Keeps a list of currently-connected browser tabs (each one a WebSocket),
tagged with the role of whoever is logged in on that tab (admin / teacher
/ student). When something notification-worthy happens (a teacher goes
absent, a holiday is announced, etc.), the REST endpoint that handled it
calls `manager.broadcast(...)`, which pushes the message instantly to
every connection whose role matches the notification's audience —
no polling, no refresh needed.

Requires the `websockets` package (FastAPI's WebSocket support depends on
it): pip install websockets
"""

from fastapi import WebSocket
from typing import List


class ConnectionManager:
    def __init__(self):
        # Each entry: {"socket": WebSocket, "role": "admin"|"teacher"|"student"}
        self.active_connections: List[dict] = []

    async def connect(self, websocket: WebSocket, role: str):
        await websocket.accept()
        self.active_connections.append({"socket": websocket, "role": role})

    def disconnect(self, websocket: WebSocket):
        self.active_connections = [
            c for c in self.active_connections if c["socket"] != websocket
        ]

    async def broadcast(self, payload: dict):
        """
        payload must include an "audience" key: "all" | "admin" | "teacher"
        | "student". Delivers to every currently-connected socket whose
        role matches (or everyone, if audience is "all"). Dead sockets
        (client closed the tab without a clean disconnect) are pruned
        silently so they don't pile up.
        """
        audience = payload.get("audience", "all")
        dead = []

        for conn in self.active_connections:
            if audience != "all" and conn["role"] != audience:
                continue
            try:
                await conn["socket"].send_json(payload)
            except Exception:
                dead.append(conn)

        for conn in dead:
            self.active_connections.remove(conn)


# Single shared instance — imported by main.py and by every endpoint
# that needs to push a notification.
manager = ConnectionManager()