import json
import logging
from typing import Dict, List, Optional
from fastapi import WebSocket

logger = logging.getLogger("poll_manager")

class ConnectionManager:
    def __init__(self):
        # team_code -> list of active WebSocket connections
        self.team_connections: Dict[str, List[WebSocket]] = {}
        # list of active admin WebSockets
        self.admin_connections: List[WebSocket] = []
        # Current pitching team state (selected via wheel or manually)
        self.current_pitching_team: Optional[dict] = None

    async def connect_team(self, websocket: WebSocket, team_code: str):
        await websocket.accept()
        if team_code not in self.team_connections:
            self.team_connections[team_code] = []
        self.team_connections[team_code].append(websocket)
        logger.info(f"Team {team_code} connected (total for team: {len(self.team_connections[team_code])})")

    def disconnect_team(self, websocket: WebSocket, team_code: str):
        if team_code in self.team_connections:
            if websocket in self.team_connections[team_code]:
                self.team_connections[team_code].remove(websocket)
            if not self.team_connections[team_code]:
                del self.team_connections[team_code]
        logger.info(f"Team {team_code} disconnected")

    async def connect_admin(self, websocket: WebSocket):
        await websocket.accept()
        self.admin_connections.append(websocket)
        logger.info(f"Admin connected (total admins: {len(self.admin_connections)})")

    def disconnect_admin(self, websocket: WebSocket):
        if websocket in self.admin_connections:
            self.admin_connections.remove(websocket)
        logger.info("Admin disconnected")

    async def broadcast_to_teams(self, payload: dict):
        message = json.dumps(payload)
        for code, sockets in list(self.team_connections.items()):
            for ws in list(sockets):
                try:
                    await ws.send_text(message)
                except Exception as e:
                    logger.warning(f"Error sending to team {code}: {e}")

    async def send_to_team(self, team_code: str, payload: dict):
        message = json.dumps(payload)
        if team_code in self.team_connections:
            for ws in list(self.team_connections[team_code]):
                try:
                    await ws.send_text(message)
                except Exception as e:
                    logger.warning(f"Error sending to team {team_code}: {e}")

    async def broadcast_to_admin(self, payload: dict):
        message = json.dumps(payload)
        for ws in list(self.admin_connections):
            try:
                await ws.send_text(message)
            except Exception as e:
                logger.warning(f"Error sending to admin: {e}")

    async def broadcast_all(self, payload: dict):
        await self.broadcast_to_teams(payload)
        await self.broadcast_to_admin(payload)

manager = ConnectionManager()
