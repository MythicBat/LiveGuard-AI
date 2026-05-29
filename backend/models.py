from pydantic import BaseModel

class ChatMessage(BaseModel):
    room_id: str
    username: str
    message: str

class UserRegister(BaseModel):
    username: str
    password: str
    role: str = "Viewer"

class UserLogin(BaseModel):
    username: str
    password: str