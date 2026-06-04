import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "liveguard_ai")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

messages_collection = db["messages"]
banned_users_collection = db["banned_users"]
users_collection = db["users"]
cases_collection = db["cases"]
audit_logs_collection = db["audit_logs"]