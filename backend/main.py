from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from moderation import analyse_message
from models import ChatMessage, UserRegister, UserLogin
from database import messages_collection, banned_users_collection, users_collection, cases_collection, audit_logs_collection
from auth import hash_password, verify_password, create_access_token, decode_token_from_header
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

def require_moderator(payload):
    if not payload:
        return False
    
    role = payload.get("role")

    return role in ["Moderator", "Admin"]

def write_audit_log(room_id, actor, action, target_user=None, details=None):
    log = {
        "room_id": room_id,
        "actor": actor,
        "action": action,
        "target_user": target_user,
        "details": details or {},
        "timestamp": int(time.time()),
    }

    audit_logs_collection.insert_one(log)


@app.get("/")
def root():
    return {"message": "LIVEGUARD AI backend is running with stream rooms"}

@app.post("/auth/register")
def register_user(user: UserRegister):
    existing_user = users_collection.find_one({"username": user.username})

    if existing_user:
        return {"success": False, "error": "Username already exists"}

    if user.role not in ["Viewer", "Moderator", "Admin"]:
        return {"success": False, "error": "Invalid role"}

    hashed = hash_password(user.password)

    users_collection.insert_one(
        {
            "username": user.username,
            "password": hashed,
            "role": user.role,
            "created_at": int(time.time()),
        }
    )

    return {
        "success": True,
        "message": "User registered successfully",
        "username": user.username,
        "role": user.role,
    }


@app.post("/auth/login")
def login_user(user: UserLogin):
    existing_user = users_collection.find_one({"username": user.username})

    if not existing_user:
        return {"success": False, "error": "Invalid username or password"}

    is_valid = verify_password(user.password, existing_user["password"])

    if not is_valid:
        return {"success": False, "error": "Invalid username or password"}

    token = create_access_token(
        {
            "username": existing_user["username"],
            "role": existing_user["role"],
        }
    )

    return {
        "success": True,
        "token": token,
        "username": existing_user["username"],
        "role": existing_user["role"],
    }


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
async def take_action(room_id: str, msg_id: int, action: str, payload: dict = Depends(decode_token_from_header)):
    if not require_moderator(payload):
        return {
            "success": False,
            "error": "Unauthorized: Moderator or Admin role required"
        }
    
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

    write_audit_log(
        room_id=room_id,
        actor=payload.get("username", "unknown"),
        action=f"message_{action}",
        target_user=message["username"],
        details={
            "message_id": msg_id,
            "message": message["message"],
            "category": message["category"],
            "risk_score": message["risk_score"],
        },
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

@app.post("/rooms/{room_id}/cases/{msg_id}")
def create_case(room_id: str, msg_id: int, payload: dict = Depends(decode_token_from_header)):
    if not require_moderator(payload):
        return {
            "success": False,
            "error": "Unauthorized: Moderator or Admin role required"
        }

    message = messages_collection.find_one(
        {"room_id": room_id, "id": msg_id},
        {"_id": 0}
    )

    if not message:
        return {"success": False, "error": "Message not found"}
    
    existing_case = cases_collection.find_one(
        {"room_id": room_id, "message_id": msg_id},
        {"_id": 0}
    )

    if existing_case:
        return {
            "success": True,
            "message": "Case already exists for this message",
            "case": existing_case,
        }
    
    last_case = cases_collection.find_one(
        {"room_id": room_id},
        sort=[("case_id", -1)]
    )

    next_case_id = 1 if not last_case else last_case["case_id"] + 1

    priority = "High" if message["risk_score"] >= 70 else "Medium"

    case = {
        "case_id": next_case_id,
        "room_id": room_id,
        "message_id": msg_id,
        "username": message["username"],
        "message": message["message"],
        "category": message["category"],
        "risk_score": message["risk_score"],
        "severity": message["severity"],
        "ai_explanation": message.get("ai_explanation", ""),
        "recommended_action": message.get("recommended_action", "none"),
        "policy_reason": message.get("policy_reason", ""),
        "priority": priority,
        "status": "Open",
        "assigned_to": "Unassigned",
        "created_at": int(time.time()),
    }

    cases_collection.insert_one(case.copy())

    write_audit_log(
        room_id=room_id,
        actor=payload.get("username", "unknown"),
        action="case_created",
        target_user=message["username"],
        details={
            "case_id": next_case_id,
            "message_id": msg_id,
            "priority": priority, 
        },
    )

    return {"success": True, "case": case}

@app.get("/rooms/{room_id}/cases")
def get_cases(room_id: str):
    cases = list(
        cases_collection.find(
            {"room_id": room_id},
            {"_id": 0}
        ).sort("created_at", -1)
    )
    return cases

@app.get("/moderation/mode")
def get_moderation_mode():
    import os

    return {
        "mode": os.getenv("MODERATION_MODE", "ai")
    }

@app.get("/rooms/{room_id}/audit-logs")
def get_audit_logs(room_id: str):
    logs = list(
        audit_logs_collection.find(
            {"room_id": room_id},
            {"_id": 0}
        ).sort("timestamp", -1)
    )

    return logs

@app.patch("/rooms/{room_id}/cases/{case_id}/{status}")
def update_case_status(room_id: str, case_id: int, status: str, payload: dict = Depends(decode_token_from_header)):
    if not require_moderator(payload):
        return {
            "success": False,
            "error": "Unauthorized: Moderator or Admin role required"
        }

    valid_statuses = ["Open", "In Progress", "Resolved"]

    if status not in valid_statuses:
        return {"success": False, "error": "Invalid status"}
    
    result = cases_collection.update_one(
        {"room_id": room_id, "case_id": case_id},
        {"$set": {"status": status}}
    )

    if result.matched_count == 0:
        return {"success": False, "error": "Case not found"}
    
    updated_case = cases_collection.find_one(
        {"room_id": room_id, "case_id": case_id},
        {"_id": 0}
    )

    write_audit_log(
        room_id=room_id,
        actor=payload.get("username", "unknown"),
        action="case_status_updated",
        target_user=updated_case["username"],
        details={
            "case_id": case_id,
            "new_status": status,
        },
    )

    return {"success": True, "case": updated_case}


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
                write_audit_log(
                    room_id=room_id,
                    actor=chat.username,
                    action="banned_user_attempted_message",
                    target_user=chat.username,
                    details={
                        "attempted_message": chat.message,
                    },
                )
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