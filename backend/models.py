from pydantic import BaseModel

class ChatMessage(BaseModel):
    room_id: str
    username: str
    message: str