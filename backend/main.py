from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from moderation import analyse_message
from models import ChatMessage
from database import messages_collection, banned_users_collection
import json
import time

app = FastAPI(title="LIVEGUARD AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# room_id -> list of connected websockets
active_rooms = {}


@app.get("/")
def root():
    return {"message": "LIVEGUARD AI backend is running with stream rooms"}


@app.get("/rooms/{room_id}/messages")
def get_room_messages(room_id: str):
    messages = list(
        messages_collection.find(
            {"room_id": room_id},
            {"_id": 0}
        ).sort("timestamp", -1)
    )

    return messages


@app.get("/rooms/{room_id}/flagged")
def get_room_flagged_messages(room_id: str):
    flagged = list(
        messages_collection.find(
            {"room_id": room_id, "is_flagged": True},
            {"_id": 0}
        ).sort("timestamp", -1)
    )

    return flagged


@app.get("/rooms/{room_id}/banned-users")
def get_banned_users(room_id: str):
    banned_users = list(
        banned_users_collection.find(
            {"room_id": room_id},
            {"_id": 0}
        )
    )

    return banned_users


@app.post("/rooms/{room_id}/action/{msg_id}/{action}")
async def take_action(room_id: str, msg_id: int, action: str):
    valid_actions = ["warn", "mute", "ban"]

    if action not in valid_actions:
        return {"success": False, "error": "Invalid action"}

    message = messages_collection.find_one(
        {"room_id": room_id, "id": msg_id},
        {"_id": 0}
    )

    if not message:
        return {"success": False, "error": "Message not found"}

    messages_collection.update_one(
        {"room_id": room_id, "id": msg_id},
        {"$set": {"action_taken": action}}
    )

    if action == "ban":
        banned_users_collection.update_one(
            {
                "room_id": room_id,
                "username": message["username"],
            },
            {
                "$set": {
                    "room_id": room_id,
                    "username": message["username"],
                    "banned_at": int(time.time()),
                    "reason": message["category"],
                }
            },
            upsert=True,
        )

    updated_message = messages_collection.find_one(
        {"room_id": room_id, "id": msg_id},
        {"_id": 0}
    )

    # Broadcast moderation action to everyone in the same room
    if room_id in active_rooms:
        for client in active_rooms[room_id]:
            await client.send_json(
                {
                    "type": "moderation_action",
                    "message": updated_message,
                }
            )

    return {"success": True, "message": updated_message}


@app.websocket("/ws/rooms/{room_id}")
async def websocket_room(websocket: WebSocket, room_id: str):
    await websocket.accept()

    if room_id not in active_rooms:
        active_rooms[room_id] = []

    active_rooms[room_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            parsed = json.loads(data)

            chat = ChatMessage(
                room_id=room_id,
                username=parsed["username"],
                message=parsed["message"],
            )

            banned_user = banned_users_collection.find_one(
                {
                    "room_id": room_id,
                    "username": chat.username,
                }
            )

            if banned_user:
                await websocket.send_json(
                    {
                        "type": "system",
                        "message": f"@{chat.username} is banned from this room.",
                    }
                )
                continue

            moderation_result = analyse_message(chat.message)

            last_message = messages_collection.find_one(
                {"room_id": room_id},
                sort=[("id", -1)]
            )

            next_id = 1 if not last_message else last_message["id"] + 1

            moderated_message = {
                "type": "chat_message",
                "id": next_id,
                "room_id": room_id,
                "username": chat.username,
                "message": chat.message,
                "timestamp": int(time.time()),
                **moderation_result,
                "action_taken": "none",
            }

            messages_collection.insert_one(moderated_message.copy())

            for client in active_rooms[room_id]:
                await client.send_json(moderated_message)

    except WebSocketDisconnect:
        active_rooms[room_id].remove(websocket)

        if len(active_rooms[room_id]) == 0:
            del active_rooms[room_id]