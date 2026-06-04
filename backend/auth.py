from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta, UTC
from fastapi import Header

SECRET_KEY = "liveguard-secret-key"
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token_from_header(authorization: str = Header(None)):
    if not authorization:
        return None
    
    try:
        scheme, token = authorization.split()

        if scheme.lower() != "bearer":
            return None
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    
    except Exception:
        return None