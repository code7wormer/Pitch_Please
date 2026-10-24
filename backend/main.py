import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routers import admin, teams, voting
from services.poll_manager import manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize DB tables on startup
    await init_db()
    yield

app = FastAPI(
    title="Pitch Please! API",
    description="Live Game Pitching Event Real-time Voting Platform for Dimensions Club",
    version="1.0.0",
    lifespan=lifespan
)

# Enable full CORS for Cloudflare Pages and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(admin.router)
app.include_router(teams.router)
app.include_router(voting.router)

@app.get("/")
async def root():
    return {
        "app": "Pitch Please!",
        "club": "Dimensions",
        "status": "online",
        "version": "1.0.0"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

# Real-time WebSocket for Teams
@app.websocket("/ws/team/{team_code}")
async def websocket_team(websocket: WebSocket, team_code: str):
    await manager.connect_team(websocket, team_code)
    try:
        while True:
            # Keep connection alive, listen for client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect_team(websocket, team_code)
    except Exception:
        manager.disconnect_team(websocket, team_code)

# Real-time WebSocket for Admin Panel
@app.websocket("/ws/admin")
async def websocket_admin(websocket: WebSocket):
    await manager.connect_admin(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect_admin(websocket)
    except Exception:
        manager.disconnect_admin(websocket)
