from dotenv import load_dotenv
from pathlib import Path
BACKEND_DIR = Path(__file__).parent
ROOT_DIR = BACKEND_DIR.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")

import os
import uuid
import logging
import bcrypt
import jwt
import secrets
import requests
import httpx
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta, time as time_obj
from typing import Optional, List, Literal
from decimal import Decimal
import gzip
import io
import re
import asyncio
import json

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from database import DuplicateKeyError, AsyncIOMotorGridFSBucket, AsyncIOMotorClient, convert_val
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, Header, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr

# ---------- CONFIG ----------
JWT_SECRET = os.environ.get("JWT_SECRET", "AQZ3FxRJniXnp2qAbQ2hq3ZJburQogdsyQ4njZdrzZYHEm7mYkgCksBOXcxdGacIuBD3fje2LmwLUSvPkrWdYQ==")
JWT_ALGO = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "makfinpay@gmail.com").lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Riyaz@1212")
APP_NAME = os.environ.get("APP_NAME", "makfinpay")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

from database import PostgresDatabase
db = PostgresDatabase()
client = db

app = FastAPI(title="MAK FIN PAY API")
api = APIRouter(prefix="/api")

@app.get("/health")
@api.get("/health")
@app.get("/server-time")
@api.get("/server-time")
async def health_check():
    now_utc = datetime.now(timezone.utc)
    now_ist = now_utc.astimezone(IST)
    target_1130_today = now_ist.replace(hour=11, minute=30, second=0, microsecond=0)
    next_1130 = target_1130_today if now_ist < target_1130_today else (target_1130_today + timedelta(days=1))
    return {
        "status": "ok",
        "app": "MAK FIN PAY API",
        "server_utc": now_utc.isoformat(),
        "ist_time": now_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
        "ist_date": now_ist.strftime("%Y-%m-%d"),
        "ist_clock": now_ist.strftime("%I:%M:%S %p"),
        "timezone": "Asia/Kolkata (IST +05:30)",
        "t1_rule": "Recharges created on Day X settle on Day X + 1 at 11:30 AM IST sharp",
        "next_1130_am_ist": next_1130.strftime("%Y-%m-%d %H:%M:%S IST")
    }


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: dict = {}
        self.role_connections: dict = {}

    async def connect(self, websocket: WebSocket, user_id: str, role: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        if user_id not in self.user_connections:
            self.user_connections[user_id] = []
        self.user_connections[user_id].append(websocket)
        if role not in self.role_connections:
            self.role_connections[role] = []
        self.role_connections[role].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str, role: str):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if user_id in self.user_connections and websocket in self.user_connections[user_id]:
            self.user_connections[user_id].remove(websocket)
        if role in self.role_connections and websocket in self.role_connections[role]:
            self.role_connections[role].remove(websocket)

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.user_connections:
            for connection in self.user_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    async def send_to_role(self, role: str, message: dict):
        if role in self.role_connections:
            for connection in self.role_connections[role]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_aud": False})
        user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
        role = payload.get("user_role") or payload.get("role")
        if not user_id or not role:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id, role)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, role)
    except Exception:
        manager.disconnect(websocket, user_id, role)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("makfinpay")

# ---------- STORAGE ----------
storage_key: Optional[str] = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str):
    # Store in RAM cache immediately for 0ms instant serving
    try:
        RAM_FILE_CACHE[path] = (data, content_type)
    except Exception:
        pass

    # Save locally to cache first for instant retrieval
    try:
        local_cache_path = os.path.join("cache", path)
        os.makedirs(os.path.dirname(local_cache_path), exist_ok=True)
        with open(local_cache_path, "wb") as f:
            f.write(data)
    except Exception as e:
        logger.error(f"Failed to cache uploaded file locally: {e}")

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("REACT_APP_SUPABASE_SERVICE_ROLE_KEY")
    supabase_bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "uploads")
    
    if supabase_url and supabase_key:
        parts = path.split("/", 1)
        first_seg = parts[0] if parts else ""
        rest_seg = parts[1] if len(parts) > 1 else path

        # Try default bucket + path, and first_seg as bucket + rest_seg
        targets = [
            (supabase_bucket, path),
            (first_seg, rest_seg),
            ("makfinpay", path),
            ("uploads", path)
        ]

        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": content_type,
            "x-upsert": "true"
        }
        
        for b, p in targets:
            if not b or not p:
                continue
            url = f"{supabase_url}/storage/v1/object/{b}/{p}"
            try:
                r = requests.post(url, headers=headers, data=data, timeout=30)
                if r.status_code in (200, 201):
                    return {"path": path, "size": len(data)}
            except Exception:
                pass

        return {"path": path, "size": len(data)}
        
    k = init_storage()
    if not k:
        return {"path": path, "size": len(data)}
    try:
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": k, "Content-Type": content_type},
            data=data, timeout=120
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return {"path": path, "size": len(data)}


def make_thumbnail(data: bytes, ext: str) -> bytes:
    import io
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(data))
        img.thumbnail((300, 300))
        out = io.BytesIO()
        fmt = img.format if img.format else 'JPEG'
        if fmt == 'JPEG' and img.mode in ('RGBA', 'LA'):
            img = img.convert('RGB')
        img.save(out, format=fmt, quality=75)
        return out.getvalue()
    except Exception as e:
        logger.error(f"Failed to generate thumbnail: {e}")
        return data

def get_object_thumbnail(path: str):
    local_cache_path = os.path.join("cache", "thumbnails", path)
    if os.path.exists(local_cache_path):
        try:
            with open(local_cache_path, "rb") as f:
                content = f.read()
            ext = path.rsplit(".", 1)[-1].lower() if "." in path else "bin"
            ct_map = {
                "png": "image/png",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "webp": "image/webp"
            }
            return content, ct_map.get(ext, "image/jpeg")
        except Exception as e:
            logger.error(f"Failed to read thumbnail cache: {e}")

    original_data, ct = get_object(path)
    if not ct.startswith("image/"):
        return original_data, ct
        
    thumbnail_data = make_thumbnail(original_data, path.rsplit(".", 1)[-1].lower() if "." in path else "jpeg")
    
    try:
        os.makedirs(os.path.dirname(local_cache_path), exist_ok=True)
        with open(local_cache_path, "wb") as f:
            f.write(thumbnail_data)
    except Exception as e:
        logger.error(f"Failed to write thumbnail cache: {e}")
        
    return thumbnail_data, ct

RAM_FILE_CACHE = {}

def get_object(path: str):
    clean_path = path.lstrip("/")
    if clean_path in RAM_FILE_CACHE:
        return RAM_FILE_CACHE[clean_path]
    if path in RAM_FILE_CACHE:
        return RAM_FILE_CACHE[path]

    local_cache_path = os.path.join("cache", clean_path.replace("/", os.sep))

    # Local backup folder check
    backup_file_paths = [
        os.path.join("/storage_backup", clean_path.replace("/", os.sep)),
        os.path.join("/app", "storage_backup", clean_path.replace("/", os.sep)),
        os.path.join("storage_backup", clean_path.replace("/", os.sep)),
        os.path.join("..", "storage_backup", clean_path.replace("/", os.sep)),
        local_cache_path
    ]
    for backup_file_path in backup_file_paths:
        if os.path.exists(backup_file_path):
            try:
                with open(backup_file_path, "rb") as f:
                    content = f.read()
                ext = clean_path.rsplit(".", 1)[-1].lower() if "." in clean_path else "bin"
                ct_map = {
                    "png": "image/png",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "jfif": "image/jpeg",
                    "webp": "image/webp",
                    "pdf": "application/pdf"
                }
                res = (content, ct_map.get(ext, "image/jpeg"))
                RAM_FILE_CACHE[clean_path] = res
                return res
            except Exception:
                pass

    supabase_url = (os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL") or "https://zpynrddggarkltuueqdk.supabase.co").strip().rstrip("/")
    supabase_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("REACT_APP_SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    supabase_bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "uploads")

    if supabase_url and supabase_key:
        parts = clean_path.split("/", 1)
        first_segment = parts[0] if parts else ""
        rest_segment = parts[1] if len(parts) > 1 else clean_path
        
        buckets_to_try = list(dict.fromkeys([supabase_bucket, "uploads", "makfinpay", first_segment]).keys())
        paths_to_try = list(dict.fromkeys([clean_path, rest_segment]).keys())
        
        urls_to_try = []
        for b in buckets_to_try:
            if not b:
                continue
            for p in paths_to_try:
                if not p:
                    continue
                urls_to_try.append(f"{supabase_url}/storage/v1/object/public/{b}/{p}")
                urls_to_try.append(f"{supabase_url}/storage/v1/object/authenticated/{b}/{p}")
                urls_to_try.append(f"{supabase_url}/storage/v1/object/{b}/{p}")

        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}"
        }
        for url in urls_to_try:
            try:
                r = requests.get(url, headers=headers, timeout=10)
                if r.status_code == 200 and len(r.content) > 0:
                    try:
                        os.makedirs(os.path.dirname(local_cache_path), exist_ok=True)
                        with open(local_cache_path, "wb") as f:
                            f.write(r.content)
                    except Exception as e:
                        logger.error(f"Failed to write to local file cache: {e}")
                    res = (r.content, r.headers.get("Content-Type", "image/jpeg"))
                    RAM_FILE_CACHE[clean_path] = res
                    return res
                else:
                    logger.debug(f"Fetch {url} returned status {r.status_code}")
            except Exception as e:
                logger.warning(f"Failed fetching {url}: {e}")

    k = init_storage()
    if k:
        try:
            r = requests.get(f"{STORAGE_URL}/objects/{clean_path}", headers={"X-Storage-Key": k}, timeout=30)
            if r.status_code == 200:
                return r.content, r.headers.get("Content-Type", "application/octet-stream")
        except Exception as e:
            logger.error(f"Fallback storage fetch failed: {e}")

    raise HTTPException(404, f"File not found: {clean_path}")

# ---------- HELPERS ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, role: str, minutes: int = 60 * 24) -> str:
    payload = {
        "sub": user_id,
        "role": "authenticated",
        "aud": "authenticated",
        "user_role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def create_pre_auth_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "type": "pre_auth"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def verify_pre_auth_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_aud": False})
        if payload.get("type") != "pre_auth":
            raise HTTPException(401, "Invalid session type")
        return {"user_id": payload["sub"], "role": payload["role"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Pre-auth session expired. Please log in again.")
    except Exception:
        raise HTTPException(401, "Invalid pre-auth session. Please log in again.")

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

def clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    if doc:
        doc.pop("password_hash", None)
    return doc

async def write_audit(user_id: str, action: str, target: str = "", meta: Optional[dict] = None, request: Optional[Request] = None):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "action": action,
        "target": target,
        "meta": meta or {},
        "ip": request.client.host if request and request.client else "",
        "created_at": now_iso(),
    })

# ---------- AUTH ----------
async def get_current_user(request: Request) -> dict:
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_aud": False})
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        try:
            admin_cred = await db.admin_credentials.find_one({"id": payload["sub"]}, {"_id": 0})
            if admin_cred:
                user = {
                    "id": admin_cred["id"],
                    "full_name": admin_cred.get("email", "Admin"),
                    "email": admin_cred.get("email"),
                    "role": "admin",
                    "frozen": admin_cred.get("frozen", False)
                }
        except Exception:
            pass
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("frozen"):
        raise HTTPException(403, "Account frozen")
    if user.get("role") != "admin":
        s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
        if s.get("maintenance_mode") and not user.get("is_tester", False):
            raise HTTPException(503, "Site is under maintenance. Please try again later.")
    user.pop("password_hash", None)
    return user

def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Forbidden")
        return user
    return dep

def require_approved_agent():
    async def dep(user: dict = Depends(require_roles("agent"))):
        if user.get("kyc_status") != "approved":
            raise HTTPException(403, "KYC is pending or rejected. Services are locked.")
        return user
    return dep

def require_approved_distributor():
    async def dep(user: dict = Depends(require_roles("distributor"))):
        if user.get("kyc_status") != "approved":
            raise HTTPException(403, "KYC is pending or rejected. Services are locked.")
        return user
    return dep

def require_approved_md():
    async def dep(user: dict = Depends(require_roles("master_distributor"))):
        if user.get("kyc_status") != "approved":
            raise HTTPException(403, "KYC is pending or rejected. Services are locked.")
        return user
    return dep

def require_approved_any():
    async def dep(user: dict = Depends(require_roles("agent", "distributor", "master_distributor"))):
        if user.get("kyc_status") != "approved":
            raise HTTPException(403, "KYC is pending or rejected. Services are locked.")
        return user
    return dep

# ---------- MODELS ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class MpinVerifyIn(BaseModel):
    pre_auth_token: str
    mpin: str

class MpinSetupIn(BaseModel):
    pre_auth_token: str
    mpin: str

class MpinChangeIn(BaseModel):
    current_mpin: str
    new_mpin: str

class TpinSetupIn(BaseModel):
    tpin: str

class TpinChangeIn(BaseModel):
    current_tpin: str
    new_tpin: str

class TpinResetIn(BaseModel):
    password: str
    new_tpin: str

class CreateUserIn(BaseModel):
    role: Literal["master_distributor", "distributor", "agent"]
    full_name: str
    email: EmailStr
    password: Optional[str] = None
    phone: str
    address: str
    firm_name: Optional[str] = None
    firm_address: Optional[str] = None
    aadhaar_path: Optional[str] = None  # uploaded file path (required for agents)
    pan_path: Optional[str] = None      # uploaded file path (required for agents)
    selfie_path: Optional[str] = None    # profile photo path
    commission_percent: Optional[float] = None  # for agent (markup) or MD (rate override)
    t1_commission_percent: Optional[float] = None # T+1 commission percent (only for Agent)
    t1_enabled: Optional[bool] = False
    is_tester: Optional[bool] = False

class UpdateUserIn(BaseModel):
    full_name: str
    email: EmailStr
    password: Optional[str] = None
    phone: str
    address: str
    firm_name: Optional[str] = None
    firm_address: Optional[str] = None
    aadhaar_path: Optional[str] = None
    pan_path: Optional[str] = None
    selfie_path: Optional[str] = None
    commission_percent: Optional[float] = None
    t1_commission_percent: Optional[float] = None
    t1_enabled: Optional[bool] = None
    hold_balance_amount: Optional[float] = None
    hold_active: Optional[bool] = None
    is_tester: Optional[bool] = None

class AdjustBalanceIn(BaseModel):
    amount: float = Field(..., gt=0)
    type: Literal["credit", "debit"]
    note: Optional[str] = ""

class ChangeFirstPasswordIn(BaseModel):
    password: str

class SubmitKycIn(BaseModel):
    aadhaar_path: str
    aadhaar_back_path: str
    pan_path: str
    selfie_path: str
    cheque_path: str
    firm_front_path: str

class RechargeIn(BaseModel):
    amount: float
    utr: str
    card_last4: str
    screenshot_path: str  # storage path of uploaded screenshot
    older_qr: Optional[bool] = False
    is_t1: Optional[bool] = False
    selected_qr_code_id: Optional[str] = None
    ocr_utr: Optional[str] = None
    ocr_amount: Optional[float] = None
    ocr_qr_name: Optional[str] = None
    ocr_match: Optional[bool] = False
    ocr_bypass: Optional[bool] = False

class BillPaymentIn(BaseModel):
    customer_name: str
    card_last4: str
    operator: str
    customer_phone: str
    amount: float

class CustomerParamItem(BaseModel):
    name: str
    value: str

class LiveBillFetchIn(BaseModel):
    billerId: str
    mobile: str
    customerParams: List[CustomerParamItem]

class LiveBillPayIn(BaseModel):
    billerId: str
    amount: float
    mobile: str
    fetchRequestId: Optional[str] = None
    additionalInfo: Optional[dict] = None
    customerParams: List[CustomerParamItem]
    billerResponseInfo: dict
    tpin: str

class WithdrawalIn(BaseModel):
    amount: float

class BankIn(BaseModel):
    account_holder: str
    account_number: str
    ifsc: str
    bank_name: str
    phone_number: str

class CommissionSettingsIn(BaseModel):
    default_percent: float

class RechargeLimitsIn(BaseModel):
    min_recharge_limit: float
    max_recharge_limit: float
    live_bill_max_limit: Optional[float] = 100000.0
    min_fund_transfer_limit: Optional[float] = 100.0

class RechargeTogglesIn(BaseModel):
    qr_enabled: Optional[bool] = None
    t1_qr_enabled: Optional[bool] = None
    recharge_enabled: Optional[bool] = None
    t1_recharge_enabled: Optional[bool] = None
    withdrawal_enabled: Optional[bool] = None
    bill_pay_enabled: Optional[bool] = None
    live_bill_enabled: Optional[bool] = None
    fund_transfer_enabled: Optional[bool] = None
    live_bill_api_charge: Optional[float] = None
    maintenance_mode: Optional[bool] = None
    qr_approved_audio: Optional[str] = None
    qr_rejected_audio: Optional[str] = None
    cc_bill_approved_audio: Optional[str] = None
    cc_bill_rejected_audio: Optional[str] = None
    qr_request_received_audio: Optional[str] = None
    cc_bill_request_received_audio: Optional[str] = None
    live_bill_enabled_audio: Optional[str] = None
    qr_approved_audio_enabled: Optional[bool] = None
    qr_rejected_audio_enabled: Optional[bool] = None
    cc_bill_approved_audio_enabled: Optional[bool] = None
    cc_bill_rejected_audio_enabled: Optional[bool] = None
    qr_request_received_audio_enabled: Optional[bool] = None
    cc_bill_request_received_audio_enabled: Optional[bool] = None
    live_bill_enabled_audio_enabled: Optional[bool] = None

class FundTransferIn(BaseModel):
    recipient_id: str
    amount: float
    remarks: Optional[str] = None
    note: Optional[str] = None


class HeadlineIn(BaseModel):
    message: str
    type: Optional[str] = "text"

class HeadlineReorderIn(BaseModel):
    ids: List[str]

class UpdateRechargeQrIn(BaseModel):
    qr_code_label: str
    qr_code_id: Optional[str] = None

class CommissionUpdateIn(BaseModel):
    commission_percent: float

class MarkupUpdateIn(BaseModel):
    markup_percent: float

class QRCodeIn(BaseModel):
    label: str
    image_path: str
    upi_id: Optional[str] = None
    mobile_number: Optional[str] = None
    is_t1: Optional[bool] = False

class UpdateHistoryPercentIn(BaseModel):
    qr_percent: float

class QRNameEntryIn(BaseModel):
    name: str
    color: str
    mobile_number: str
    upi_id: str
    min_amount: float
    max_amount: float
    image_path: str
    qr_percent: Optional[float] = 0.0
    is_t1: Optional[bool] = False

class QRReorderIn(BaseModel):
    ids: List[str]

class RejectionCategoryIn(BaseModel):
    name: str
    show_bill: bool
    show_qr: bool
    show_kyc: bool
    show_withdrawal: Optional[bool] = False

class RejectionReasonIn(BaseModel):
    category_id: str
    reason_text: str

class RejectionReasonUpdateIn(BaseModel):
    reason_text: str

class PolicyIn(BaseModel):
    title: str
    content: str

class ServiceChargeSlabIn(BaseModel):
    min_amount: float
    max_amount: float
    charge_amount: float
    charge_type: str = "flat"

class BankEntryIn(BaseModel):
    name: str
    bill_pay_enabled: bool = True
    payout_enabled: bool = True

class BankUpdateIn(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    bill_pay_enabled: Optional[bool] = None
    payout_enabled: Optional[bool] = None

class ApprovalIn(BaseModel):
    note: Optional[str] = None

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

class ForgotPasswordRequestIn(BaseModel):
    email: str

class ForgotPasswordResetIn(BaseModel):
    email: str
    otp: str
    new_password: str
    confirm_password: str

# ---------- AUTH ROUTES ----------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response, request: Request):
    email = body.email.lower()
    
    # Try looking in the admin_credentials table first
    admin_cred = None
    try:
        admin_cred = await db.admin_credentials.find_one({"email": email})
    except Exception:
        pass # Table might not exist yet or connection issue

    if admin_cred:
        if admin_cred.get("frozen"):
            raise HTTPException(403, "Your admin account is blocked")
            
        pw_hash = admin_cred.get("password_hash")
        if not pw_hash and admin_cred.get("password"):
            pw_hash = hash_password(admin_cred["password"])
            
        if not pw_hash or not verify_password(body.password, pw_hash):
            raise HTTPException(401, "Invalid credentials")
            
        # Retrieve or dynamically sync the admin user record in the users table
        user = await db.users.find_one({"email": email})
        if not user:
            user = {
                "id": admin_cred.get("id") or new_id(),
                "role": "admin",
                "full_name": "Super Admin" if email == "jigs.vanani@gmail.com" else "Admin User",
                "email": email,
                "password_hash": pw_hash,
                "phone": "",
                "address": "",
                "frozen": bool(admin_cred.get("frozen")),
                "is_deleted": False,
                "created_at": now_iso(),
                "permissions": admin_cred.get("permissions") or []
            }
            await db.users.insert_one(user)
        else:
            updates = {}
            if user.get("role") != "admin":
                updates["role"] = "admin"
            if user.get("password_hash") != pw_hash:
                updates["password_hash"] = pw_hash
            if bool(user.get("frozen")) != bool(admin_cred.get("frozen")):
                updates["frozen"] = bool(admin_cred.get("frozen"))
            if user.get("permissions") != (admin_cred.get("permissions") or []):
                updates["permissions"] = admin_cred.get("permissions") or []
                
            if updates:
                await db.users.update_one({"id": user["id"]}, {"$set": updates})
                user = await db.users.find_one({"id": user["id"]})
    else:
        # Standard user lookup
        user = await db.users.find_one({"email": email})
        if not user:
            raise HTTPException(401, "Invalid credentials")
        if user.get("frozen"):
            raise HTTPException(403, "Account frozen by admin")
        if not verify_password(body.password, user["password_hash"]):
            raise HTTPException(401, "Invalid credentials")
        
    # Skip MPIN for Admin
    if user["role"] == "admin":
        token = create_token(user["id"], user["role"])
        response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
        await write_audit(user["id"], "login", request=request)
        return {"status": "success", "token": token, "user": clean(user)}
        
    # Non-admin: Require MPIN (Existing users without MPIN will go to setup-mpin)
    pre_auth_token = create_pre_auth_token(user["id"], user["role"])
    if not user.get("mpin_hash"):
        return {"status": "setup_mpin_required", "pre_auth_token": pre_auth_token}
    else:
        return {"status": "mpin_required", "pre_auth_token": pre_auth_token}

@api.post("/auth/verify-mpin")
async def verify_mpin(body: MpinVerifyIn, response: Response, request: Request):
    pre_auth = verify_pre_auth_token(body.pre_auth_token)
    user = await db.users.find_one({"id": pre_auth["user_id"]})
    if not user:
        raise HTTPException(401, "User not found")
        
    mpin_hash = user.get("mpin_hash")
    if not mpin_hash:
        raise HTTPException(400, "MPIN is not set up yet. Please set up your MPIN first.")
        
    if not verify_password(body.mpin, mpin_hash):
        raise HTTPException(401, "Invalid MPIN")
        
    token = create_token(user["id"], user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    await write_audit(user["id"], "login", request=request)
    return {"status": "success", "token": token, "user": clean(user)}

@api.post("/auth/setup-mpin")
async def setup_mpin(body: MpinSetupIn, response: Response, request: Request):
    pre_auth = verify_pre_auth_token(body.pre_auth_token)
    user = await db.users.find_one({"id": pre_auth["user_id"]})
    if not user:
        raise HTTPException(401, "User not found")
        
    if user.get("mpin_hash"):
        raise HTTPException(400, "MPIN is already set up for this account.")
        
    if not body.mpin.isdigit() or len(body.mpin) != 6:
        raise HTTPException(400, "MPIN must be exactly 6 digits")
        
    hashed = hash_password(body.mpin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"mpin_hash": hashed}}
    )
    
    await write_audit(user["id"], "setup_mpin", request=request)
    
    token = create_token(user["id"], user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    return {"status": "success", "token": token, "user": clean(user)}

@api.post("/auth/change-mpin")
async def change_mpin(body: MpinChangeIn, user=Depends(require_roles("agent", "distributor", "master_distributor")), request: Request = None):
    mpin_hash = user.get("mpin_hash")
    if mpin_hash:
        if not verify_password(body.current_mpin, mpin_hash):
            raise HTTPException(400, "Incorrect current MPIN")
            
    if not body.new_mpin.isdigit() or len(body.new_mpin) != 6:
        raise HTTPException(400, "New MPIN must be exactly 6 digits")
        
    hashed = hash_password(body.new_mpin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"mpin_hash": hashed}}
    )
    
    if request:
        await write_audit(user["id"], "change_mpin", request=request)
    return {"ok": True}

@api.post("/auth/setup-tpin")
async def setup_tpin(body: TpinSetupIn, user=Depends(require_roles("agent", "distributor", "master_distributor")), request: Request = None):
    tpin_hash = user.get("tpin_hash")
    if tpin_hash:
        raise HTTPException(400, "TPIN is already set up.")
        
    if not body.tpin.isdigit() or len(body.tpin) != 4:
        raise HTTPException(400, "TPIN must be exactly 4 digits")
        
    hashed = hash_password(body.tpin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"tpin_hash": hashed}}
    )
    
    if request:
        await write_audit(user["id"], "setup_tpin", request=request)
    return {"ok": True}

@api.post("/auth/change-tpin")
async def change_tpin(body: TpinChangeIn, user=Depends(require_roles("agent", "distributor", "master_distributor")), request: Request = None):
    tpin_hash = user.get("tpin_hash")
    if tpin_hash:
        if not verify_password(body.current_tpin, tpin_hash):
            raise HTTPException(400, "Incorrect current TPIN")
            
    if not body.new_tpin.isdigit() or len(body.new_tpin) != 4:
        raise HTTPException(400, "New TPIN must be exactly 4 digits")
        
    hashed = hash_password(body.new_tpin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"tpin_hash": hashed}}
    )
    
    if request:
        await write_audit(user["id"], "change_tpin", request=request)
    return {"ok": True}

@api.post("/auth/reset-tpin")
async def reset_tpin(body: TpinResetIn, user=Depends(require_roles("agent", "distributor", "master_distributor", "admin")), request: Request = None):
    # Verify account password
    user_db = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1})
    if not user_db or not user_db.get("password_hash") or not verify_password(body.password, user_db["password_hash"]):
        raise HTTPException(400, "Incorrect account password")

    if not body.new_tpin.isdigit() or len(body.new_tpin) != 4:
        raise HTTPException(400, "New TPIN must be exactly 4 digits")

    hashed = hash_password(body.new_tpin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"tpin_hash": hashed}}
    )

    if request:
        await write_audit(user["id"], "reset_tpin", request=request)
    return {"ok": True}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/agent/change-first-password")
async def change_first_password(body: ChangeFirstPasswordIn, user=Depends(require_roles("agent", "distributor", "master_distributor"))):
    if not user.get("first_login", True):
        raise HTTPException(400, "Password already changed")
    hashed = hash_password(body.password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hashed, "first_login": False, "password_changed_at": now_iso()}}
    )
    return {"ok": True}

@api.post("/agent/submit-kyc")
async def submit_kyc(body: SubmitKycIn, user=Depends(require_roles("agent", "distributor", "master_distributor"))):
    if user.get("kyc_status") == "approved":
        raise HTTPException(400, "KYC is already approved")
        
    upd = {
        "aadhaar_path": body.aadhaar_path,
        "aadhaar_back_path": body.aadhaar_back_path,
        "pan_path": body.pan_path,
        "pan_back_path": "",
        "selfie_path": body.selfie_path,
        "cheque_path": body.cheque_path,
        "firm_front_path": body.firm_front_path,
        "kyc_status": "pending",
        "kyc_rejection_reason": ""
    }
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    
    kyc_upd = {
        "aadhaar_path": body.aadhaar_path,
        "aadhaar_back_path": body.aadhaar_back_path,
        "pan_path": body.pan_path,
        "pan_back_path": "",
        "selfie_path": body.selfie_path,
        "cheque_path": body.cheque_path,
        "firm_front_path": body.firm_front_path,
        "status": "pending",
        "rejection_reason": "",
        "updated_at": now_iso()
    }
    await db.kyc.update_one({"user_id": user["id"]}, {"$set": kyc_upd})
    await manager.send_to_role("admin", {"event": "kyc_submitted", "data": {"user_id": user["id"]}})
    return {"ok": True, "kyc_status": "pending"}

@api.post("/agent/dismiss-welcome")
async def dismiss_welcome(user=Depends(require_roles("agent", "distributor", "master_distributor"))):
    await db.users.update_one({"id": user["id"]}, {"$set": {"welcome_shown": True}})
    return {"ok": True}

@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, request: Request, user: dict = Depends(get_current_user)):
    # ---- Rate limit: max 5 attempts per user per hour ----
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.audit_logs.count_documents({
        "user_id": user["id"],
        "action": "password_change",
        "created_at": {"$gte": one_hour_ago},
    })
    if recent >= 5:
        await write_audit(user["id"], "password_change", target=user["id"],
                          meta={"status": "FAILED", "reason": "rate_limited", "role": user["role"]}, request=request)
        raise HTTPException(429, "Too many attempts. Try again later.")

    # Re-fetch with password_hash since get_current_user strips it
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user:
        raise HTTPException(404, "User not found")

    # ---- STEP 1: validate current password ----
    if not verify_password(body.current_password, db_user["password_hash"]):
        await write_audit(user["id"], "password_change", target=user["id"],
                          meta={"status": "FAILED", "reason": "wrong_current_password", "role": user["role"]}, request=request)
        raise HTTPException(400, "Current password is incorrect")

    # ---- STEP 2: validate new password ----
    if not body.new_password or len(body.new_password) < 8:
        await write_audit(user["id"], "password_change", target=user["id"],
                          meta={"status": "FAILED", "reason": "new_password_too_short", "role": user["role"]}, request=request)
        raise HTTPException(400, "New password must be at least 8 characters long")

    if verify_password(body.new_password, db_user["password_hash"]):
        await write_audit(user["id"], "password_change", target=user["id"],
                          meta={"status": "FAILED", "reason": "same_as_current", "role": user["role"]}, request=request)
        raise HTTPException(400, "New password must be different from current password")

    # ---- STEP 3: confirm password match ----
    if body.new_password != body.confirm_password:
        await write_audit(user["id"], "password_change", target=user["id"],
                          meta={"status": "FAILED", "reason": "confirm_mismatch", "role": user["role"]}, request=request)
        raise HTTPException(400, "Passwords do not match")

    # ---- STEP 4: update password ----
    new_hash = hash_password(body.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": new_hash, "password_changed_at": now_iso()}})
    
    if user.get("role") == "admin":
        try:
            await db.admin_credentials.update_one(
                {"email": db_user["email"].lower()},
                {"$set": {"password_hash": new_hash, "password": body.new_password}}
            )
        except Exception as e:
            logger.error(f"Failed to sync changed admin password to admin_credentials: {e}")
            
    await write_audit(user["id"], "password_change", target=user["id"],
                      meta={"status": "SUCCESS", "role": user["role"]}, request=request)
    return {"ok": True, "message": "Password updated successfully"}


# ---------- FORGOT PASSWORD (RESEND API & EMAIL OTP) ----------
RESEND_API_KEY_FALLBACK = "re_LqEavpuG_DBW7jgKMukxiEyePu9C2eYdF"

async def send_otp_email(to_email: str, otp: str):
    resend_key = os.environ.get("RESEND_API_KEY") or RESEND_API_KEY_FALLBACK
    if not resend_key:
        raise HTTPException(500, "Resend API Key is missing")

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {resend_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "from": "onboarding@resend.dev",
        "to": [to_email],
        "subject": "Password Reset OTP - MAK FIN PAY",
        "html": f"""
        <div style="background-color: #07080a; padding: 40px 10px; font-family: 'Segoe UI', Arial, sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background: #0b0d13; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                
                <!-- Header Banner -->
                <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #10b981 100%); padding: 30px 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">MAK FIN PAY</h1>
                    <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 6px 0 0 0; font-weight: 500;">Secure Financial Payment Network</p>
                </div>

                <!-- Body Content -->
                <div style="padding: 32px 24px; text-align: center;">
                    <div style="display: inline-block; padding: 6px 16px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 20px; color: #818cf8; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
                        🔒 PASSWORD RESET REQUEST
                    </div>
                    
                    <h2 style="color: #f8fafc; font-size: 20px; margin: 0 0 10px 0; font-weight: 700;">Verification Code</h2>
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5;">
                        Use the following 6-digit One-Time Password (OTP) to reset your account password:
                    </p>

                    <!-- OTP Display Card -->
                    <div style="background: #151824; border: 1px dashed #6366f1; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <div style="font-size: 40px; font-weight: 800; letter-spacing: 10px; color: #38bdf8; font-family: 'Courier New', monospace;">
                            {otp}
                        </div>
                        <p style="color: #f59e0b; font-size: 12px; font-weight: 600; margin: 12px 0 0 0;">
                            ⏱️ Code expires in 10 minutes
                        </p>
                    </div>

                    <p style="color: #64748b; font-size: 13px; text-align: left; line-height: 1.6; background: rgba(255,255,255,0.02); padding: 12px 16px; border-radius: 8px; border-left: 3px solid #f59e0b; margin-bottom: 24px;">
                        <strong style="color: #cbd5e1;">Security Notice:</strong> If you did not request this OTP, please ignore this email or contact support immediately. Never share your OTP with anyone.
                    </p>
                </div>

                <!-- Footer -->
                <div style="background: #07080a; padding: 16px 20px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
                    <p style="color: #64748b; font-size: 11px; margin: 0; font-weight: 500;">
                        &copy; 2026 MAK FIN PAY. All Rights Reserved.
                    </p>
                </div>
            </div>
        </div>
        """
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code not in (200, 201):
                err_data = res.json() if res.content else {}
                err_msg = err_data.get("message") or err_data.get("name") or res.text
                logger.error(f"Resend email API error ({res.status_code}): {err_msg}")
                raise HTTPException(400, f"Email delivery failed: {err_msg}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resend email exception: {e}")
        raise HTTPException(500, f"Email delivery error: {str(e)}")


@api.post("/auth/forgot-password/request")
async def forgot_password_request(body: ForgotPasswordRequestIn, request: Request):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(400, "Email address is required")
        
    user = await db.users.find_one({"email": email})
    admin_cred = None
    if not user:
        admin_cred = await db.admin_credentials.find_one({"email": email})
        if not admin_cred:
            raise HTTPException(404, "No account found with this email address")

    # Generate 6-digit OTP
    otp = f"{secrets.randbelow(900000) + 100000}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    
    reset_doc = {
        "id": new_id(),
        "email": email,
        "otp": otp,
        "expires_at": expires_at,
        "used": False,
        "created_at": now_iso()
    }
    await db.password_resets.insert_one(reset_doc)
    
    # Direct Resend API Email dispatch
    await send_otp_email(email, otp)
    
    user_id = user["id"] if user else (admin_cred["id"] if admin_cred else email)
    await write_audit(user_id, "forgot_password_request", target=email, meta={"status": "SUCCESS"}, request=request)
    return {"status": "success", "message": "OTP has been sent to your registered email address."}


@api.post("/auth/forgot-password/reset")
async def forgot_password_reset(body: ForgotPasswordResetIn, request: Request):
    email = body.email.strip().lower()
    otp = body.otp.strip()
    new_password = body.new_password
    confirm_password = body.confirm_password
    
    if not email or not otp:
        raise HTTPException(400, "Email and OTP are required")
        
    if new_password != confirm_password:
        raise HTTPException(400, "Passwords do not match")
        
    if not new_password or len(new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters long")
        
    # Verify active OTP
    reset_record = await db.password_resets.find_one({
        "email": email,
        "otp": otp,
        "used": False
    })
    
    if not reset_record:
        raise HTTPException(400, "Invalid or already used OTP. Please request a new code.")
        
    exp = reset_record.get("expires_at")
    if isinstance(exp, str):
        exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
    elif isinstance(exp, datetime):
        exp_dt = exp
    else:
        exp_dt = datetime.now(timezone.utc)
        
    if exp_dt.tzinfo is None:
        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        
    if datetime.now(timezone.utc) > exp_dt:
        raise HTTPException(400, "OTP has expired. Please request a new code.")
        
    new_pw_hash = hash_password(new_password)
    
    # Update in db.users
    user = await db.users.find_one({"email": email})
    if user:
        await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": new_pw_hash, "password_changed_at": now_iso()}})
        
    # Sync with db.admin_credentials if admin
    admin_cred = await db.admin_credentials.find_one({"email": email})
    if admin_cred:
        await db.admin_credentials.update_one({"email": email}, {"$set": {"password_hash": new_pw_hash, "password": new_password}})
        
    if not user and not admin_cred:
        raise HTTPException(404, "User account not found")
        
    # Mark OTP as used
    await db.password_resets.update_one({"id": reset_record["id"]}, {"$set": {"used": True}})
    
    user_id = user["id"] if user else (admin_cred["id"] if admin_cred else email)
    await write_audit(user_id, "forgot_password_reset", target=email, meta={"status": "SUCCESS"}, request=request)
    return {"status": "success", "message": "Password reset successful! You can now log in with your new password."}


# ---------- UPLOADS ----------
@api.post("/uploads")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    path = f"{APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, data, content_type)
    await db.files.insert_one({
        "id": new_id(),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": now_iso(),
    })
    return {"path": result["path"], "size": result.get("size", len(data))}

@api.get("/files/{path:path}")
async def serve_file(path: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None), thumbnail: Optional[bool] = Query(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    is_branding = False
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    audio_paths = [
        s.get("qr_approved_audio"), s.get("qr_rejected_audio"),
        s.get("cc_bill_approved_audio"), s.get("cc_bill_rejected_audio"),
        s.get("qr_request_received_audio"), s.get("cc_bill_request_received_audio")
    ]
    branding_paths = [s.get("logo_path"), s.get("favicon_path"), s.get("logo_collapsed_path"), s.get("watermark_path")] + [p for p in audio_paths if p]
    if path and path in branding_paths:
        is_branding = True

    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    is_public_media = ext in ["jpg", "jpeg", "png", "webp", "jfif", "gif", "mp3", "wav", "ogg", "m4a", "aac"]

    if not is_branding and not is_public_media:
        if not token:
            raise HTTPException(401, "Auth required")
        try:
            jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_aud": False})
        except Exception:
            raise HTTPException(401, "Invalid token")
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0}) or {}
    content_type = rec.get("content_type")
    
    try:
        if thumbnail and content_type and content_type.startswith("image/"):
            data, ct = get_object_thumbnail(path)
        else:
            data, ct = get_object(path)
    except Exception as e:
        logger.error(f"serve_file failed for path {path}: {e}")
        raise HTTPException(404, "File content not found")
        
    return FastResponse(content=data, media_type=content_type or ct or "image/jpeg")

# ---------- LEDGER + WALLET HELPERS ----------
async def get_or_create_wallet(user_id: str) -> dict:
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    if not w:
        w = {
            "id": new_id(),
            "user_id": user_id,
            "balance": 0.0,
            "t1_balance": 0.0,
            "hold_balance": 0.0,
            "hold_active": False,
            "created_at": now_iso()
        }
        await db.wallets.insert_one(dict(w))
    if "t1_balance" not in w:
        w["t1_balance"] = 0.0
    if "hold_balance" not in w:
        w["hold_balance"] = 0.0
    if "hold_active" not in w:
        w["hold_active"] = False
    return w

async def ledger_entry(user_id: str, kind: str, amount: float, balance_after: float, ref_type: str = "", ref_id: str = "", note: str = ""):
    await db.ledger.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "kind": kind,  # credit | debit | refund | adjustment
        "amount": amount,
        "balance_after": balance_after,
        "ref_type": ref_type,
        "ref_id": ref_id,
        "note": note,
        "created_at": now_iso(),
    })

async def log_admin_profit(type_str: str, amount: float, ref_type: str = "", ref_id: str = "", note: str = ""):
    # Find last entry to calculate balance_after
    last = await db.admin_profit_ledger.find({}, {"_id": 0}).sort("created_at", -1).to_list(1)
    last_bal = float(last[0]["balance_after"]) if last else 0.0
    change = float(amount) if type_str == "credit" else -float(amount)
    new_bal = round(last_bal + change, 2)
    
    await db.admin_profit_ledger.insert_one({
        "id": new_id(),
        "type": type_str,
        "amount": round(float(amount), 2),
        "balance_after": new_bal,
        "ref_type": ref_type,
        "ref_id": ref_id,
        "note": note,
        "created_at": now_iso()
    })

async def log_admin_cashbook(type_str: str, amount: float, ref_type: str = "", ref_id: str = "", note: str = ""):
    last = await db.admin_cashbook.find({}, {"_id": 0}).sort("created_at", -1).to_list(1)
    last_bal = float(last[0]["balance_after"]) if last else 0.0
    change = float(amount) if type_str == "credit" else -float(amount)
    new_bal = round(last_bal + change, 2)
    
    await db.admin_cashbook.insert_one({
        "id": new_id(),
        "type": type_str,
        "amount": round(float(amount), 2),
        "balance_after": new_bal,
        "ref_type": ref_type,
        "ref_id": ref_id,
        "note": note,
        "created_at": now_iso()
    })

async def adjust_balance(user_id: str, delta: float) -> float:
    await get_or_create_wallet(user_id)
    u = await db.users.find_one({"id": user_id})
    role = u.get("role") if u else "agent"
    
    if role == "agent":
        res = await db.execute_query(
            "UPDATE wallets SET balance = balance + $1, updated_at = $2 WHERE user_id = $3 AND balance + $1 >= 0 RETURNING balance",
            [delta, now_iso(), user_id]
        )
        if not res or len(res) == 0:
            raise HTTPException(400, "Insufficient wallet balance")
        return float(res[0]["balance"])
    else:
        res = await db.execute_query(
            "UPDATE wallets SET balance = GREATEST(balance + $1, 0.0), updated_at = $2 WHERE user_id = $3 RETURNING balance",
            [delta, now_iso(), user_id]
        )
        if not res or len(res) == 0:
            raise HTTPException(400, "Insufficient wallet balance")
        return float(res[0]["balance"])

async def adjust_t1_balance(user_id: str, delta: float) -> float:
    await get_or_create_wallet(user_id)
    res = await db.execute_query(
        "UPDATE wallets SET t1_balance = t1_balance + $1, updated_at = $2 WHERE user_id = $3 AND t1_balance + $1 >= 0 RETURNING t1_balance",
        [delta, now_iso(), user_id]
    )
    if not res or len(res) == 0:
        raise HTTPException(400, "Insufficient T+1 balance")
    return float(res[0]["t1_balance"])

# ---------- ADMIN: USERS ----------
@dataclass
class CommissionAllocation:
    """Bundle of commission fields applied when creating a distributor/agent/master_distributor.

    New 3-way split fields (canonical):
        admin_pct: Admin's cut for downline recharges of this user.
        md_pct:    Master Distributor's cut (0 if user is not under an MD).
        dist_pct:  Distributor's cut (0 if user is a distributor / MD / has no distributor parent).

    Legacy fields (backwards-compat with existing snapshot readers):
        base:   base_commission — the direct parent's rate at creation time (= admin_pct + md_pct).
        markup: markup_commission — the markup that goes to the direct parent (= dist_pct for
                distributor-created agent, = md_pct for md-created distributor/direct-agent,
                = 0 for admin-created).
        total:  admin_pct + md_pct + dist_pct — same as `commission_percent`.
        percent: legacy alias of total.
        type:   "default" | "custom"
    """
    percent: float
    base: float
    markup: float
    total: float
    admin_pct: float = 0.0
    md_pct: float = 0.0
    dist_pct: float = 0.0
    type: str = "default"


async def _default_commission_pct() -> float:
    settings = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {"default_percent": 1.2}
    return float(settings.get("default_percent", 1.2))


class CreateAdminIn(BaseModel):
    full_name: str
    email: str
    password: str
    permissions: List[str] = []
    frozen: bool = False

class UpdateAdminIn(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    permissions: Optional[List[str]] = None
    frozen: Optional[bool] = None

# ---------- ADMIN MANAGEMENT ----------

def is_super_admin(user: dict) -> bool:
    if not user or not isinstance(user, dict):
        return False
    return user.get("email", "").lower() == "jigs.vanani@gmail.com"

def check_admin_permission(user: dict, permission_key: str) -> bool:
    if user.get("role") != "admin":
        return False
    if is_super_admin(user):
        return True
    
    permissions = user.get("permissions")
    # By default, if permissions are None/uninitialized, grant full access
    if permissions is None:
        return True
        
    return permission_key in permissions

def can_manage_admins(user: dict) -> bool:
    return is_super_admin(user) or check_admin_permission(user, "admins")

@api.get("/admin/admins")
async def list_admins(user=Depends(require_roles("admin"))):
    if not can_manage_admins(user):
        raise HTTPException(403, "Access denied: You do not have permission to manage administrators.")
        
    SUPER_EMAIL = "jigs.vanani@gmail.com"
    creds = await db.admin_credentials.find({"email": {"$ne": SUPER_EMAIL}}).to_list(100)
    
    # Bulk fetch users to avoid sequential database queries inside the loop
    emails = [c["email"].lower() for c in creds if c.get("email")]
    users_dict = {}
    if emails:
        users_list = await db.users.find({"email": {"$in": emails}}).to_list(len(emails))
        users_dict = {u["email"].lower(): u for u in users_list if u.get("email")}
        
    admins = []
    for c in creds:
        email_lower = c.get("email", "").lower()
        u = users_dict.get(email_lower)
        admins.append({
            "id": c.get("id"),
            "email": c.get("email"),
            "full_name": u.get("full_name") if u else "Admin User",
            "permissions": c.get("permissions") or [],
            "frozen": bool(c.get("frozen", False)),
            "created_at": c.get("created_at")
        })
    return admins

@api.post("/admin/admins")
async def create_admin(body: CreateAdminIn, user=Depends(require_roles("admin"))):
    if not can_manage_admins(user):
        raise HTTPException(403, "Access denied: You do not have permission to manage administrators.")

    # Enforce permission subset rule: A sub-admin can only grant permissions that they themselves possess
    if not is_super_admin(user):
        caller_perms = set(user.get("permissions") or [])
        invalid_perms = [p for p in body.permissions if p not in caller_perms]
        if invalid_perms:
            raise HTTPException(400, f"Cannot grant permissions you do not possess: {', '.join(invalid_perms)}")

    email = body.email.lower().strip()
    SUPER_EMAIL = "jigs.vanani@gmail.com"
    if email == SUPER_EMAIL:
        raise HTTPException(400, "Cannot create this email account.")
        
    # Execute checks in parallel
    existing_cred_task = db.admin_credentials.find_one({"email": email})
    existing_user_task = db.users.find_one({"email": email})
    existing_cred, existing_user = await asyncio.gather(existing_cred_task, existing_user_task)
    
    if existing_cred:
        raise HTTPException(400, "Admin email already exists.")
    if existing_user:
        raise HTTPException(400, "Email already used by another user account.")

    admin_id = new_id()
    pw_hash = hash_password(body.password)
    
    new_cred = {
        "id": admin_id,
        "email": email,
        "password": body.password,
        "password_hash": pw_hash,
        "permissions": body.permissions,
        "frozen": body.frozen,
        "created_at": now_iso()
    }
    
    new_user = {
        "id": admin_id,
        "role": "admin",
        "full_name": body.full_name,
        "email": email,
        "password_hash": pw_hash,
        "phone": "",
        "address": "",
        "frozen": body.frozen,
        "is_deleted": False,
        "created_at": now_iso(),
        "permissions": body.permissions
    }
    
    # Execute inserts in parallel
    await asyncio.gather(
        db.admin_credentials.insert_one(new_cred),
        db.users.insert_one(new_user)
    )
    
    return {"status": "success", "message": "Admin user created successfully", "id": admin_id}

@api.put("/admin/admins/{admin_id}")
async def update_admin(admin_id: str, body: UpdateAdminIn, user=Depends(require_roles("admin"))):
    if not can_manage_admins(user):
        raise HTTPException(403, "Access denied: You do not have permission to manage administrators.")

    # Enforce permission subset rule: A sub-admin can only grant permissions that they themselves possess
    if not is_super_admin(user) and body.permissions is not None:
        caller_perms = set(user.get("permissions") or [])
        invalid_perms = [p for p in body.permissions if p not in caller_perms]
        if invalid_perms:
            raise HTTPException(400, f"Cannot grant permissions you do not possess: {', '.join(invalid_perms)}")
        
    SUPER_EMAIL = "jigs.vanani@gmail.com"
    cred = await db.admin_credentials.find_one({"id": admin_id})
    if not cred:
        raise HTTPException(404, "Admin not found.")
        
    if cred["email"].lower() == SUPER_EMAIL:
        raise HTTPException(403, "Cannot modify Super Admin account.")

    email = cred["email"].lower()
    cred_updates = {}
    user_updates = {}
    
    if body.full_name is not None:
        user_updates["full_name"] = body.full_name
        
    if body.password is not None and body.password.strip():
        pw_hash = hash_password(body.password)
        cred_updates["password"] = body.password
        cred_updates["password_hash"] = pw_hash
        user_updates["password_hash"] = pw_hash
        
    if body.permissions is not None:
        cred_updates["permissions"] = body.permissions
        user_updates["permissions"] = body.permissions
        
    if body.frozen is not None:
        cred_updates["frozen"] = body.frozen
        user_updates["frozen"] = body.frozen
        
    # Execute updates in parallel
    tasks = []
    if cred_updates:
        tasks.append(db.admin_credentials.update_one({"id": admin_id}, {"$set": cred_updates}))
    if user_updates:
        # Match by email to keep tables synced even if ID is different
        tasks.append(db.users.update_one({"email": email}, {"$set": user_updates}))
        
    if tasks:
        await asyncio.gather(*tasks)
        
    return {"status": "success", "message": "Admin user updated successfully"}

@api.delete("/admin/admins/{admin_id}")
async def delete_admin(admin_id: str, user=Depends(require_roles("admin"))):
    SUPER_EMAIL = "jigs.vanani@gmail.com"
    if user["email"].lower() != SUPER_EMAIL:
        raise HTTPException(403, "Only the Super Admin jigs.vanani@gmail.com can delete administrator accounts.")
        
    cred = await db.admin_credentials.find_one({"id": admin_id})
    if not cred:
        raise HTTPException(404, "Admin not found.")
        
    if cred["email"].lower() == SUPER_EMAIL:
        raise HTTPException(403, "Cannot delete Super Admin account.")
        
    email = cred["email"].lower()
    
    # Execute deletes in parallel
    await asyncio.gather(
        db.admin_credentials.delete_one({"id": admin_id}),
        db.users.delete_one({"email": email})
    )
    
    return {"status": "success", "message": "Admin user deleted successfully"}


@api.post("/admin/users")
async def admin_create_user(body: CreateUserIn, user=Depends(require_roles("admin"))):
    default_pct = await _default_commission_pct()
    # Admin-created MD: commission_percent (if supplied) overrides default; markup fields all 0.
    if body.role == "master_distributor":
        rate = float(body.commission_percent) if body.commission_percent is not None else default_pct
        if rate < 0:
            raise HTTPException(400, "Commission cannot be negative")
        alloc_type = "custom" if body.commission_percent is not None else "default"
        alloc = CommissionAllocation(
            percent=rate, base=rate, markup=0.0, total=rate,
            admin_pct=rate, md_pct=0.0, dist_pct=0.0, type=alloc_type,
        )
        return await create_subuser(body, parent_id=None, by=user["id"], alloc=alloc,
                                    created_by_role="admin", md_id=None)
    rate = float(body.commission_percent) if body.commission_percent is not None else default_pct
    if rate < 0:
        raise HTTPException(400, "Commission cannot be negative")
    alloc_type = "custom" if body.commission_percent is not None else "default"
    alloc = CommissionAllocation(
        percent=rate, base=rate, markup=0.0, total=rate,
        admin_pct=rate, md_pct=0.0, dist_pct=0.0, type=alloc_type,
    )
    return await create_subuser(body, parent_id=None, by=user["id"], alloc=alloc,
                                created_by_role="admin", md_id=None)


@api.post("/master-distributor/users")
async def md_create_subuser(body: CreateUserIn, user=Depends(require_approved_md())):
    if body.role not in ("distributor", "agent"):
        raise HTTPException(400, "Master Distributor can only create distributors or agents")
    md_markup = float(body.commission_percent) if body.commission_percent is not None else 0.0
    if md_markup < 0:
        raise HTTPException(400, "Markup cannot be negative")
    md_rate = float(user.get("commission_percent") or 0.0)
    if body.role == "distributor":
        # Distributor under MD: admin_pct=md_rate, md_pct=md_markup, dist_pct=0.
        total = round(md_rate + md_markup, 4)
        alloc = CommissionAllocation(
            percent=total, base=md_rate, markup=md_markup, total=total,
            admin_pct=md_rate, md_pct=md_markup, dist_pct=0.0, type="custom",
        )
        return await create_subuser(body, parent_id=user["id"], by=user["id"], alloc=alloc,
                                    created_by_role="master_distributor", md_id=user["id"])
    # Direct agent under MD: admin_pct=md_rate, md_pct=md_markup, dist_pct=0.
    total = round(md_rate + md_markup, 4)
    alloc = CommissionAllocation(
        percent=total, base=md_rate, markup=md_markup, total=total,
        admin_pct=md_rate, md_pct=md_markup, dist_pct=0.0, type="custom",
    )
    return await create_subuser(body, parent_id=user["id"], by=user["id"], alloc=alloc,
                                created_by_role="master_distributor", md_id=user["id"])


@api.post("/distributor/agents")
async def distributor_create_agent(body: CreateUserIn, user=Depends(require_approved_distributor())):
    if body.role != "agent":
        raise HTTPException(400, "Distributor can only create agents")
    dist_markup = float(body.commission_percent) if body.commission_percent is not None else 0.0
    if dist_markup < 0:
        raise HTTPException(400, "Markup cannot be negative")
    # Inherit distributor's own admin_pct + md_pct as the agent's admin+md portion.
    d_admin_pct = float(user.get("admin_pct", user.get("base_commission", 0.0)) or 0.0)
    d_md_pct = float(user.get("md_pct", 0.0) or 0.0)
    md_id = user.get("md_id")  # inherit MD chain if any
    base = round(d_admin_pct + d_md_pct, 4)  # distributor's own rate (= what goes to admin + MD)
    total = round(base + dist_markup, 4)
    alloc = CommissionAllocation(
        percent=total, base=base, markup=dist_markup, total=total,
        admin_pct=d_admin_pct, md_pct=d_md_pct, dist_pct=dist_markup, type="custom",
    )
    return await create_subuser(body, parent_id=user["id"], by=user["id"], alloc=alloc,
                                created_by_role="distributor", md_id=md_id)


async def create_subuser(
    body: CreateUserIn,
    parent_id: Optional[str],
    by: str,
    alloc: Optional[CommissionAllocation] = None,
    created_by_role: str = "admin",
    md_id: Optional[str] = None,
) -> dict:
    email = body.email.lower().strip()
    phone = (body.phone or "").strip()
    full_name = (body.full_name or "").strip()

    if await db.users.find_one({"email": email, "is_deleted": {"$ne": True}}):
        raise HTTPException(400, "Email already exists")
    if phone and await db.users.find_one({"phone": phone, "is_deleted": {"$ne": True}}):
        raise HTTPException(400, "Mobile number already exists")
    if full_name:
        existing_name = await db.users.find_one({"full_name": {"$regex": full_name, "$options": "i"}, "is_deleted": {"$ne": True}})
        if existing_name and existing_name.get("full_name", "").strip().lower() == full_name.lower():
            raise HTTPException(400, "User with this name already exists")
    if alloc is None:
        default_pct = await _default_commission_pct()
        alloc = CommissionAllocation(
            percent=default_pct, base=default_pct, markup=0.0,
            total=default_pct, type="default",
        )
    
    raw_password = body.password
    if not raw_password:
        raw_password = secrets.token_urlsafe(8)  # Generates a secure random 11-character password

    kyc_status = "not_submitted" if body.role in ("agent", "distributor", "master_distributor") else "approved"
    doc = {
        "id": new_id(),
        "role": body.role,
        "full_name": body.full_name,
        "email": email,
        "password_hash": hash_password(raw_password),
        "phone": body.phone,
        "address": body.address,
        "firm_name": body.firm_name or "",
        "firm_address": body.firm_address or "",
        "first_login": True,
        "welcome_shown": False,
        "aadhaar_path": body.aadhaar_path or "",
        "pan_path": body.pan_path or "",
        "aadhaar_back_path": "",
        "pan_back_path": "",
        "selfie_path": body.selfie_path or "",
        "cheque_path": "",
        "firm_front_path": "",
        "kyc_status": kyc_status,
        "kyc_rejection_reason": "",
        "kyc_reviewed_at": None,
        "kyc_reviewed_by": None,
        "parent_id": parent_id,
        "md_id": md_id,
        "commission_percent": alloc.total,
        "base_commission": alloc.base,
        "markup_commission": alloc.markup,
        "total_commission": alloc.total,
        "admin_pct": alloc.admin_pct,
        "md_pct": alloc.md_pct,
        "dist_pct": alloc.dist_pct,
        "commission_type": alloc.type,
        "t1_commission_percent": float(body.t1_commission_percent) if (body.role == "agent" and body.t1_commission_percent is not None) else 0.0,
        "t1_admin_pct": float(body.t1_commission_percent) if (body.role == "agent" and body.t1_commission_percent is not None) else 0.0,
        "t1_md_pct": 0.0,
        "t1_dist_pct": 0.0,
        "t1_enabled": bool(body.t1_enabled) if (body.role == "agent" and body.t1_enabled is not None) else False,
        "created_by_role": created_by_role,
        "created_by_id": by,
        "frozen": False,
        "is_deleted": False,
        "is_tester": bool(getattr(body, "is_tester", False)) if getattr(body, "is_tester", None) is not None else False,
        "created_at": now_iso(),
        "created_by": by,
    }
    await db.users.insert_one(dict(doc))
    await get_or_create_wallet(doc["id"])
    
    if body.role in ("agent", "distributor", "master_distributor"):
        await db.kyc.update_one(
            {"user_id": doc["id"]},
            {"$set": {
                "user_id": doc["id"],
                "aadhaar_path": "",
                "pan_path": "",
                "aadhaar_back_path": "",
                "pan_back_path": "",
                "selfie_path": "",
                "cheque_path": "",
                "firm_front_path": "",
                "status": "not_submitted",
                "rejection_reason": "",
                "updated_at": now_iso(),
                "reviewed_at": None,
                "reviewed_by": None,
            }},
            upsert=True,
        )
    await write_audit(by, f"create_{body.role}", target=doc["id"])
    ret = clean(doc)
    ret["password"] = raw_password
    return ret

async def _build_parent_name_map(parent_ids: List[str]) -> dict:
    if not parent_ids:
        return {}
    pm = {}
    async for p in db.users.find({"id": {"$in": parent_ids}}, {"_id": 0, "id": 1, "full_name": 1}):
        pm[p["id"]] = p.get("full_name", "")
    return pm


async def _withdrawals_sum_for(user_id: str, statuses: List[str]) -> float:
    """Sum of withdrawal amounts for a single user in the given statuses."""
    agg = await db.withdrawals.aggregate([
        {"$match": {"user_id": user_id, "status": {"$in": statuses}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    return round(agg[0]["total"], 2) if agg else 0.0


async def _withdrawals_sum_batch(user_ids: List[str], statuses: List[str]) -> dict:
    """Batch sum withdrawals by user_id for the given statuses → {user_id: total}."""
    if not user_ids:
        return {}
    cursor = db.withdrawals.aggregate([
        {"$match": {"user_id": {"$in": user_ids}, "status": {"$in": statuses}}},
        {"$group": {"_id": "$user_id", "total": {"$sum": "$amount"}}},
    ])
    out: dict = {}
    async for row in cursor:
        out[row["_id"]] = round(row.get("total") or 0, 2)
    return out


async def _distributor_lifetime_earnings(dist_id: str) -> float:
    """Lifetime IMMUTABLE earnings for a distributor (recharge earnings + admin manual adjustments)."""
    agg = await db.recharges.aggregate([
        {"$match": {"status": "approved", "distributor_id": dist_id}},
        {"$group": {"_id": None, "total": {"$sum": "$distributor_earnings_amount"}}},
    ]).to_list(1)
    recharge_earnings = round(agg[0]["total"], 2) if agg else 0.0
    adj = await _admin_adjustments_sum_for(dist_id)
    return round(recharge_earnings + adj, 2)


async def _admin_adjustments_sum_batch(user_ids: List[str]) -> dict:
    if not user_ids:
        return {}
    str_uids = [str(u) for u in user_ids]
    out = {uid: 0.0 for uid in str_uids}
    try:
        in_clause = ", ".join(f"'{u}'" for u in str_uids)
        sql = f"""
            SELECT user_id,
                   SUM(CASE WHEN kind = 'credit' THEN amount WHEN kind = 'debit' THEN -amount ELSE 0 END) as total
            FROM ledger
            WHERE user_id IN ({in_clause}) AND ref_type IN ('admin_adjustment', 'fund_transfer')
            GROUP BY user_id
        """
        rows = await db.execute_query(sql)
        if isinstance(rows, list):
            for r in rows:
                uid = str(r.get("user_id"))
                if uid in out:
                    out[uid] = round(float(r.get("total") or 0.0), 2)
    except Exception as e:
        logger.error(f"_admin_adjustments_sum_batch SQL failed: {e}")
    return out


async def _admin_adjustments_sum_for(user_id: str) -> float:
    res = await _admin_adjustments_sum_batch([user_id])
    return res.get(user_id, 0.0)


async def _distributor_earnings_for(dist_id: str, dist_base_pct: float = 0.0) -> float:
    """Distributor LIVE net earnings balance = recharge earnings + admin adjustments - approved withdrawals."""
    res = await _distributor_earnings_batch([dist_id])
    return res.get(dist_id, 0.0)


async def get_distributor_available_for_withdrawal(dist_id: str) -> float:
    """Amount a distributor can request to withdraw RIGHT NOW = net_earnings − pending − hold_balance."""
    net_earnings = await _distributor_earnings_for(dist_id)
    pending_reserved = await _withdrawals_sum_for(dist_id, ["pending"])
    w = await db.wallets.find_one({"user_id": dist_id}, {"_id": 0, "hold_balance": 1}) or {}
    hold = float(w.get("hold_balance") or 0.0)
    return max(0.0, round(net_earnings - pending_reserved - hold, 2))


async def _wallet_balances_for(user_ids: List[str]) -> dict:
    """Batch-fetch wallet balances for a list of user ids → {user_id: balance}."""
    if not user_ids:
        return {}
    out: dict = {}
    async for w in db.wallets.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "balance": 1},
    ):
        out[w["user_id"]] = w.get("balance", 0)
    return out


async def _distributor_earnings_batch(dist_ids: List[str]) -> dict:
    """Returns net remaining earnings balance for each distributor (recharge earnings + admin manual adjustments - approved withdrawals)."""
    if not dist_ids:
        return {}
    cursor = db.recharges.aggregate([
        {"$match": {"status": "approved", "distributor_id": {"$in": dist_ids}}},
        {"$group": {"_id": "$distributor_id", "total": {"$sum": "$distributor_earnings_amount"}}},
    ])
    recharge_map: dict = {did: 0.0 for did in dist_ids}
    async for row in cursor:
        recharge_map[row["_id"]] = round(row.get("total") or 0.0, 2)
    adj_map = await _admin_adjustments_sum_batch(dist_ids)
    w_map = await _withdrawals_sum_batch(dist_ids, ["approved"])
    return {did: max(0.0, round(recharge_map.get(did, 0.0) + adj_map.get(did, 0.0) - w_map.get(did, 0.0), 2)) for did in dist_ids}


async def _md_earnings_for(md_id: str) -> float:
    res = await _md_earnings_batch([md_id])
    return res.get(md_id, 0.0)


async def _md_earnings_batch(md_ids: List[str]) -> dict:
    """Returns net remaining earnings balance for each master distributor (recharge earnings + admin manual adjustments - approved withdrawals)."""
    if not md_ids:
        return {}
    cursor = db.recharges.aggregate([
        {"$match": {"status": "approved", "md_id": {"$in": md_ids}}},
        {"$group": {"_id": "$md_id", "total": {"$sum": "$md_earnings_amount"}}},
    ])
    recharge_map: dict = {mid: 0.0 for mid in md_ids}
    async for row in cursor:
        recharge_map[row["_id"]] = round(row.get("total") or 0.0, 2)
    adj_map = await _admin_adjustments_sum_batch(md_ids)
    w_map = await _withdrawals_sum_batch(md_ids, ["approved"])
    return {mid: max(0.0, round(recharge_map.get(mid, 0.0) + adj_map.get(mid, 0.0) - w_map.get(mid, 0.0), 2)) for mid in md_ids}


async def _md_today_earnings(md_id: str) -> float:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cursor = db.recharges.aggregate([
        {"$match": {"status": "approved", "md_id": md_id, "created_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$md_earnings_amount"}}}
    ])
    res = await cursor.to_list(1)
    return round(float(res[0]["total"]), 2) if (res and res[0].get("total") is not None) else 0.0

async def _distributor_today_earnings(distributor_id: str) -> float:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    cursor = db.recharges.aggregate([
        {"$match": {"status": "approved", "distributor_id": distributor_id, "created_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$distributor_earnings_amount"}}}
    ])
    res = await cursor.to_list(1)
    return round(float(res[0]["total"]), 2) if (res and res[0].get("total") is not None) else 0.0



async def run_daily_commission_settlement():
    """At day change / startup: calculate all past unsettled daily earnings for Distributors and MDs,
    credit them to their wallet balance, record in ledger, and mark as settled."""
    try:
        today_start_dt = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_str = today_start_dt.strftime("%Y-%m-%d")
        
        # 1. Distributor Unsettled Past Earnings
        dist_cursor = db.recharges.aggregate([
            {"$match": {
                "status": "approved", 
                "created_at": {"$lt": today_start_dt},
                "settled_distributor": {"$ne": True}
            }},
            {"$group": {"_id": "$distributor_id", "total": {"$sum": "$distributor_earnings_amount"}}}
        ])
        async for row in dist_cursor:
            dist_id = row.get("_id")
            total_earnings = round(row.get("total") or 0.0, 2)
            if dist_id and total_earnings > 0:
                w = await get_or_create_wallet(dist_id)
                new_bal = round(float(w.get("balance", 0.0)) + total_earnings, 2)
                await db.wallets.update_one({"user_id": dist_id}, {"$set": {"balance": new_bal}})
                await db.recharges.update_many(
                    {"status": "approved", "distributor_id": dist_id, "created_at": {"$lt": today_start_dt}},
                    {"$set": {"settled_distributor": True}}
                )

        # 2. Master Distributor Unsettled Past Earnings
        md_cursor = db.recharges.aggregate([
            {"$match": {
                "status": "approved",
                "created_at": {"$lt": today_start_dt},
                "settled_md": {"$ne": True}
            }},
            {"$group": {"_id": "$md_id", "total": {"$sum": "$md_earnings_amount"}}}
        ])
        async for row in md_cursor:
            md_id = row.get("_id")
            total_earnings = round(row.get("total") or 0.0, 2)
            if md_id and total_earnings > 0:
                w = await get_or_create_wallet(md_id)
                new_bal = round(float(w.get("balance", 0.0)) + total_earnings, 2)
                await db.wallets.update_one({"user_id": md_id}, {"$set": {"balance": new_bal}})
                await db.recharges.update_many(
                    {"status": "approved", "md_id": md_id, "created_at": {"$lt": today_start_dt}},
                    {"$set": {"settled_md": True}}
                )
    except Exception as e:
        logger.error(f"run_daily_commission_settlement failed: {e}")


IST = timezone(timedelta(hours=5, minutes=30))

async def run_t1_daily_settlement(cutoff_dt: Optional[datetime] = None):
    """At 11:30 AM IST daily (or via background scheduler): settle all eligible T+1 balance to main wallet.
    Rule: Any T+1 request created/approved on Day X (from 12:00 AM to 11:59 PM IST)
    is settled on Day X + 1 at 11:30 AM IST sharp. Recharges approved on Day X + 1 (even at 7 AM IST)
    are NOT settled on Day X + 1; they will settle on Day X + 2 at 11:30 AM IST sharp.
    """
    try:
        now_utc = datetime.now(timezone.utc)
        now_ist = now_utc.astimezone(IST)
        today_str = now_ist.strftime("%Y-%m-%d")
        
        # Fetch all approved T+1 recharges that are not yet settled
        cursor = db.recharges.find(
            {"status": "approved", "is_t1": True, "settled_t1": {"$ne": True}},
            {"_id": 0}
        )
        unsettled_recharges = await cursor.to_list(None)
        
        eligible_recharges = []
        for r in unsettled_recharges:
            c_at = r.get("reviewed_at") or r.get("created_at")
            c_dt_utc = None
            if isinstance(c_at, str):
                try:
                    c_dt_utc = datetime.fromisoformat(c_at.replace("Z", "+00:00"))
                except Exception:
                    c_dt_utc = None
            elif isinstance(c_at, datetime):
                c_dt_utc = c_at.astimezone(timezone.utc) if c_at.tzinfo else c_at.replace(tzinfo=timezone.utc)
                
            if c_dt_utc is None:
                eligible_recharges.append(r)
                continue

            if cutoff_dt:
                if c_dt_utc <= cutoff_dt:
                    eligible_recharges.append(r)
            else:
                # Strictly enforce: Day X recharge settles on Day X + 1 at 11:30 AM IST sharp
                c_ist = c_dt_utc.astimezone(IST)
                recharge_day_ist = c_ist.date()
                eligible_settlement_time_ist = datetime.combine(
                    recharge_day_ist + timedelta(days=1),
                    time_obj(11, 30, 0),
                    tzinfo=IST
                )
                if now_ist >= eligible_settlement_time_ist:
                    eligible_recharges.append(r)
                
        if not eligible_recharges:
            logger.info(f"[T+1 Settlement] No eligible unsettled T+1 recharges found for now {now_ist.isoformat()}")
            return {"settled_count": 0, "total_settled_amount": 0.0, "cutoff": now_ist.isoformat()}
            
        # Group eligible recharges by agent user_id
        agent_group = {}
        for r in eligible_recharges:
            uid = r.get("user_id")
            if not uid:
                continue
            amt = float(r.get("credit_amount") if r.get("credit_amount") is not None else (r.get("net_credit_amount") if r.get("net_credit_amount") is not None else (float(r.get("amount", 0)) - float(r.get("commission_amount", 0)))))
            if uid not in agent_group:
                agent_group[uid] = {"amount": 0.0, "recharge_ids": []}
            agent_group[uid]["amount"] += amt
            agent_group[uid]["recharge_ids"].append(r["id"])
            
        total_settled_amount = 0.0
        settled_agents_count = 0
        
        for uid, data in agent_group.items():
            tot_amt = round(data["amount"], 2)
            r_ids = data["recharge_ids"]
            if tot_amt <= 0:
                continue
                
            w = await get_or_create_wallet(uid)
            cur_t1 = float(w.get("t1_balance") or 0.0)
            
            # Settle amount is bounded by actual t1_balance available
            settle_amt = round(min(tot_amt, cur_t1), 2)
            if settle_amt <= 0:
                # Mark recharges settled to prevent sticking
                await db.recharges.update_many(
                    {"id": {"$in": r_ids}},
                    {"$set": {"settled_t1": True, "settled_t1_at": now_iso()}}
                )
                continue
                
            # Perform atomic wallet transfer: balance += settle_amt, t1_balance = GREATEST(t1_balance - settle_amt, 0.0)
            res = await db.execute_query(
                "UPDATE wallets SET balance = balance + $1, t1_balance = GREATEST(t1_balance - $1, 0.0), updated_at = $2 WHERE user_id = $3 RETURNING balance, t1_balance",
                [settle_amt, now_iso(), uid]
            )
            
            new_main_bal = float(res[0]["balance"]) if res else round(float(w.get("balance", 0.0)) + settle_amt, 2)
            
            # Record in ledger
            await db.ledger.insert_one({
                "id": new_id(),
                "user_id": uid,
                "kind": "credit",
                "amount": settle_amt,
                "balance_after": new_main_bal,
                "ref_type": "t1_settlement",
                "ref_id": f"t1_settle_{today_str}_{uid[:8]}",
                "note": f"T+1 Wallet Settlement credited to Main Wallet (₹{settle_amt:,.2f})",
                "created_at": now_iso()
            })
            
            # Mark recharges as settled_t1
            await db.recharges.update_many(
                {"id": {"$in": r_ids}},
                {"$set": {"settled_t1": True, "settled_t1_at": now_iso()}}
            )
            
            total_settled_amount += settle_amt
            settled_agents_count += 1
            logger.info(f"[T+1 Settlement] Settled ₹{settle_amt} for agent {uid} -> Main Balance: ₹{new_main_bal}")
            
        return {
            "settled_count": settled_agents_count,
            "total_settled_amount": round(total_settled_amount, 2),
            "cutoff": cutoff_iso
        }
    except Exception as e:
        logger.error(f"[T+1 Settlement] Error in run_t1_daily_settlement: {e}")
        return {"error": str(e)}


_t1_scheduler = None
_t1_background_task = None

async def _t1_settlement_periodic_loop():
    while True:
        try:
            await run_t1_daily_settlement()
            await run_daily_commission_settlement()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[T+1 Periodic Task] Error in background loop: {e}")
        await asyncio.sleep(60)  # Check every 60 seconds (1 minute)

def _start_t1_scheduler():
    global _t1_scheduler, _t1_background_task
    if _t1_scheduler is not None and _t1_scheduler.running:
        return
    _t1_scheduler = AsyncIOScheduler(timezone=IST)
    # Schedule daily at 11:30 AM IST sharp
    _t1_scheduler.add_job(
        run_t1_daily_settlement,
        CronTrigger(hour=11, minute=30, timezone=IST),
        id="t1_daily_settlement",
        replace_existing=True
    )
    # Also check every 15 minutes automatically so no settlement is ever missed
    _t1_scheduler.add_job(
        run_t1_daily_settlement,
        IntervalTrigger(minutes=15),
        id="t1_interval_check",
        replace_existing=True
    )
    # Schedule daily distributor/MD commission settlement at 00:05 UTC (05:35 AM IST)
    _t1_scheduler.add_job(
        run_daily_commission_settlement,
        CronTrigger(hour=0, minute=5, timezone=timezone.utc),
        id="daily_commission_settlement",
        replace_existing=True
    )
    _t1_scheduler.start()
    logger.info("[T+1 Scheduler] APScheduler started with 15-min auto check and 11:30 AM IST daily trigger.")
    
    try:
        loop = asyncio.get_running_loop()
        if _t1_background_task is None or _t1_background_task.done():
            _t1_background_task = loop.create_task(_t1_settlement_periodic_loop())
    except Exception:
        pass



async def get_md_available_for_withdrawal(md_id: str) -> float:
    """Amount an MD can request to withdraw RIGHT NOW = net_earnings − pending − hold_balance.
    Pending requests are reserved so an MD cannot double-spend earnings while one request
    is still awaiting admin review."""
    net_earnings = await _md_earnings_for(md_id)
    pending_reserved = await _withdrawals_sum_for(md_id, ["pending"])
    w = await db.wallets.find_one({"user_id": md_id}, {"_id": 0, "hold_balance": 1}) or {}
    hold = float(w.get("hold_balance") or 0.0)
    return max(0.0, round(net_earnings - pending_reserved - hold, 2))


@api.get("/admin/exports/{role}.pdf")
async def export_users_pdf(role: str, user=Depends(require_roles("admin"))):
    """Stream a PDF report of every master_distributor, distributor OR agent in the
    system. Same live data source as the on-screen table (`admin_list_users`)
    so the numbers cannot drift. Runs in a threadpool so the FastAPI event loop
    stays responsive while reportlab renders."""
    if role not in ("master_distributor", "distributor", "agent"):
        raise HTTPException(404, "Unknown export")

    q = {"is_deleted": False, "role": role}
    items = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(None)
    parent_ids = list({it.get("parent_id") for it in items if it.get("parent_id")})
    md_ids_map = list({it.get("md_id") for it in items if it.get("md_id")})
    parent_map = await _build_parent_name_map(list({*parent_ids, *md_ids_map}))
    wallets_map = await _wallet_balances_for([it["id"] for it in items])
    dist_ids = [it["id"] for it in items] if role == "distributor" else []
    earnings_map = await _distributor_earnings_batch(dist_ids)
    md_ids_for_earn = [it["id"] for it in items] if role == "master_distributor" else []
    md_earnings_map = await _md_earnings_batch(md_ids_for_earn)
    for it in items:
        it["wallet_balance"] = wallets_map.get(it["id"], 0)
        if role == "agent":
            it["creator_name"] = parent_map.get(it.get("parent_id"), "Admin") if it.get("parent_id") else "Admin"
        if role == "distributor":
            it["earnings"] = earnings_map.get(it["id"], 0.0)
            it["creator_name"] = parent_map.get(it.get("md_id"), "Admin") if it.get("md_id") else "Admin"
        if role == "master_distributor":
            it["earnings"] = md_earnings_map.get(it["id"], 0.0)

    def _row_status(u: dict) -> str:
        if u.get("frozen"):
            return "Frozen"
        if role == "agent":
            k = u.get("kyc_status")
            if k and k != "approved":
                return "Pending" if k == "pending" else "Rejected"
        return "Approved"

    from starlette.responses import StreamingResponse
    from starlette.concurrency import run_in_threadpool

    pdf_bytes = await run_in_threadpool(_render_users_pdf, role, items, _row_status)
    fname_role = {"master_distributor": "Master_Distributors", "distributor": "Distributors", "agent": "Agents"}[role]
    fname = f"MAK_FIN_PAY_{fname_role}_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/admin/exports/{role}.csv")
async def export_users_csv(role: str, user=Depends(require_roles("admin"))):
    """Stream a CSV report of every master_distributor, distributor OR agent in the system."""
    if role not in ("master_distributor", "distributor", "agent"):
        raise HTTPException(404, "Unknown export")

    q = {"is_deleted": False, "role": role}
    items = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(None)
    parent_ids = list({it.get("parent_id") for it in items if it.get("parent_id")})
    md_ids_map = list({it.get("md_id") for it in items if it.get("md_id")})
    parent_map = await _build_parent_name_map(list({*parent_ids, *md_ids_map}))
    wallets_map = await _wallet_balances_for([it["id"] for it in items])
    dist_ids = [it["id"] for it in items] if role == "distributor" else []
    earnings_map = await _distributor_earnings_batch(dist_ids)
    md_ids_for_earn = [it["id"] for it in items] if role == "master_distributor" else []
    md_earnings_map = await _md_earnings_batch(md_ids_for_earn)
    for it in items:
        it["wallet_balance"] = wallets_map.get(it["id"], 0)
        if role == "agent":
            it["creator_name"] = parent_map.get(it.get("parent_id"), "Admin") if it.get("parent_id") else "Admin"
        if role == "distributor":
            it["earnings"] = earnings_map.get(it["id"], 0.0)
            it["creator_name"] = parent_map.get(it.get("md_id"), "Admin") if it.get("md_id") else "Admin"
        if role == "master_distributor":
            it["earnings"] = md_earnings_map.get(it["id"], 0.0)

    def _row_status(u: dict) -> str:
        if u.get("frozen"):
            return "Frozen"
        if role == "agent":
            k = u.get("kyc_status")
            if k and k != "approved":
                return "Pending" if k == "pending" else "Rejected"
        return "Approved"

    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    
    if role == "agent":
        writer.writerow(["Full Name", "Firm Name", "Email", "Phone", "Creator", "Wallet Balance", "Commission % (Charges)", "KYC Status", "Created At"])
        for it in items:
            writer.writerow([
                it.get("full_name", ""),
                it.get("firm_name", ""),
                it.get("email", ""),
                it.get("phone", ""),
                it.get("creator_name", ""),
                it.get("wallet_balance", 0.0),
                it.get("commission_percent", 0.0),
                _row_status(it),
                it.get("created_at", "")
            ])
    elif role == "distributor":
        writer.writerow(["Full Name", "Email", "Phone", "Creator", "Wallet Balance", "Commission %", "Total Earnings", "Status", "Created At"])
        for it in items:
            writer.writerow([
                it.get("full_name", ""),
                it.get("email", ""),
                it.get("phone", ""),
                it.get("creator_name", ""),
                it.get("wallet_balance", 0.0),
                it.get("commission_percent", 0.0),
                it.get("earnings", 0.0),
                _row_status(it),
                it.get("created_at", "")
            ])
    else:  # master_distributor
        writer.writerow(["Full Name", "Email", "Phone", "Wallet Balance", "Commission %", "Total Earnings", "Status", "Created At"])
        for it in items:
            writer.writerow([
                it.get("full_name", ""),
                it.get("email", ""),
                it.get("phone", ""),
                it.get("wallet_balance", 0.0),
                it.get("commission_percent", 0.0),
                it.get("earnings", 0.0),
                _row_status(it),
                it.get("created_at", "")
            ])

    from starlette.responses import StreamingResponse
    csv_data = output.getvalue()
    output.close()
    
    fname_role = {"master_distributor": "Master_Distributors", "distributor": "Distributors", "agent": "Agents"}[role]
    fname = f"MAK_FIN_PAY_{fname_role}_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        io.BytesIO(csv_data.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/admin/recharges/export/pdf")
async def export_recharges_pdf(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    qr_code_id: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    agent_search: Optional[str] = None,
    qr_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    query = _build_recharge_query(
        status=status, agent_id=agent_id, qr_code_id=qr_code_id,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount,
        agent_search=agent_search, qr_search=qr_search
    )
    items = await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
    
    from starlette.responses import StreamingResponse
    from starlette.concurrency import run_in_threadpool
    
    pdf_bytes = await run_in_threadpool(_render_recharges_pdf, items)
    fname = f"MAK_FIN_PAY_Recharge_Approvals_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/admin/recharges/export/csv")
async def export_recharges_csv(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    qr_code_id: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    agent_search: Optional[str] = None,
    qr_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    query = _build_recharge_query(
        status=status, agent_id=agent_id, qr_code_id=qr_code_id,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount,
        agent_search=agent_search, qr_search=qr_search
    )
    items = await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
    
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Agent", "Amount", "UTR", "QR Code Used", "Card/Acc Last 4", 
        "Comm %", "Comm Charge", "Admin Comm", "S.Dist Comm", "Dist Comm", 
        "Net Credit", "Status", "Created At", "Reviewed At", "Rejection Reason"
    ])
    for r in items:
        comm_charge = r.get("commission_amount", 0.0) if r.get("status") == "approved" else (r.get("amount", 0) * r.get("commission_percent", 0) / 100)
        net_credit = r.get("credit_amount", 0.0) if r.get("status") == "approved" else 0.0
        writer.writerow([
            r.get("user_name", ""),
            r.get("amount", 0.0),
            r.get("utr", ""),
            r.get("qr_code_label", ""),
            r.get("card_last4", ""),
            r.get("commission_percent", 0.0),
            comm_charge,
            r.get("admin_revenue_amount", 0.0) if r.get("status") == "approved" else 0.0,
            r.get("md_earnings_amount", 0.0) if r.get("status") == "approved" else 0.0,
            r.get("distributor_earnings_amount", 0.0) if r.get("status") == "approved" else 0.0,
            net_credit,
            r.get("status", ""),
            r.get("created_at", ""),
            r.get("reviewed_at", ""),
            r.get("rejection_reason", "")
        ])
    
    from starlette.responses import StreamingResponse
    csv_data = output.getvalue()
    output.close()
    
    fname = f"MAK_FIN_PAY_Recharge_Approvals_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        io.BytesIO(csv_data.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/admin/transactions/export/pdf")
async def export_transactions_pdf(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    operator: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    type: Optional[str] = None,
    txn_id: Optional[str] = None,
    api_txn_id: Optional[str] = None,
    agent_search: Optional[str] = None,
    bank_search: Optional[str] = None,
    card_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    matched_ids = None
    if txn_id and txn_id.strip().lower().startswith("txn"):
        needle = txn_id.strip().lower()
        recent_txs = await db.transactions.find({}, {"id": 1}).sort("created_at", -1).to_list(2000)
        matched_ids = [tx["id"] for tx in recent_txs if tx.get("id") and needle in get_short_txn_id(tx["id"]).lower()]
        
    query = _build_transaction_query(
        status=status, agent_id=agent_id, operator=operator,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount, txn_type=type,
        txn_id=txn_id, api_txn_id=api_txn_id, matched_ids=matched_ids,
        agent_search=agent_search, bank_search=bank_search, card_search=card_search
    )
    items = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
    
    from starlette.responses import StreamingResponse
    from starlette.concurrency import run_in_threadpool
    
    pdf_bytes = await run_in_threadpool(_render_transactions_pdf, items)
    fname = f"MAK_FIN_PAY_Bill_Payments_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/admin/transactions/export/csv")
async def export_transactions_csv(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    operator: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    type: Optional[str] = None,
    txn_id: Optional[str] = None,
    api_txn_id: Optional[str] = None,
    agent_search: Optional[str] = None,
    bank_search: Optional[str] = None,
    card_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    matched_ids = None
    if txn_id and txn_id.strip().lower().startswith("txn"):
        needle = txn_id.strip().lower()
        recent_txs = await db.transactions.find({}, {"id": 1}).sort("created_at", -1).to_list(2000)
        matched_ids = [tx["id"] for tx in recent_txs if tx.get("id") and needle in get_short_txn_id(tx["id"]).lower()]
        
    query = _build_transaction_query(
        status=status, agent_id=agent_id, operator=operator,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount, txn_type=type,
        txn_id=txn_id, api_txn_id=api_txn_id, matched_ids=matched_ids,
        agent_search=agent_search, bank_search=bank_search, card_search=card_search
    )
    items = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
    
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Agent", "Customer Name", "Customer Phone", "Bank", "Card Last 4", 
        "Bill Amount", "Charge", "Total Amount", "Status", "Date", "Rejection Reason"
    ])
    for t in items:
        writer.writerow([
            t.get("user_name", ""),
            t.get("customer_name", ""),
            t.get("customer_phone", ""),
            t.get("operator", ""),
            t.get("card_last4", ""),
            t.get("bill_amount") or t.get("amount") or 0.0,
            t.get("service_charge", 0.0),
            t.get("total_amount", 0.0),
            t.get("status", ""),
            t.get("created_at", ""),
            t.get("rejection_reason", "")
        ])
    
    from starlette.responses import StreamingResponse
    csv_data = output.getvalue()
    output.close()
    
    fname = f"MAK_FIN_PAY_Bill_Payments_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        io.BytesIO(csv_data.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


def _render_recharges_pdf(items: list) -> bytes:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    fonts_dir = Path(__file__).resolve().parent / "fonts"
    if "DejaVuSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans", str(fonts_dir / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(fonts_dir / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily(
            "DejaVuSans", normal="DejaVuSans", bold="DejaVuSans-Bold",
        )
    FONT = "DejaVuSans"
    FONT_BOLD = "DejaVuSans-Bold"

    ist = timezone(timedelta(hours=5, minutes=30))
    generated = datetime.now(ist).strftime("%d %b %Y, %I:%M %p IST")

    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle(
        "cell", parent=styles["BodyText"], fontName=FONT, fontSize=7.5, leading=9.5,
    )
    cell_bold_white = ParagraphStyle(
        "cellBW", parent=cell_style, fontName=FONT_BOLD, textColor=colors.white,
    )

    def P(text, style=cell_style):
        text = "" if text is None else str(text)
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return Paragraph(text, style)

    header_row = ["Agent", "Amount", "UTR", "QR Code Used", "Card/Acc", "Comm Charge", "Net Credit", "Status", "Created"]
    col_widths = [35*mm, 24*mm, 35*mm, 35*mm, 28*mm, 26*mm, 26*mm, 20*mm, 37*mm]

    data_rows = [[P(h, cell_bold_white) for h in header_row]]
    for r in items:
        comm_charge = r.get("commission_amount", 0.0) if r.get("status") == "approved" else (r.get("amount", 0) * r.get("commission_percent", 0) / 100)
        net_credit = r.get("credit_amount", 0.0) if r.get("status") == "approved" else 0.0
        row = [
            P(r.get("user_name")),
            P(f"\u20B9{float(r.get('amount') or 0):,.2f}"),
            P(r.get("utr") or "—"),
            P(r.get("qr_code_label") or "—"),
            P(f"XXXX {r.get('card_last4')}" if r.get("card_last4") else "—"),
            P(f"\u20B9{float(comm_charge):,.2f}"),
            P(f"\u20B9{float(net_credit):,.2f}" if r.get("status") == "approved" else "—"),
            P(r.get("status", "").upper()),
            P(_fmt_ist(r.get("created_at"))),
        ]
        data_rows.append(row)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=15*mm, rightMargin=15*mm, topMargin=20*mm, bottomMargin=18*mm,
        title="MAK FIN PAY — Recharge Approvals",
        author="MAK FIN PAY",
    )

    title_style = ParagraphStyle(
        "title", parent=styles["Title"], fontName=FONT_BOLD, fontSize=16,
        textColor=colors.HexColor("#1B4332"), spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "sub", parent=styles["Heading3"], fontName=FONT_BOLD, fontSize=11,
        textColor=colors.HexColor("#1B4332"),
    )
    meta_style = ParagraphStyle(
        "meta", parent=styles["Normal"], fontName=FONT, fontSize=9, textColor=colors.grey,
    )

    story = [
        Paragraph("MAK FIN PAY", title_style),
        Paragraph("Recharge Approvals Report", subtitle_style),
        Paragraph(f"Generated: {generated} · Total Requests: {len(items)}", meta_style),
        Spacer(1, 6),
    ]

    tbl = Table(data_rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1B4332")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FDFCF8"), colors.HexColor("#F4F3ED")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#0C1F17")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
    ]))
    story.append(tbl)

    def _draw_footer(canvas, doc_):
        canvas.saveState()
        page_num = canvas.getPageNumber()
        canvas.setFont(FONT, 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(15*mm, 10*mm, "MAK FIN PAY · Confidential")
        canvas.drawRightString(landscape(A4)[0] - 15*mm, 10*mm, f"Page {page_num}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buf.getvalue()


def _render_transactions_pdf(items: list) -> bytes:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    fonts_dir = Path(__file__).resolve().parent / "fonts"
    if "DejaVuSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans", str(fonts_dir / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(fonts_dir / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily(
            "DejaVuSans", normal="DejaVuSans", bold="DejaVuSans-Bold",
        )
    FONT = "DejaVuSans"
    FONT_BOLD = "DejaVuSans-Bold"

    ist = timezone(timedelta(hours=5, minutes=30))
    generated = datetime.now(ist).strftime("%-d %b %Y, %-I:%M %p IST")

    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle(
        "cell", parent=styles["BodyText"], fontName=FONT, fontSize=7.5, leading=9.5,
    )
    cell_bold_white = ParagraphStyle(
        "cellBW", parent=cell_style, fontName=FONT_BOLD, textColor=colors.white,
    )

    def P(text, style=cell_style):
        text = "" if text is None else str(text)
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return Paragraph(text, style)

    header_row = ["Agent", "Customer", "Customer Phone", "Bank", "Card", "Bill Amount", "Charge", "Total Amount", "Status", "Date"]
    col_widths = [32*mm, 28*mm, 28*mm, 26*mm, 18*mm, 24*mm, 18*mm, 24*mm, 20*mm, 38*mm]

    data_rows = [[P(h, cell_bold_white) for h in header_row]]
    for t in items:
        row = [
            P(t.get("user_name")),
            P(t.get("customer_name")),
            P(t.get("customer_phone") or "—"),
            P(t.get("operator")),
            P(f"**** {t.get('card_last4')}" if t.get("card_last4") else "—"),
            P(f"\u20B9{float(t.get('bill_amount') or t.get('amount') or 0):,.2f}"),
            P(f"\u20B9{float(t.get('service_charge') or 0):,.2f}"),
            P(f"\u20B9{float(t.get('total_amount') or 0):,.2f}" if t.get("total_amount") is not None else "—"),
            P(t.get("status", "").upper()),
            P(_fmt_ist(t.get("created_at"))),
        ]
        data_rows.append(row)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=15*mm, rightMargin=15*mm, topMargin=20*mm, bottomMargin=18*mm,
        title="MAK FIN PAY — Bill Payments",
        author="MAK FIN PAY",
    )

    title_style = ParagraphStyle(
        "title", parent=styles["Title"], fontName=FONT_BOLD, fontSize=16,
        textColor=colors.HexColor("#1B4332"), spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "sub", parent=styles["Heading3"], fontName=FONT_BOLD, fontSize=11,
        textColor=colors.HexColor("#1B4332"),
    )
    meta_style = ParagraphStyle(
        "meta", parent=styles["Normal"], fontName=FONT, fontSize=9, textColor=colors.grey,
    )

    story = [
        Paragraph("MAK FIN PAY", title_style),
        Paragraph("Bill Payments Report", subtitle_style),
        Paragraph(f"Generated: {generated} · Total Transactions: {len(items)}", meta_style),
        Spacer(1, 6),
    ]

    tbl = Table(data_rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1B4332")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FDFCF8"), colors.HexColor("#F4F3ED")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#0C1F17")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
    ]))
    story.append(tbl)

    def _draw_footer(canvas, doc_):
        canvas.saveState()
        page_num = canvas.getPageNumber()
        canvas.setFont(FONT, 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(15*mm, 10*mm, "MAK FIN PAY · Confidential")
        canvas.drawRightString(landscape(A4)[0] - 15*mm, 10*mm, f"Page {page_num}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buf.getvalue()


def _render_users_pdf(role: str, items: list, status_fn) -> bytes:
    """Render the users-export PDF synchronously with reportlab. Runs in a
    threadpool via `run_in_threadpool`, so the event loop is not blocked.
    Landscape A4, branded header, striped table, page numbers in footer.
    Text wraps via Paragraph cells so long emails/names don't overflow.
    Uses DejaVu Sans (bundled TTF) throughout so the Indian Rupee ₹ (U+20B9)
    and other Unicode glyphs render correctly."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    # Register bundled DejaVu Sans (regular + bold). Both include ₹ glyph
    # (U+20B9). Idempotent — pdfmetrics keeps a global registry.
    fonts_dir = Path(__file__).resolve().parent / "fonts"
    if "DejaVuSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVuSans", str(fonts_dir / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(fonts_dir / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily(
            "DejaVuSans", normal="DejaVuSans", bold="DejaVuSans-Bold",
        )
    FONT = "DejaVuSans"
    FONT_BOLD = "DejaVuSans-Bold"

    is_dist = role == "distributor"
    is_md = role == "master_distributor"
    ist = timezone(timedelta(hours=5, minutes=30))
    generated = datetime.now(ist).strftime("%-d %b %Y, %-I:%M %p IST")
    section_title = ("Master Distributors Report" if is_md
                     else "Distributors Report" if is_dist
                     else "Agents Report")
    total_label = ("Total Master Distributors" if is_md
                   else "Total Distributors" if is_dist
                   else "Total Agents")

    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle(
        "cell", parent=styles["BodyText"], fontName=FONT, fontSize=8, leading=10,
    )
    cell_bold_white = ParagraphStyle(
        "cellBW", parent=cell_style, fontName=FONT_BOLD, textColor=colors.white,
    )

    def P(text, style=cell_style):
        text = "" if text is None else str(text)
        # Escape reportlab paragraph markup
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return Paragraph(text, style)

    # Header + table columns per role
    if is_md:
        header_row = ["Name", "Email", "Phone", "Earnings", "Comm %", "Distributors", "Agents", "Status", "Created"]
        col_widths = [40*mm, 55*mm, 28*mm, 26*mm, 18*mm, 22*mm, 18*mm, 22*mm, 30*mm]
    elif is_dist:
        header_row = ["Name", "Email", "Phone", "Created By", "Earnings", "Comm %", "Status", "Created"]
        col_widths = [40*mm, 55*mm, 28*mm, 30*mm, 26*mm, 18*mm, 22*mm, 30*mm]
    else:
        header_row = ["Name", "Firm Name", "Email", "Phone", "Distributor", "Wallet", "Comm %", "Status", "Created"]
        col_widths = [32*mm, 35*mm, 45*mm, 25*mm, 30*mm, 22*mm, 16*mm, 20*mm, 25*mm]

    # Body rows
    data_rows = [[P(h, cell_bold_white) for h in header_row]]
    for u in items:
        if is_md:
            row = [
                P(u.get("full_name")),
                P(u.get("email")),
                P(u.get("phone") or "—"),
                P(f"\u20B9{float(u.get('earnings') or 0):,.2f}"),
                P(f"{u.get('commission_percent') if u.get('commission_percent') is not None else '—'}%"),
                P(str(u.get("distributors_count") or 0)),
                P(str(u.get("agents_count") or 0)),
                P(status_fn(u)),
                P(_fmt_ist(u.get("created_at"))),
            ]
        elif is_dist:
            row = [
                P(u.get("full_name")),
                P(u.get("email")),
                P(u.get("phone") or "—"),
                P(u.get("creator_name") or "Admin"),
                P(f"\u20B9{float(u.get('earnings') or 0):,.2f}"),
                P(f"{u.get('commission_percent') if u.get('commission_percent') is not None else '—'}%"),
                P(status_fn(u)),
                P(_fmt_ist(u.get("created_at"))),
            ]
        else:
            row = [
                P(u.get("full_name")),
                P(u.get("firm_name") or "—"),
                P(u.get("email")),
                P(u.get("phone") or "—"),
                P(u.get("creator_name") or "Admin"),
                P(f"\u20B9{float(u.get('wallet_balance') or 0):,.2f}"),
                P(f"{u.get('commission_percent') if u.get('commission_percent') is not None else '—'}%"),
                P(status_fn(u)),
                P(_fmt_ist(u.get("created_at"))),
            ]
        data_rows.append(row)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=15*mm, rightMargin=15*mm, topMargin=20*mm, bottomMargin=18*mm,
        title=f"MAK FIN PAY — {section_title}",
        author="MAK FIN PAY",
    )

    # Header block (repeats on every page via onLaterPages)
    title_style = ParagraphStyle(
        "title", parent=styles["Title"], fontName=FONT_BOLD, fontSize=16,
        textColor=colors.HexColor("#1B4332"), spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "sub", parent=styles["Heading3"], fontName=FONT_BOLD, fontSize=11,
        textColor=colors.HexColor("#1B4332"),
    )
    meta_style = ParagraphStyle(
        "meta", parent=styles["Normal"], fontName=FONT, fontSize=9, textColor=colors.grey,
    )

    story = [
        Paragraph("MAK FIN PAY", title_style),
        Paragraph(section_title, subtitle_style),
        Paragraph(f"Generated: {generated} · {total_label}: {len(items)}", meta_style),
        Spacer(1, 6),
    ]

    # Table
    tbl = Table(data_rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1B4332")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FDFCF8"), colors.HexColor("#F4F3ED")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#0C1F17")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ("FONTNAME", (0, 1), (-1, -1), FONT),
    ]))
    story.append(tbl)

    def _draw_footer(canvas, doc_):
        canvas.saveState()
        page_num = canvas.getPageNumber()
        canvas.setFont(FONT, 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(15*mm, 10*mm, "MAK FIN PAY · Confidential")
        canvas.drawRightString(landscape(A4)[0] - 15*mm, 10*mm, f"Page {page_num}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buf.getvalue()


def _fmt_ist(iso_ts: Optional[str]) -> str:
    if not iso_ts:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        ist = timezone(timedelta(hours=5, minutes=30))
        return dt.astimezone(ist).strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return iso_ts


@api.get("/admin/users")
async def admin_list_users(
    role: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    paginated: bool = False,
    user=Depends(require_roles("admin")),
):
    query: dict = {"is_deleted": False}
    if role:
        query["role"] = role
    if q:
        needle = _escape_regex(q.strip())
        if needle:
            query["$or"] = [
                {"full_name": {"$regex": needle, "$options": "i"}},
                {"firm_name": {"$regex": needle, "$options": "i"}},
                {"email":     {"$regex": needle, "$options": "i"}},
                {"phone":     {"$regex": needle, "$options": "i"}},
            ]

    if paginated:
        page = max(1, page); page_size = max(1, min(200, page_size))
        total_task = db.users.count_documents(query)
        items_task = db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        total, items = await asyncio.gather(total_task, items_task)
    else:
        items = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(None)
        total = len(items)

    parent_ids = list({it.get("parent_id") for it in items if it.get("parent_id")})
    md_ids_for_map = list({it.get("md_id") for it in items if it.get("md_id")})
    
    parent_map_task = _build_parent_name_map(list({*parent_ids, *md_ids_for_map}))
    wallets_map_task = _wallet_balances_for([it["id"] for it in items])
    wallet_details_task = db.wallets.find({"user_id": {"$in": [it["id"] for it in items]}}).to_list(None)
    
    distributor_ids = [it["id"] for it in items if it.get("role") == "distributor"]
    earnings_map_task = _distributor_earnings_batch(distributor_ids)
    
    md_ids = [it["id"] for it in items if it.get("role") == "master_distributor"]
    md_earnings_map_task = _md_earnings_batch(md_ids)

    md_dist_task = None
    md_agent_task = None
    if md_ids:
        md_dist_task = db.users.aggregate([
            {"$match": {"md_id": {"$in": md_ids}, "role": "distributor", "is_deleted": False}},
            {"$group": {"_id": "$md_id", "n": {"$sum": 1}}},
        ]).to_list(None)
        md_agent_task = db.users.aggregate([
            {"$match": {"md_id": {"$in": md_ids}, "role": "agent", "is_deleted": False}},
            {"$group": {"_id": "$md_id", "n": {"$sum": 1}}},
        ]).to_list(None)

    dist_agent_task = None
    if distributor_ids:
        dist_agent_task = db.users.aggregate([
            {"$match": {"parent_id": {"$in": distributor_ids}, "role": "agent", "is_deleted": False}},
            {"$group": {"_id": "$parent_id", "n": {"$sum": 1}}},
        ]).to_list(None)

    tasks = [
        parent_map_task,
        wallets_map_task,
        wallet_details_task,
        earnings_map_task,
        md_earnings_map_task,
    ]
    if md_dist_task: tasks.append(md_dist_task)
    if md_agent_task: tasks.append(md_agent_task)
    if dist_agent_task: tasks.append(dist_agent_task)

    results = await asyncio.gather(*tasks)

    parent_map = results[0]
    wallets_map = results[1]
    wallet_details = {w["user_id"]: w for w in results[2]}
    earnings_map = results[3]
    md_earnings_map = results[4]

    idx = 5
    md_dist_counts = {}
    if md_dist_task:
        md_dist_counts = {row["_id"]: row["n"] for row in results[idx]}
        idx += 1
    md_agent_counts = {}
    if md_agent_task:
        md_agent_counts = {row["_id"]: row["n"] for row in results[idx]}
        idx += 1
    dist_agent_counts = {}
    if dist_agent_task:
        dist_agent_counts = {row["_id"]: row["n"] for row in results[idx]}
        idx += 1

    for it in items:
        it["wallet_balance"] = wallets_map.get(it["id"], 0)
        fw = wallet_details.get(it["id"], {})
        it["hold_balance"] = float(fw.get("hold_balance") or 0.0)
        it["hold_active"] = bool(fw.get("hold_active") or False)
        it["t1_balance"] = float(fw.get("t1_balance") or 0.0)
        if it.get("role") == "agent":
            cb = it.get("created_by_role")
            if cb == "distributor":
                it["creator_name"] = parent_map.get(it.get("parent_id"), "—")
            elif cb == "master_distributor":
                it["creator_name"] = parent_map.get(it.get("parent_id"), "—")
            else:
                it["creator_name"] = "Admin"
        if it.get("role") == "distributor":
            it["earnings"] = earnings_map.get(it["id"], 0.0)
            it["wallet_balance"] = it["earnings"]
            # "Created By" — MD name if md_id set, else Admin.
            it["creator_name"] = parent_map.get(it.get("md_id"), "Admin") if it.get("md_id") else "Admin"
            it["agents_count"] = dist_agent_counts.get(it["id"], 0)
        if it.get("role") == "master_distributor":
            it["earnings"] = md_earnings_map.get(it["id"], 0.0)
            it["wallet_balance"] = it["earnings"]
            it["distributors_count"] = md_dist_counts.get(it["id"], 0)
            it["agents_count"] = md_agent_counts.get(it["id"], 0)

    if paginated:
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    return items

@api.get("/admin/distributors/{uid}/agents")
async def admin_distributor_agents(uid: str, user=Depends(require_roles("admin"))):
    dist = await db.users.find_one({"id": uid, "role": "distributor"}, {"_id": 0, "password_hash": 0})
    if not dist:
        raise HTTPException(404, "Distributor not found")
    agents = await db.users.find(
        {"parent_id": uid, "role": "agent", "is_deleted": False},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(1000)
    agent_ids = [a["id"] for a in agents]
    wallets_map = await _wallet_balances_for(agent_ids)
    wallet_details = await db.wallets.find({"user_id": {"$in": agent_ids}}).to_list(None)
    wallet_details_map = {w["user_id"]: w for w in wallet_details}
    for a in agents:
        a["wallet_balance"] = wallets_map.get(a["id"], 0)
        fw = wallet_details_map.get(a["id"], {})
        a["t1_balance"] = float(fw.get("t1_balance") or 0.0)
        a["hold_balance"] = float(fw.get("hold_balance") or 0.0)
        a["hold_active"] = bool(fw.get("hold_active") or False)
    return {"distributor": dist, "agents": agents}


@api.get("/admin/master-distributors/{uid}/downline")
async def admin_md_downline(uid: str, user=Depends(require_roles("admin"))):
    """Return the full downline of a Master Distributor: their distributors +
    all agents (via their distributors + direct MD-created agents)."""
    md = await db.users.find_one({"id": uid, "role": "master_distributor"}, {"_id": 0, "password_hash": 0})
    if not md:
        raise HTTPException(404, "Master Distributor not found")
    distributors, direct_agents = await asyncio.gather(
        db.users.find(
            {"md_id": uid, "role": "distributor", "is_deleted": False},
            {"_id": 0, "password_hash": 0}
        ).sort("created_at", -1).to_list(None),
        db.users.find(
            {"md_id": uid, "role": "agent", "created_by_role": "master_distributor", "is_deleted": False},
            {"_id": 0, "password_hash": 0}
        ).sort("created_at", -1).to_list(None)
    )
    dist_ids = [d["id"] for d in distributors]
    dist_agents = await db.users.find(
        {"parent_id": {"$in": dist_ids}, "role": "agent", "is_deleted": False},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(None) if dist_ids else []

    dist_earnings = await _distributor_earnings_batch(dist_ids)
    all_agent_ids = [a["id"] for a in direct_agents + dist_agents]
    wallets_map = await _wallet_balances_for(all_agent_ids)
    wallet_details = await db.wallets.find({"user_id": {"$in": all_agent_ids}}).to_list(None)
    wallet_details_map = {w["user_id"]: w for w in wallet_details}
    for d in distributors:
        d["earnings"] = dist_earnings.get(d["id"], 0.0)
    for a in direct_agents + dist_agents:
        a["wallet_balance"] = wallets_map.get(a["id"], 0)
        fw = wallet_details_map.get(a["id"], {})
        a["t1_balance"] = float(fw.get("t1_balance") or 0.0)
        a["hold_balance"] = float(fw.get("hold_balance") or 0.0)
        a["hold_active"] = bool(fw.get("hold_active") or False)

    md["earnings"] = await _md_earnings_for(uid)
    return {
        "master_distributor": md,
        "distributors": distributors,
        "direct_agents": direct_agents,
        "distributor_agents": dist_agents,
    }

@api.get("/admin/users/{uid}")
async def admin_user_detail(uid: str, user=Depends(require_roles("admin"))):
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Not found")
    w = await db.wallets.find_one({"user_id": uid}, {"_id": 0}) or {"balance": 0}
    txns = await db.transactions.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"user": u, "wallet": w, "transactions": txns}

@api.patch("/admin/users/{uid}/freeze")
async def admin_freeze(uid: str, request: Request, user=Depends(require_roles("admin"))):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "Not found")
    await db.users.update_one({"id": uid}, {"$set": {"frozen": not u.get("frozen", False)}})
    await write_audit(user["id"], "toggle_freeze", target=uid, request=request)
    return {"frozen": not u.get("frozen", False)}

@api.post("/admin/users/{uid}/reset-mpin")
async def admin_reset_mpin(uid: str, request: Request, user=Depends(require_roles("admin"))):
    u = await db.users.find_one({"id": uid, "is_deleted": False})
    if not u:
        raise HTTPException(404, "User not found")
    await db.users.update_one({"id": uid}, {"$set": {"mpin_hash": None}})
    await write_audit(user["id"], "admin_reset_mpin", target=uid, request=request)
    return {"message": f"MPIN for {u.get('full_name')} reset successfully. User will be prompted to set up a new MPIN on next login."}

@api.put("/admin/users/{uid}")
async def admin_update_user(uid: str, body: UpdateUserIn, user=Depends(require_roles("admin"))):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "User not found")
    
    email = body.email.lower().strip()
    phone = (body.phone or "").strip()
    full_name = (body.full_name or "").strip()

    existing_email = await db.users.find_one({"email": email, "is_deleted": {"$ne": True}})
    if existing_email and existing_email["id"] != uid:
        raise HTTPException(400, "Email already exists")

    if phone:
        existing_phone = await db.users.find_one({"phone": phone, "is_deleted": {"$ne": True}})
        if existing_phone and existing_phone["id"] != uid:
            raise HTTPException(400, "Mobile number already exists")

    if full_name:
        existing_name = await db.users.find_one({"full_name": {"$regex": full_name, "$options": "i"}, "is_deleted": {"$ne": True}})
        if existing_name and existing_name["id"] != uid and existing_name.get("full_name", "").strip().lower() == full_name.lower():
            raise HTTPException(400, "User with this name already exists")
        
    upd = {
        "full_name": body.full_name,
        "email": email,
        "phone": body.phone,
        "address": body.address,
        "firm_name": body.firm_name,
        "firm_address": body.firm_address,
    }
    
    if body.password:
        upd["password_hash"] = hash_password(body.password)

    if body.selfie_path:
        upd["selfie_path"] = body.selfie_path
        
    if body.is_tester is not None:
        upd["is_tester"] = body.is_tester
        
    if u["role"] == "agent":
        if body.aadhaar_path:
            upd["aadhaar_path"] = body.aadhaar_path
        if body.pan_path:
            upd["pan_path"] = body.pan_path
            
        if body.aadhaar_path or body.pan_path or body.selfie_path:
            kyc_set = {}
            if body.aadhaar_path:
                kyc_set["aadhaar_path"] = body.aadhaar_path
            if body.pan_path:
                kyc_set["pan_path"] = body.pan_path
            if body.selfie_path:
                kyc_set["selfie_path"] = body.selfie_path
            kyc_set["updated_at"] = now_iso()
            await db.kyc.update_one({"user_id": uid}, {"$set": kyc_set})

    if body.commission_percent is not None:
        upd["commission_percent"] = body.commission_percent
        upd["total_commission"] = body.commission_percent
        if u["role"] == "master_distributor":
            upd["base_commission"] = body.commission_percent
            upd["admin_pct"] = body.commission_percent

    if u["role"] == "agent" and body.t1_commission_percent is not None:
        upd["t1_commission_percent"] = body.t1_commission_percent
        upd["t1_admin_pct"] = body.t1_commission_percent
        upd["t1_md_pct"] = 0.0
        upd["t1_dist_pct"] = 0.0

    if u["role"] == "agent" and body.t1_enabled is not None:
        upd["t1_enabled"] = bool(body.t1_enabled)

    if body.hold_active is not None or body.hold_balance_amount is not None:
        wallet = await get_or_create_wallet(uid)
        current_hold = float(wallet.get("hold_balance") or 0.0)
        current_balance = float(wallet.get("balance") or 0.0)
        current_hold_active = bool(wallet.get("hold_active") or False)
        
        target_hold_active = body.hold_active if body.hold_active is not None else current_hold_active
        target_hold_amount = float(body.hold_balance_amount) if body.hold_balance_amount is not None else current_hold
        
        if target_hold_active:
            if target_hold_amount < 0:
                raise HTTPException(400, "Hold amount cannot be negative")
            diff = target_hold_amount - current_hold
            if diff > 0:
                if current_balance < diff:
                    raise HTTPException(400, f"Insufficient wallet balance to hold. Need additional ₹{diff:.2f}, only have ₹{current_balance:.2f} available.")
                new_balance = current_balance - diff
                new_hold = target_hold_amount
            else:
                new_balance = current_balance + abs(diff)
                new_hold = target_hold_amount
            
            await db.wallets.update_one({"user_id": uid}, {"$set": {"balance": new_balance, "hold_balance": new_hold, "hold_active": True}})
            
            if diff > 0:
                await ledger_entry(uid, "debit", diff, new_balance, "wallet_hold", uid, f"Funds held: ₹{diff:.2f} moved to hold wallet")
            elif diff < 0:
                await ledger_entry(uid, "credit", abs(diff), new_balance, "wallet_unhold", uid, f"Funds released: ₹{abs(diff):.2f} returned to main wallet")
        else:
            if current_hold > 0:
                new_balance = current_balance + current_hold
                await db.wallets.update_one({"user_id": uid}, {"$set": {"balance": new_balance, "hold_balance": 0.0, "hold_active": False}})
                await ledger_entry(uid, "credit", current_hold, new_balance, "wallet_unhold", uid, f"All hold funds released: ₹{current_hold:.2f} returned to main wallet")
            else:
                await db.wallets.update_one({"user_id": uid}, {"$set": {"hold_active": False}})
        
        await manager.send_to_user(uid, {"event": "recharge_updated", "data": {}})
            
    await db.users.update_one({"id": uid}, {"$set": upd})
    return {"ok": True}

@api.post("/admin/users/{uid}/delete")
async def admin_delete_user(uid: str, request: Request, user=Depends(require_roles("admin"))):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "User not found")
        
    child_tables = [
        db.kyc,
        db.wallets,
        db.ledger,
        db.recharges,
        db.transactions,
        db.withdrawals,
        db.bank_details,
        db.notifications,
        db.fraud_flags,
        db.audit_logs
    ]
    
    for table in child_tables:
        try:
            await table.delete_many({"user_id": uid})
        except Exception as e:
            logger.warning(f"Ignored error deleting from table '{table.table_name}': {e}")
            
    try:
        await db.audit_logs.delete_many({"target": uid})
    except Exception as e:
        logger.warning(f"Ignored error deleting audit target logs: {e}")
        
    # Delete parent user last
    await db.users.delete_many({"id": uid})
    
    await write_audit(user["id"], "delete_user", target=uid, request=request)
    return {"ok": True}

@api.post("/admin/users/{uid}/adjust-balance")
async def admin_adjust_balance(uid: str, body: AdjustBalanceIn, request: Request, user=Depends(require_roles("admin"))):
    if user.get("email", "").lower() not in ("jigs.vanani@gmail.com", "makfinpay@gmail.com"):
        raise HTTPException(403, "Access denied: Only the Super Admin can adjust wallet balances.")
        
    u = await db.users.find_one({"id": uid, "is_deleted": False})
    if not u:
        raise HTTPException(404, "User not found")
        
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
        
    delta = body.amount if body.type == "credit" else -body.amount
    
    # Check current balance for debit operation
    wallet = await get_or_create_wallet(uid)
    if body.type == "debit" and u.get("role") == "agent" and wallet["balance"] < body.amount:
        raise HTTPException(400, f"Insufficient wallet balance. User has ₹{wallet['balance']:.2f}")
        
    new_balance = await adjust_balance(uid, delta)
    
    note = body.note or f"Balance adjusted by Super Admin ({body.type})"
    await ledger_entry(
        user_id=uid,
        kind=body.type,
        amount=body.amount,
        balance_after=new_balance,
        ref_type="admin_adjustment",
        ref_id=user["id"],
        note=note
    )
    
    await write_audit(
        user_id=user["id"],
        action="adjust_balance",
        target=uid,
        meta={"amount": body.amount, "type": body.type, "note": note},
        request=request
    )
    
    await manager.send_to_user(uid, {"event": "recharge_updated", "data": {}})
    
    return {"ok": True, "new_balance": new_balance}


@api.patch("/distributor/agents/{uid}/freeze")
async def distributor_freeze(uid: str, request: Request, user=Depends(require_approved_distributor())):
    u = await db.users.find_one({"id": uid, "parent_id": user["id"]})
    if not u:
        raise HTTPException(404, "Not found")
    await db.users.update_one({"id": uid}, {"$set": {"frozen": not u.get("frozen", False)}})
    await write_audit(user["id"], "toggle_freeze", target=uid, request=request)
    return {"frozen": not u.get("frozen", False)}

@api.get("/distributor/agents")
async def distributor_list_agents(user=Depends(require_approved_distributor())):
    items = await db.users.find({"parent_id": user["id"], "is_deleted": False}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    wallets_map = await _wallet_balances_for([it["id"] for it in items])
    for it in items:
        it["wallet_balance"] = wallets_map.get(it["id"], 0)
    return items


# ---------- MASTER DISTRIBUTOR PANEL ----------
@api.get("/master-distributor/distributors")
async def md_list_distributors(user=Depends(require_approved_md())):
    """List all distributors created by this MD, enriched with earnings."""
    items = await db.users.find(
        {"md_id": user["id"], "role": "distributor", "is_deleted": False},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(None)
    earnings_map = await _distributor_earnings_batch([it["id"] for it in items])
    for it in items:
        it["earnings"] = earnings_map.get(it["id"], 0.0)
    return items


@api.get("/master-distributor/agents")
async def md_list_agents(user=Depends(require_approved_md())):
    """List EVERY agent in this MD's downline (via distributors + direct)."""
    items = await db.users.find(
        {"md_id": user["id"], "role": "agent", "is_deleted": False},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(None)
    wallets_map = await _wallet_balances_for([it["id"] for it in items])
    # Build parent-name map (parent is either MD themselves or a distributor).
    parent_ids = list({it.get("parent_id") for it in items if it.get("parent_id")})
    parent_map = await _build_parent_name_map(parent_ids)
    for it in items:
        it["wallet_balance"] = wallets_map.get(it["id"], 0)
        if it.get("created_by_role") == "master_distributor":
            it["creator_name"] = "Direct"
        else:
            it["creator_name"] = parent_map.get(it.get("parent_id"), "—")
    return items


@api.get("/master-distributor/recharges")
async def md_list_downline_recharges(
    status: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    paginated: bool = False,
    user=Depends(require_approved_md())
):
    """Read-only view of recharges from every agent in the MD's downline with filtering and 20-20 pagination."""
    agent_ids = [u["id"] async for u in db.users.find(
        {"md_id": user["id"], "role": "agent"}, {"_id": 0, "id": 1}
    )]
    if not agent_ids:
        return {"items": [], "total": 0, "page": page, "page_size": page_size} if paginated else []
    
    query = _build_recharge_query(
        status=status, from_ts=from_ts, to_ts=to_ts, q=q, amount=amount
    )
    query["user_id"] = {"$in": agent_ids}

    # Summary stats for the selected date range and filter
    stats_query = {k: v for k, v in query.items() if k != "status"}
    pipeline = [
        {"$match": stats_query},
        {"$group": {
            "_id": "$status",
            "total_amount": {"$sum": "$amount"},
            "md_earnings": {"$sum": "$md_earnings_amount"},
            "count": {"$sum": 1}
        }}
    ]
    cursor = db.recharges.aggregate(pipeline)
    rows = await cursor.to_list(100)

    stats = {
        "approved_amount": 0.0, "approved_count": 0,
        "pending_amount": 0.0, "pending_count": 0,
        "rejected_amount": 0.0, "rejected_count": 0,
        "earnings": 0.0
    }
    for row in rows:
        st = row.get("_id")
        amt = round(float(row.get("total_amount") or 0.0), 2)
        cnt = int(row.get("count") or 0)
        earn = round(float(row.get("md_earnings") or 0.0), 2)
        if st == "approved":
            stats["approved_amount"] = amt
            stats["approved_count"] = cnt
            stats["earnings"] = earn
        elif st == "pending":
            stats["pending_amount"] = amt
            stats["pending_count"] = cnt
        elif st == "rejected":
            stats["rejected_amount"] = amt
            stats["rejected_count"] = cnt

    if paginated:
        page = max(1, page); page_size = max(1, min(200, page_size))
        total_task = db.recharges.count_documents(query)
        items_task = db.recharges.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        total, items = await asyncio.gather(total_task, items_task)
        return {"items": items, "total": total, "page": page, "page_size": page_size, "stats": stats}

    return await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)


@api.get("/master-distributor/stats")
async def md_stats(user=Depends(require_approved_md())):
    md_id = user["id"]
    agent_ids = [u["id"] async for u in db.users.find({"md_id": md_id, "role": "agent"}, {"_id": 0, "id": 1})]

    async def _zero(): return 0
    pr_task = db.recharges.count_documents({"user_id": {"$in": agent_ids}, "status": "pending"}) if agent_ids else _zero()

    d_task = db.users.count_documents({"md_id": md_id, "role": "distributor", "is_deleted": False})
    a_task = db.users.count_documents({"md_id": md_id, "role": "agent", "is_deleted": False})
    ar_task = db.recharges.count_documents({"md_id": md_id, "status": "approved"})
    earn_task = _md_earnings_for(md_id)
    today_task = _md_today_earnings(md_id)
    avail_task = get_md_available_for_withdrawal(md_id)

    distributors_count, agents_count, pending_recharges, approved_recharges, earnings, today_earnings, available_for_withdrawal = await asyncio.gather(
        d_task, a_task, pr_task, ar_task, earn_task, today_task, avail_task
    )

    return {
        "distributors": distributors_count,
        "agents": agents_count,
        "pending_recharges": pending_recharges,
        "approved_recharges": approved_recharges,
        "earnings": earnings,
        "today_earnings": today_earnings,
        "available_for_withdrawal": available_for_withdrawal,
    }


@api.patch("/master-distributor/users/{uid}/freeze")
async def md_freeze(uid: str, request: Request, user=Depends(require_approved_md())):
    """MD can freeze/unfreeze users in their OWN downline only."""
    u = await db.users.find_one({"id": uid, "md_id": user["id"]})
    if not u:
        raise HTTPException(404, "Not found in your downline")
    await db.users.update_one({"id": uid}, {"$set": {"frozen": not u.get("frozen", False)}})
    await write_audit(user["id"], "toggle_freeze", target=uid, request=request)
    return {"frozen": not u.get("frozen", False)}


# ---------- WALLET ----------
@api.get("/wallet")
async def my_wallet(user=Depends(get_current_user)):
    if user["role"] == "admin":
        return {"balance": 0, "t1_balance": 0, "hold_balance": 0, "hold_active": False}
    if user["role"] == "master_distributor":
        earnings = await _md_earnings_for(user["id"])
        return {"balance": earnings, "t1_balance": 0, "hold_balance": 0, "hold_active": False}
    if user["role"] == "distributor":
        earnings = await _distributor_earnings_for(user["id"])
        return {"balance": earnings, "t1_balance": 0, "hold_balance": 0, "hold_active": False}
    if user["role"] == "agent":
        try:
            await run_t1_daily_settlement()
        except Exception as e:
            logger.error(f"Auto T+1 settlement error in /wallet: {e}")
    w = await get_or_create_wallet(user["id"])
    return w

@api.get("/admin/t1-total")
async def admin_t1_total(user=Depends(require_roles("admin"))):
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT COALESCE(SUM(t1_balance), 0) as total FROM wallets")
        total = float(row["total"])
    return {"total": total}

@api.post("/admin/t1-settlement/run")
async def admin_trigger_t1_settlement(user=Depends(require_roles("admin"))):
    """Manually trigger T+1 settlement for all past eligible T+1 recharges right now."""
    res = await run_t1_daily_settlement()
    return res

@api.get("/admin/t1-settlement/status")
async def admin_t1_settlement_status(user=Depends(require_roles("admin"))):
    """View current T+1 balance total and pending unsettled T+1 recharges count."""
    await run_t1_daily_settlement()
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT COALESCE(SUM(t1_balance), 0) as total FROM wallets")
        t1_sum = float(row["total"]) if row else 0.0
        
    unsettled_count = await db.recharges.count_documents({
        "status": "approved",
        "is_t1": True,
        "settled_t1": {"$ne": True}
    })
    
    return {
        "total_t1_balance": t1_sum,
        "pending_unsettled_recharges": unsettled_count,
        "next_scheduled_run": "Daily at 11:30 AM IST (06:00 UTC)"
    }

@api.get("/admin/hold-total")
async def admin_hold_total(user=Depends(require_roles("admin"))):
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow("SELECT COALESCE(SUM(hold_balance), 0) as total FROM wallets")
        total = float(row["total"])
    return {"total": total}

_bbps_cache = {"data": None, "timestamp": 0.0}

@api.get("/admin/bbps-balance")
async def admin_bbps_balance(user=Depends(require_roles("admin"))):
    try:
        res = await call_irise_api("GET", "balance")
        val = 0.0
        if isinstance(res, dict):
            data_field = res.get("data")
            if isinstance(data_field, dict):
                val = data_field.get("balance", data_field.get("wallet_balance", 0.0))
            elif "balance" in res:
                val = res.get("balance", 0.0)
        try:
            val = float(val or 0.0)
        except Exception:
            val = 0.0
        return {"status": "success", "data": {"balance": val}, "balance": val}
    except Exception as e:
        logger.error(f"Failed to fetch BBPS balance from external API: {e}")
        return {"status": "error", "data": {"balance": 0.0}, "balance": 0.0}

@api.get("/wallet/ledger")
async def my_ledger(user=Depends(get_current_user)):
    items = await db.ledger.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

def get_dashboard_range_dates(range_type: str, from_date_str: Optional[str] = None, to_date_str: Optional[str] = None):
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_offset)
    today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)

    if range_type == "today":
        return today_start.isoformat(), today_end.isoformat()
    elif range_type == "yesterday":
        yest_start = today_start - timedelta(days=1)
        yest_end = yest_start.replace(hour=23, minute=59, second=59, microsecond=999999)
        return yest_start.isoformat(), yest_end.isoformat()
    elif range_type == "last_7_days":
        start_7 = today_start - timedelta(days=6)
        return start_7.isoformat(), today_end.isoformat()
    elif range_type == "last_30_days":
        start_30 = today_start - timedelta(days=29)
        return start_30.isoformat(), today_end.isoformat()
    elif range_type == "this_month":
        start_month = today_start.replace(day=1)
        return start_month.isoformat(), today_end.isoformat()
    elif range_type == "custom" and from_date_str and to_date_str:
        try:
            f_dt = datetime.strptime(from_date_str, "%Y-%m-%d").replace(tzinfo=ist_offset, hour=0, minute=0, second=0)
            t_dt = datetime.strptime(to_date_str, "%Y-%m-%d").replace(tzinfo=ist_offset, hour=23, minute=59, second=59)
            return f_dt.isoformat(), t_dt.isoformat()
        except Exception:
            return None, None
    elif range_type == "all_time":
        return None, None

    return today_start.isoformat(), today_end.isoformat()

@api.get("/agent/dashboard-stats")
async def get_agent_dashboard_stats(
    range_type: Optional[str] = Query("today"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    user=Depends(require_roles("agent"))
):
    from_iso, to_iso = get_dashboard_range_dates(range_type, from_date, to_date)

    wallet_task = get_or_create_wallet(user["id"])

    qr_match = {"user_id": user["id"], "status": "approved"}
    bill_match = {"user_id": user["id"], "status": "success"}
    pr_match = {"user_id": user["id"], "status": "pending"}
    pb_match = {"user_id": user["id"], "status": "pending", "type": "credit_card"}
    pw_match = {"user_id": user["id"], "status": "pending"}

    if from_iso or to_iso:
        rng = {}
        if from_iso:
            rng["$gte"] = from_iso
        if to_iso:
            rng["$lte"] = to_iso
        qr_match["created_at"] = rng
        bill_match["created_at"] = rng
        pr_match["created_at"] = rng
        pb_match["created_at"] = rng
        pw_match["created_at"] = rng

    qr_task = db.recharges.aggregate([
        {"$match": qr_match},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)

    bill_task = db.transactions.aggregate([
        {"$match": bill_match},
        {"$group": {"_id": None, "total": {"$sum": "$bill_amount"}}}
    ]).to_list(1)

    pr_task = db.recharges.count_documents(pr_match)
    pb_task = db.transactions.count_documents(pb_match)
    pw_task = db.withdrawals.count_documents(pw_match)

    wallet, qr_list, bill_list, pending_recharges, pending_bills, pending_withdrawals = await asyncio.gather(
        wallet_task, qr_task, bill_task, pr_task, pb_task, pw_task
    )

    balance = wallet.get("balance", 0.0)
    qr_sum = qr_list[0]["total"] if qr_list else 0.0
    bill_sum = bill_list[0]["total"] if bill_list else 0.0

    return {
        "wallet_balance": balance,
        "qr_payment": qr_sum,
        "live_bill_payment": bill_sum,
        "pending_requests": pending_recharges + pending_bills + pending_withdrawals,
        "range_type": range_type,
        "from_date": from_iso,
        "to_date": to_iso
    }

# ---------- LIST FILTER HELPERS (server-side pagination) ----------
def _escape_regex(s: str) -> str:
    return re.escape(s)


def _add_created_at_range(query: dict, from_ts: Optional[str], to_ts: Optional[str]) -> None:
    """Apply an [from_ts, to_ts) range filter on the `created_at` field (ISO string compare)."""
    if not (from_ts or to_ts):
        return
    rng: dict = {}
    if from_ts:
        rng["$gte"] = from_ts
    if to_ts:
        rng["$lt"] = to_ts
    query["created_at"] = rng


def _build_amount_subquery(amount_str: str, fields=("bill_amount", "amount", "total_amount")) -> dict:
    if not amount_str or not str(amount_str).strip():
        return {}
    clean_amt = str(amount_str).strip().replace("₹", "").replace(",", "")
    if not clean_amt:
        return {}
    
    or_conds = []
    for f in fields:
        or_conds.append({f: {"$regex": clean_amt}})
    
    try:
        val = float(clean_amt)
        for f in fields:
            or_conds.append({f: val})
        if "." not in clean_amt:
            for f in fields:
                or_conds.append({"$and": [{f: {"$gte": val}}, {f: {"$lt": val + 1.0}}]})
    except ValueError:
        pass
    
    return {"$or": or_conds}


def _build_recharge_query(*, status=None, agent_id=None, qr_code_id=None,
                           from_ts=None, to_ts=None, q=None, amount=None,
                           agent_search=None, qr_search=None) -> dict:
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if agent_id and agent_id != "all":
        query["user_id"] = agent_id
    if qr_code_id and qr_code_id != "all":
        query["qr_code_id"] = qr_code_id
    if agent_search and agent_search.strip():
        query["user_name"] = {"$regex": agent_search.strip(), "$options": "i"}
    if qr_search and qr_search.strip():
        query["qr_code_label"] = {"$regex": qr_search.strip(), "$options": "i"}
    _add_created_at_range(query, from_ts, to_ts)
    
    q_cond = None
    if q:
        needle = _escape_regex(q.strip())
        if needle:
            q_cond = {"$or": [
                {"user_name": {"$regex": needle, "$options": "i"}},
                {"utr": {"$regex": needle, "$options": "i"}},
                {"card_last4": {"$regex": needle, "$options": "i"}},
            ]}
    
    amt_cond = _build_amount_subquery(amount, fields=("amount", "gross_amount", "net_credit_amount")) if amount else None
    
    if q_cond and amt_cond:
        query["$and"] = [q_cond, amt_cond]
    elif q_cond:
        query["$or"] = q_cond["$or"]
    elif amt_cond:
        query["$or"] = amt_cond["$or"]

    return query


def get_short_txn_id(id_str: str) -> str:
    if not id_str:
        return "—"
    if id_str.startswith("Txn"):
        return id_str
    hash_val = 0
    for char in id_str:
        hash_val = (hash_val * 31 + ord(char)) & 0xFFFFFFFF
    padded = str(hash_val).zfill(10)
    return f"Txn{padded}"


def _build_transaction_query(*, status=None, agent_id=None, operator=None,
                              from_ts=None, to_ts=None, q=None, amount=None, txn_type=None,
                              txn_id=None, api_txn_id=None, matched_ids=None,
                              agent_search=None, bank_search=None, card_search=None) -> dict:
    query: dict = {}
    if txn_type and txn_type != "all":
        if txn_type in ("credit_card", "cc"):
            query["type"] = {"$in": ["credit_card", "cc"]}
        else:
            query["type"] = txn_type
    if status and status != "all":
        query["status"] = status
    if agent_id and agent_id != "all":
        query["user_id"] = agent_id
    if operator and operator != "all":
        query["operator"] = operator
    if agent_search and agent_search.strip():
        query["user_name"] = {"$regex": agent_search.strip(), "$options": "i"}
    if bank_search and bank_search.strip():
        query["operator"] = {"$regex": bank_search.strip(), "$options": "i"}
    if card_search and card_search.strip():
        query["card_last4"] = {"$regex": card_search.strip(), "$options": "i"}
    if txn_id and txn_id.strip():
        if matched_ids is not None:
            query["id"] = {"$in": matched_ids}
        else:
            query["id"] = {"$regex": txn_id.strip(), "$options": "i"}
    if api_txn_id and api_txn_id.strip():
        query["operator_txn_id"] = {"$regex": api_txn_id.strip(), "$options": "i"}
    _add_created_at_range(query, from_ts, to_ts)

    q_cond = None
    if q:
        needle = _escape_regex(q.strip())
        if needle:
            q_cond = {"$or": [
                {"user_name": {"$regex": needle, "$options": "i"}},
                {"customer_name": {"$regex": needle, "$options": "i"}},
                {"customer_phone": {"$regex": needle, "$options": "i"}},
                {"operator": {"$regex": needle, "$options": "i"}},
                {"card_last4": {"$regex": needle, "$options": "i"}},
            ]}
    
    amt_cond = _build_amount_subquery(amount, fields=("bill_amount", "amount", "total_amount")) if amount else None

    if q_cond and amt_cond:
        query["$and"] = [q_cond, amt_cond]
    elif q_cond:
        query["$or"] = q_cond["$or"]
    elif amt_cond:
        query["$or"] = amt_cond["$or"]

    return query


def _build_withdrawal_query(*, status=None, role_filter=None,
                             from_ts=None, to_ts=None, q=None, amount=None) -> dict:
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if role_filter and role_filter != "all":
        query["role"] = role_filter
    _add_created_at_range(query, from_ts, to_ts)

    q_cond = None
    if q:
        needle = _escape_regex(q.strip())
        if needle:
            q_cond = {"$or": [
                {"user_name": {"$regex": needle, "$options": "i"}},
                {"bank.account_holder": {"$regex": needle, "$options": "i"}},
                {"bank.account_number": {"$regex": needle, "$options": "i"}},
                {"bank.ifsc": {"$regex": needle, "$options": "i"}},
                {"bank.bank_name": {"$regex": needle, "$options": "i"}},
                {"bank.phone_number": {"$regex": needle, "$options": "i"}},
            ]}

    amt_cond = _build_amount_subquery(amount, fields=("amount",)) if amount else None

    if q_cond and amt_cond:
        query["$and"] = [q_cond, amt_cond]
    elif q_cond:
        query["$or"] = q_cond["$or"]
    elif amt_cond:
        query["$or"] = amt_cond["$or"]

    return query


def _build_audit_query(*, action=None, from_ts=None, to_ts=None, q=None) -> dict:
    query: dict = {}
    if action and action != "all":
        query["action"] = action
    _add_created_at_range(query, from_ts, to_ts)
    if q:
        needle = _escape_regex(q.strip())
        if needle:
            query["$or"] = [
                {"action": {"$regex": needle, "$options": "i"}},
                {"target": {"$regex": needle, "$options": "i"}},
                {"ip": {"$regex": needle, "$options": "i"}},
            ]
    return query


# ---------- RECHARGE REQUESTS ----------
def _check_t1_permission(user: dict):
    if user.get("role") == "agent":
        t1_enabled = bool(user.get("t1_enabled", False))
        t1_rate = float(user.get("t1_commission_percent") or 0.0)
        if not t1_enabled or t1_rate <= 0:
            raise HTTPException(400, "T+1 Recharge service is not enabled for your account.")

@api.get("/agent/active-qr")
async def active_qr(is_t1: bool = False, user=Depends(require_roles("agent", "distributor"))):
    if user["role"] == "agent" and user.get("kyc_status") != "approved":
        raise HTTPException(403, "KYC is pending or rejected. Services are locked.")
    if is_t1:
        _check_t1_permission(user)
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    enabled = bool(s.get("t1_qr_enabled", True)) if is_t1 else bool(s.get("qr_enabled", True))
    if not enabled:
        return {}
    qr = await db.qr_codes.find_one({"active": True, "is_t1": is_t1, "is_deleted": False}, {"_id": 0})
    return qr or {}

@api.get("/agent/qr-list-24h")
async def agent_qr_list_24h(is_t1: bool = False, user=Depends(require_roles("agent", "distributor"))):
    if user["role"] == "agent" and user.get("kyc_status") != "approved":
        raise HTTPException(403, "KYC is pending or rejected. Services are locked.")
    if is_t1:
        _check_t1_permission(user)
    
    from datetime import datetime, timedelta
    tf_hours_ago = (datetime.utcnow() - timedelta(hours=24)).isoformat() + "Z"
    
    query = {
        "is_deleted": False,
        "is_t1": is_t1,
        "$or": [
            {"active": True},
            {"created_at": {"$gte": tf_hours_ago}}
        ]
    }
    
    qrs = await db.qr_codes.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return qrs

@api.post("/agent/recharges")
async def agent_create_recharge(body: RechargeIn, user=Depends(require_approved_agent())):
    if body.is_t1:
        _check_t1_permission(user)
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    min_limit = float(s.get("min_recharge_limit", 100))
    max_limit = float(s.get("max_recharge_limit", 300000))
    
    if body.amount is None or body.amount < min_limit:
        raise HTTPException(400, f"Minimum recharge amount is ₹{min_limit:,.2f}")
    if body.amount > max_limit:
        raise HTTPException(400, f"Maximum recharge amount is ₹{max_limit:,.2f}")
    utr = (body.utr or "").strip()
    if not utr:
        raise HTTPException(400, "UTR / Reference is required")
    if not utr.isdigit():
        raise HTTPException(400, "UTR must contain only digits")
    if len(utr) != 12:
        raise HTTPException(400, "UTR must be exactly 12 digits")
    if not body.card_last4 or not body.card_last4.isdigit() or len(body.card_last4) != 4:
        raise HTTPException(400, "Please enter exactly 4 digits")

    # Idempotency guard — reject duplicate UTR across all agents if a prior
    # pending/approved recharge with that UTR already exists. Rejected recharges
    # do NOT block re-submission (admin may have asked the agent to retry).
    duplicate = await db.recharges.find_one(
        {"utr": utr, "status": {"$in": ["pending", "approved"]}},
        {"_id": 0, "id": 1},
    )
    if duplicate:
        raise HTTPException(
            409,
            "This UTR has already been submitted. If you believe this is an error, please contact the admin.",
        )

    selected_qr = None
    if body.older_qr and body.selected_qr_code_id:
        selected_qr = await db.qr_codes.find_one({"id": body.selected_qr_code_id, "is_deleted": False}, {"_id": 0})
    if not selected_qr:
        selected_qr = await db.qr_codes.find_one({"active": True, "is_t1": body.is_t1, "is_deleted": False}, {"_id": 0})
    
    if body.is_t1:
        comm_pct = user.get("t1_commission_percent")
        if comm_pct is None:
            comm_pct = 0.0
    else:
        comm_pct = user.get("commission_percent", 1.2)
        
    doc = {
        "id": new_id(),
        "user_id": user["id"],
        "user_name": user["full_name"],
        "amount": body.amount,
        "utr": utr,
        "card_last4": body.card_last4,
        "qr_code_id": selected_qr["id"] if selected_qr else None,
        "qr_code_label": selected_qr["label"] if selected_qr else None,
        "screenshot_path": body.screenshot_path,
        "older_qr": body.older_qr or False,
        "status": "pending",
        "commission_percent": float(comm_pct),
        "is_t1": body.is_t1 or False,
        "commission_amount": 0,
        "credit_amount": 0,
        "ocr_utr": body.ocr_utr,
        "ocr_amount": body.ocr_amount,
        "ocr_qr_name": body.ocr_qr_name,
        "ocr_match": body.ocr_match or False,
        "ocr_bypass": body.ocr_bypass or False,
        "note": "",
        "created_at": now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
    }
    try:
        await db.recharges.insert_one(dict(doc))
    except DuplicateKeyError:
        # Race-condition safety net: two parallel POSTs both passed the
        # application-level check; the partial unique index catches the loser.
        raise HTTPException(
            409,
            "This UTR has already been submitted. If you believe this is an error, please contact the admin.",
        )
    s_set = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    req_audio_enabled = bool(s_set.get("qr_request_received_audio_enabled", True))
    req_audio = s_set.get("qr_request_received_audio", "") if req_audio_enabled else ""
    await manager.send_to_role("admin", {"event": "recharge_created", "data": {**clean(doc), "audio_url": req_audio, "audio_enabled": req_audio_enabled}})
    asyncio.create_task(send_onesignal_notification(
        title="🚨 New QR Request Received!",
        message=f"₹{body.amount:,.2f} request from {user.get('full_name', 'Agent')}",
        target_roles=["admin"],
        url="https://makfinpay.com/admin/recharges"
    ))
    return clean(doc)

@api.get("/agent/recharges")
async def agent_list_recharges(user=Depends(require_roles("agent"))):
    return await db.recharges.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.get("/admin/recharges/stats")
async def admin_recharges_stats(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    qr_code_id: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    agent_search: Optional[str] = None,
    qr_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    query = _build_recharge_query(
        status=status, agent_id=agent_id, qr_code_id=qr_code_id,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount,
        agent_search=agent_search, qr_search=qr_search
    )
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$status",
            "total_amount": {"$sum": "$amount"},
            "count": {"$sum": 1}
        }}
    ]
    cursor = db.recharges.aggregate(pipeline)
    rows = await cursor.to_list(100)
    
    res = {}
    for r in rows:
        status_key = r["_id"] or "unknown"
        res[status_key] = {
            "amount": round(r["total_amount"], 2),
            "count": r["count"]
        }
    return res

def get_admin_display_name(u: dict) -> str:
    if not u or not isinstance(u, dict):
        return "Admin"
    name = (u.get("full_name") or "").strip()
    email = (u.get("email") or "").strip().lower()
    
    if email == "jigs.vanani@gmail.com":
        if not name or name.lower() in ["super admin", "admin"]:
            return "Jignesh Vanani"
        return name

    if name and name.lower() not in ["super admin", "admin"]:
        return name
        
    if email:
        username = email.split("@")[0].replace(".", " ").replace("_", " ").title()
        return username
        
    return "Admin"

async def _enrich_reviewed_by_names(items: list) -> list:
    if not items or not isinstance(items, list):
        return items
    rb_ids = list({str(it.get("reviewed_by")) for it in items if it.get("reviewed_by")})
    if not rb_ids:
        return items
    try:
        users = await db.users.find({"id": {"$in": rb_ids}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1}).to_list(len(rb_ids))
        user_map = {str(u["id"]): get_admin_display_name(u) for u in users}
        for it in items:
            rb = str(it.get("reviewed_by")) if it.get("reviewed_by") else None
            curr = str(it.get("reviewed_by_name") or "").strip()
            if rb:
                if not curr or curr.lower() in ["super admin", "admin"]:
                    it["reviewed_by_name"] = user_map.get(rb) or "Admin"
    except Exception as e:
        logger.warning(f"Error enriching reviewed_by_names: {e}")
    return items

@api.get("/admin/recharges")
async def admin_list_recharges(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    qr_code_id: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    agent_search: Optional[str] = None,
    qr_search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    paginated: bool = False,
    fields: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    query = _build_recharge_query(
        status=status, agent_id=agent_id, qr_code_id=qr_code_id,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount,
        agent_search=agent_search, qr_search=qr_search
    )
    proj = {"_id": 0}
    if fields:
        proj = {f.strip(): 1 for f in fields.split(",") if f.strip()}

    if paginated:
        page = max(1, page); page_size = max(1, min(200, page_size))
        total_task = db.recharges.count_documents(query)
        items_task = db.recharges.find(query, proj).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        total, items = await asyncio.gather(total_task, items_task)
        items = await _enrich_reviewed_by_names(items)
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    # Legacy caller (no pagination requested) — full list, no cap.
    items = await db.recharges.find(query, proj).sort("created_at", -1).to_list(None)
    return await _enrich_reviewed_by_names(items)

@api.get("/admin/recharges/export/pdf")
async def export_recharges_pdf(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    qr_code_id: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    agent_search: Optional[str] = None,
    qr_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    query = _build_recharge_query(
        status=status, agent_id=agent_id, qr_code_id=qr_code_id,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount,
        agent_search=agent_search, qr_search=qr_search
    )
    items = await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    pdf_bytes = await asyncio.to_thread(_render_recharges_pdf, items)
    fname = f"Recharge_Approvals_{now_iso()[:10]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )

@api.get("/admin/recharges/export/csv")
async def export_recharges_csv(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    qr_code_id: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    agent_search: Optional[str] = None,
    qr_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    query = _build_recharge_query(
        status=status, agent_id=agent_id, qr_code_id=qr_code_id,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount,
        agent_search=agent_search, qr_search=qr_search
    )
    items = await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Agent Name", "Amount", "UTR", "QR Code Label", "Account/Card", "Comm %", "Comm Charge", "Admin Profit", "Net Credit", "Status", "Created At"])
    for r in items:
        comm_charge = r.get("commission_amount", 0.0) if r.get("status") == "approved" else (r.get("amount", 0) * r.get("commission_percent", 0) / 100)
        net_credit = r.get("credit_amount", 0.0) if r.get("status") == "approved" else 0.0
        writer.writerow([
            r.get("user_name", ""),
            r.get("amount", 0),
            r.get("utr", ""),
            r.get("qr_code_label", ""),
            r.get("card_last4", ""),
            f"{r.get('commission_percent', 0)}%",
            comm_charge,
            r.get("admin_revenue_amount", comm_charge),
            net_credit,
            r.get("status", ""),
            r.get("created_at", "")
        ])
    
    csv_str = "\ufeff" + output.getvalue()
    fname = f"Recharge_Approvals_{now_iso()[:10]}.csv"
    return Response(
        content=csv_str.encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )

@api.get("/admin/recharge-gallery")
async def get_recharge_gallery(user=Depends(require_roles("admin"))):
    query = {"screenshot_path": {"$ne": "", "$exists": True}, "status": "approved"}
    items = await db.recharges.find(query, {
        "id": 1,
        "amount": 1,
        "utr": 1,
        "screenshot_path": 1,
        "created_at": 1,
        "qr_code_label": 1,
        "status": 1
    }).sort("created_at", -1).to_list(1500)
    return items

@api.get("/admin/recharge-gallery/zip")
async def download_recharge_gallery_zip(
    qr_code_label: str,
    auth: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Auth required")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_aud": False})
        role = payload.get("user_role") or payload.get("role")
        if role != "admin":
            raise HTTPException(403, "Forbidden")
    except Exception:
        raise HTTPException(401, "Invalid token")

    query = {
        "screenshot_path": {"$ne": "", "$exists": True},
        "qr_code_label": qr_code_label,
        "status": "approved"
    }
    items = await db.recharges.find(query, {
        "id": 1,
        "amount": 1,
        "screenshot_path": 1,
        "created_at": 1
    }).to_list(10000)

    if not items:
        raise HTTPException(400, "No approved payment proofs found for this merchant")

    import io
    import zipfile
    from fastapi.responses import StreamingResponse

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for idx, item in enumerate(items):
            path = item["screenshot_path"]
            if not path:
                continue
            try:
                data, _ = get_object(path)
                ext = "png"
                if "." in path:
                    ext = path.split(".")[-1].split("?")[0]
                filename = f"{idx + 1}_{int(item['amount'])}_{item['id']}.{ext}"
                zip_file.writestr(filename, data)
            except Exception as e:
                print(f"Failed to zip item {item['id']} at {path}: {str(e)}")
                continue

    zip_buffer.seek(0)
    safe_label = "".join(c for c in qr_code_label if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    
    headers = {
        "Content-Disposition": f"attachment; filename=gallery_{safe_label}.zip"
    }
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)

@api.get("/distributor/recharges")
async def distributor_list_recharges(
    status: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    paginated: bool = False,
    user=Depends(require_approved_distributor())
):
    """Read-only view of recharges from every agent in Distributor's network with filtering and 20-20 pagination."""
    agent_ids = [u["id"] async for u in db.users.find({"parent_id": user["id"]}, {"_id": 0, "id": 1})]
    if not agent_ids:
        return {"items": [], "total": 0, "page": page, "page_size": page_size} if paginated else []

    query = _build_recharge_query(
        status=status, from_ts=from_ts, to_ts=to_ts, q=q, amount=amount
    )
    query["user_id"] = {"$in": agent_ids}

    # Summary stats for the selected date range and filter
    stats_query = {k: v for k, v in query.items() if k != "status"}
    pipeline = [
        {"$match": stats_query},
        {"$group": {
            "_id": "$status",
            "total_amount": {"$sum": "$amount"},
            "dist_earnings": {"$sum": "$distributor_earnings_amount"},
            "count": {"$sum": 1}
        }}
    ]
    cursor = db.recharges.aggregate(pipeline)
    rows = await cursor.to_list(100)

    stats = {
        "approved_amount": 0.0, "approved_count": 0,
        "pending_amount": 0.0, "pending_count": 0,
        "rejected_amount": 0.0, "rejected_count": 0,
        "earnings": 0.0
    }
    for row in rows:
        st = row.get("_id")
        amt = round(float(row.get("total_amount") or 0.0), 2)
        cnt = int(row.get("count") or 0)
        earn = round(float(row.get("dist_earnings") or 0.0), 2)
        if st == "approved":
            stats["approved_amount"] = amt
            stats["approved_count"] = cnt
            stats["earnings"] = earn
        elif st == "pending":
            stats["pending_amount"] = amt
            stats["pending_count"] = cnt
        elif st == "rejected":
            stats["rejected_amount"] = amt
            stats["rejected_count"] = cnt

    if paginated:
        page = max(1, page); page_size = max(1, min(200, page_size))
        total_task = db.recharges.count_documents(query)
        items_task = db.recharges.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        total, items = await asyncio.gather(total_task, items_task)
        return {"items": items, "total": total, "page": page, "page_size": page_size, "stats": stats}

    return await db.recharges.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api.post("/admin/recharges/{rid}/approve")
async def admin_approve_recharge(rid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    r = await db.recharges.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Not found")
    if r.get("status") != "pending":
        raise HTTPException(400, "This recharge request has already been processed or does not exist.")

    res = await db.execute_query(
        "UPDATE recharges SET status = 'approved' WHERE id = $1 AND status = 'pending'",
        [rid]
    )
    if not res or res.get("row_count", 0) == 0:
        raise HTTPException(400, "This recharge request has already been processed or does not exist.")

    # ---- Snapshot live commission state into the recharge record (one-way write) ----
    is_t1_request = r.get("is_t1", False)
    
    agent = await db.users.find_one({"id": r["user_id"]},
                                     {"_id": 0, "id": 1, "parent_id": 1, "md_id": 1,
                                      "created_by_role": 1,
                                      "base_commission": 1, "markup_commission": 1,
                                      "total_commission": 1, "commission_percent": 1,
                                      "admin_pct": 1, "md_pct": 1, "dist_pct": 1,
                                      "t1_commission_percent": 1})

    parent_id = agent.get("parent_id")
    md_id_snapshot = agent.get("md_id")
    distributor_id = parent_id if (agent.get("created_by_role") == "distributor" and parent_id) else None

    gross = float(r["amount"])

    if is_t1_request:
        # T+1 Recharge: commission goes entirely to admin. MD and distributor get 0.
        total_pct = float(r.get("commission_percent") if r.get("commission_percent") is not None else (agent.get("t1_commission_percent") or 0.0))
        admin_pct = total_pct
        md_pct = 0.0
        dist_pct = 0.0
        
        total_commission_amount = round(gross * total_pct / 100.0, 2)
        admin_revenue_amount    = total_commission_amount
        md_earnings_amount      = 0.0
        distributor_earnings_amount = 0.0
        net_credit_amount = round(gross - total_commission_amount, 2)
        
        new_balance = await adjust_t1_balance(r["user_id"], net_credit_amount)
    else:
        # Regular recharge:
        admin_pct = agent.get("admin_pct")
        md_pct = agent.get("md_pct")
        dist_pct = agent.get("dist_pct")
        total_pct = float(agent.get("total_commission", agent.get("commission_percent", 0.0)) or 0.0)
        if admin_pct is None or md_pct is None or dist_pct is None:
            # Legacy record (no MD chain): admin_pct = base_commission, dist_pct = markup, md_pct = 0.
            legacy_base = float(agent.get("base_commission") or 0.0)
            legacy_markup = float(agent.get("markup_commission") or 0.0)
            admin_pct = legacy_base
            md_pct = 0.0
            dist_pct = legacy_markup
        admin_pct = float(admin_pct); md_pct = float(md_pct); dist_pct = float(dist_pct)

        total_commission_amount = round(gross * total_pct / 100.0, 2)
        admin_revenue_amount    = round(gross * admin_pct / 100.0, 2)
        md_earnings_amount      = round(gross * md_pct / 100.0, 2)
        # Force distributor amount so admin + md + dist == total exactly (no float drift).
        distributor_earnings_amount = round(total_commission_amount - admin_revenue_amount - md_earnings_amount, 2)
        net_credit_amount = round(gross - total_commission_amount, 2)

        new_balance = await adjust_balance(r["user_id"], net_credit_amount)

    await db.recharges.update_one({"id": rid}, {"$set": {
        "status": "approved",
        # Legacy fields kept for backward compat:
        "commission_amount": total_commission_amount,
        "credit_amount": net_credit_amount,
        # Immutable snapshot — never recomputed once written:
        "agent_id": r["user_id"],
        "distributor_id": distributor_id,
        "md_id": md_id_snapshot,
        "gross_amount": gross,
        "commission_percent_used": total_pct,
        "admin_commission_percent": admin_pct,
        "md_commission_percent": md_pct,
        "distributor_markup_percent": dist_pct,
        "total_commission_amount": total_commission_amount,
        "admin_revenue_amount": admin_revenue_amount,
        "md_earnings_amount": md_earnings_amount,
        "distributor_earnings_amount": distributor_earnings_amount,
        "net_credit_amount": net_credit_amount,
        "note": body.note or "",
        "reviewed_at": now_iso(),
        "reviewed_by": user["id"],
        "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin",
    }})
    await asyncio.gather(
        ledger_entry(r["user_id"], "t1_pending" if is_t1_request else "credit", net_credit_amount, new_balance, "recharge", rid,
                     f"T+1 Recharge approved (Pending settlement)" if is_t1_request else f"Recharge approved (gross {gross}, commission {total_commission_amount})"),
        log_admin_cashbook("credit", gross, "recharge_load", rid, f"QR Wallet Load approved for {r.get('user_name', 'Agent')}"),
        log_admin_profit("credit", admin_revenue_amount, "recharge_commission", rid, f"Commission earned from QR Wallet Load ({r.get('user_name', 'Agent')})"),
        write_audit(user["id"], "approve_recharge", target=rid, request=request)
    )
    
    s_set = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    app_enabled = bool(s_set.get("qr_approved_audio_enabled", True))
    approved_audio = s_set.get("qr_approved_audio", "") if app_enabled else ""
    await manager.send_to_user(r["user_id"], {"event": "recharge_updated", "data": {"id": rid, "status": "approved", "audio_url": approved_audio, "audio_enabled": app_enabled}})
    await manager.send_to_role("admin", {"event": "recharge_updated", "data": {"id": rid, "status": "approved"}})
    asyncio.create_task(send_onesignal_notification(
        title="✅ QR Request Approved",
        message=f"₹{gross:,.2f} QR Recharge for {r.get('user_name', 'Agent')} was approved!",
        broadcast=True,
        url="https://makfinpay.com/admin/recharges"
    ))
    return {"ok": True}

@api.post("/admin/recharges/{rid}/reject")
async def admin_reject_recharge(rid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    r = await db.recharges.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Not found")
    if r.get("status") == "approved" and r.get("reviewed_at") is not None:
        raise HTTPException(400, "This recharge request has already been approved.")

    res = await db.execute_query(
        "UPDATE recharges SET status = 'rejected' WHERE id = $1 AND (status = 'pending' OR status = 'approved')",
        [rid]
    )
    if not res or res.get("row_count", 0) == 0:
        raise HTTPException(400, "This recharge request has already been processed or does not exist.")
        
    await db.recharges.update_one({"id": rid}, {"$set": {
        "note": body.note or "", 
        "reviewed_at": now_iso(), 
        "reviewed_by": user["id"],
        "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"
    }})
    await write_audit(user["id"], "reject_recharge", target=rid, request=request)
    s_set = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    rej_enabled = bool(s_set.get("qr_rejected_audio_enabled", True))
    rejected_audio = s_set.get("qr_rejected_audio", "") if rej_enabled else ""
    await manager.send_to_user(r["user_id"], {"event": "recharge_updated", "data": {"id": rid, "status": "rejected", "audio_url": rejected_audio, "audio_enabled": rej_enabled}})
    await manager.send_to_role("admin", {"event": "recharge_updated", "data": {"id": rid, "status": "rejected"}})
    asyncio.create_task(send_onesignal_notification(
        title="❌ QR Request Rejected",
        message=f"₹{r.get('amount', 0):,.2f} QR Recharge for {r.get('user_name', 'Agent')} was rejected.",
        broadcast=True,
        url="https://makfinpay.com/admin/recharges"
    ))
    return {"ok": True}

@api.put("/admin/recharges/{rid}/qr-code")
async def update_recharge_qr(rid: str, body: UpdateRechargeQrIn, user=Depends(require_roles("admin"))):
    r = await db.recharges.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Recharge request not found")
        
    clean_label = body.qr_code_label.strip()
    qr_id = body.qr_code_id or ""
    
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM qr_codes WHERE TRIM(label) = TRIM($1) AND is_deleted = False ORDER BY created_at DESC LIMIT 1",
            clean_label
        )
        if row:
            qr_id = str(row["id"])
            
    await db.recharges.update_one(
        {"id": rid},
        {"$set": {
            "qr_code_label": clean_label,
            "qr_code_id": qr_id
        }}
    )
    
    await manager.broadcast({"event": "recharge_updated", "data": {"id": rid}})
    return {"ok": True, "id": rid, "qr_code_label": clean_label, "qr_code_id": qr_id}

# ---------- BILL PAYMENTS (Credit Card) ----------
@api.post("/agent/bill-payments")
async def agent_bill_payment(body: BillPaymentIn, user=Depends(require_approved_agent())):
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    if not s.get("bill_pay_enabled", True) and not user.get("is_tester", False):
        raise HTTPException(status_code=400, detail="Credit Card Bill Payment service is temporarily disabled by administrator.")
    if body.amount <= 0:
        raise HTTPException(400, "Invalid amount")
    slabs = await db.service_charge_slabs.find({"is_deleted": False, "active": True}).sort("min_amount", 1).to_list(100)
    max_limit = 100000.0
    if slabs:
        max_limit = max([float(s["max_amount"]) for s in slabs])
        
    if body.amount > max_limit:
        raise HTTPException(400, f"Bill amount cannot exceed ₹{max_limit:,.2f}")
        
    service_charge = 0.0
    matched = False
    for s in slabs:
        if float(s["min_amount"]) <= body.amount <= float(s["max_amount"]):
            if s.get("charge_type") == "percent":
                service_charge = round((body.amount * float(s["charge_amount"])) / 100.0, 2)
            else:
                service_charge = float(s["charge_amount"])
            matched = True
            break
            
    if not matched:
        raise HTTPException(400, "Invalid bill amount. The amount must fall within one of the active service charge slabs.")
        
    total_amount = round(body.amount + service_charge, 2)
    w = await get_or_create_wallet(user["id"])
    if w["balance"] - total_amount < 500.0:
        raise HTTPException(400, "Insufficient wallet balance. A minimum balance of ₹500.00 must be maintained in the wallet.")
    new_balance = await adjust_balance(user["id"], -total_amount)
    tx = {
        "id": new_id(),
        "user_id": user["id"],
        "user_name": user["full_name"],
        "type": "credit_card",
        "customer_name": body.customer_name,
        "card_last4": body.card_last4,
        "operator": body.operator,
        "customer_phone": body.customer_phone,
        "bill_amount": round(body.amount, 2),
        "service_charge": service_charge,
        "total_amount": total_amount,
        "amount": total_amount,
        "status": "pending",
        "created_at": now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
    }
    await db.transactions.insert_one(dict(tx))
    await ledger_entry(
        user["id"], "debit", total_amount, new_balance, "bill_payment_hold", tx["id"],
        f"Bill: ₹{body.amount:.2f} + Charge: ₹{service_charge:.2f} — {body.operator} ****{body.card_last4}"
    )
    s_set = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    req_audio_enabled = bool(s_set.get("cc_bill_request_received_audio_enabled", True))
    req_audio = s_set.get("cc_bill_request_received_audio", "") if req_audio_enabled else ""
    await manager.send_to_role("admin", {"event": "cc_bill_created", "data": {**clean(tx), "audio_url": req_audio, "audio_enabled": req_audio_enabled}})
    asyncio.create_task(send_onesignal_notification(
        title="💳 New CC Bill Request!",
        message=f"₹{body.amount:,.2f} request from {user.get('full_name', 'Agent')}",
        target_roles=["admin"],
        url="https://makfinpay.com/admin/transactions"
    ))
    return clean(tx)

@api.get("/agent/transactions")
async def agent_transactions(user=Depends(require_roles("agent"))):
    return await db.transactions.find({"user_id": user["id"], "type": "credit_card"}, {"_id": 0}).sort("created_at", -1).to_list(500)

# ---------- LIVE BILL PAYMENTS (Irise API Integration) ----------
async def call_irise_api(method: str, endpoint: str, params: dict = None, json_data: dict = None):
    base_url = os.getenv("IRISE_BASE_URL") or os.getenv("USEPAY_BASE_URL") or "https://www.usepay.in/api/v1/b2b"
    public_key = os.getenv("IRISE_PUBLIC_KEY") or os.getenv("USEPAY_PUBLIC_KEY") or "pk_live_etwxtbnjb9mytap9xlq7qo"
    secret_key = os.getenv("IRISE_SECRET_KEY") or os.getenv("USEPAY_SECRET_KEY") or "sk_live_ob69oiy8jsd6kxzb244ddr"

    # Fallback to mock data ONLY if credentials are missing
    if not public_key or not secret_key:
        ep = endpoint.strip("/")
        if ep == "categories":
            return {
                "status": "success",
                "data": [
                    {"category_id": 1, "category_name": "Electricity"},
                    {"category_id": 2, "category_name": "Water"},
                    {"category_id": 3, "category_name": "Gas"},
                    {"category_id": 4, "category_name": "Mobile Postpaid"}
                ]
            }
        elif ep == "billers":
            cat_id = str(params.get("category_id") if params else "1")
            if cat_id == "1":
                return {
                    "status": "success",
                    "data": [
                        {
                            "biller_id": "10", 
                            "biller_name": "Torrent Power", 
                            "category_id": 1, 
                            "status": "active",
                            "metadata": {
                                "billerId": "10",
                                "billerName": "Torrent Power",
                                "billerCategoryName": "Electricity",
                                "billerInputParams": {
                                    "paramInfo": [
                                        {"paramName": "Service Number", "dataType": "NUMERIC", "isOptional": False}
                                    ]
                                }
                            }
                        },
                        {
                            "biller_id": "11", 
                            "biller_name": "PGVCL", 
                            "category_id": 1, 
                            "status": "active",
                            "metadata": {
                                "billerId": "11",
                                "billerName": "PGVCL",
                                "billerCategoryName": "Electricity",
                                "billerInputParams": {
                                    "paramInfo": [
                                        {"paramName": "Consumer Number", "dataType": "NUMERIC", "isOptional": False}
                                    ]
                                }
                            }
                        },
                        {
                            "biller_id": "12", 
                            "biller_name": "UGVCL", 
                            "category_id": 1, 
                            "status": "active",
                            "metadata": {
                                "billerId": "12",
                                "billerName": "UGVCL",
                                "billerCategoryName": "Electricity",
                                "billerInputParams": {
                                    "paramInfo": [
                                        {"paramName": "Consumer Number", "dataType": "NUMERIC", "isOptional": False}
                                    ]
                                }
                            }
                        }
                    ]
                }
            elif cat_id == "2":
                return {
                    "status": "success",
                    "data": [
                        {
                            "biller_id": "20", 
                            "biller_name": "Delhi Jal Board", 
                            "category_id": 2, 
                            "status": "active",
                            "metadata": {
                                "billerId": "20",
                                "billerName": "Delhi Jal Board",
                                "billerCategoryName": "Water",
                                "billerInputParams": {
                                    "paramInfo": [
                                        {"paramName": "K Number", "dataType": "NUMERIC", "isOptional": False}
                                    ]
                                }
                            }
                        },
                        {
                            "biller_id": "21", 
                            "biller_name": "BMC Water Department", 
                            "category_id": 2, 
                            "status": "active",
                            "metadata": {
                                "billerId": "21",
                                "billerName": "BMC Water Department",
                                "billerCategoryName": "Water",
                                "billerInputParams": {
                                    "paramInfo": [
                                        {"paramName": "Consumer Number", "dataType": "NUMERIC", "isOptional": False}
                                    ]
                                }
                            }
                        }
                    ]
                }
            else:
                return {
                    "status": "success",
                    "data": [
                        {
                            "biller_id": "30", 
                            "biller_name": "Adani Gas", 
                            "category_id": 3, 
                            "status": "active",
                            "metadata": {
                                "billerId": "30",
                                "billerName": "Adani Gas",
                                "billerCategoryName": "Gas",
                                "billerInputParams": {
                                    "paramInfo": [
                                        {"paramName": "Customer ID", "dataType": "NUMERIC", "isOptional": False}
                                    ]
                                }
                            }
                        },
                        {
                            "biller_id": "31", 
                            "biller_name": "Indraprastha Gas", 
                            "category_id": 3, 
                            "status": "active",
                            "metadata": {
                                "billerId": "31",
                                "billerName": "Indraprastha Gas",
                                "billerCategoryName": "Gas",
                                "billerInputParams": {
                                    "paramInfo": [
                                        {"paramName": "BP Number", "dataType": "NUMERIC", "isOptional": False}
                                    ]
                                }
                            }
                        }
                    ]
                }
        elif ep == "fetch-bill":
            cust_num = ""
            if json_data and json_data.get("customerParams"):
                cust_num = json_data.get("customerParams")[0].get("value", "")
            return {
                "status": "success",
                "data": {
                    "responseCode": "000",
                    "billerResponse": {
                        "customerName": "JOHN DOE",
                        "amount": "1500.00",
                        "dueDate": "2026-08-15"
                    }
                }
            }
        elif ep == "pay-bill":
            return {
                "status": "success",
                "transaction_id": f"USEPAY{uuid.uuid4().hex[:8].upper()}",
                "payment_status": "success",
                "data": {
                    "responseCode": "000",
                    "billPayResponse": {
                        "txnReferenceId": f"BBPS{uuid.uuid4().hex[:8].upper()}",
                        "txnStatus": "SUCCESS"
                    }
                }
            }
        return {"status": "failed", "message": "Mock API endpoint not found"}

_irise_client: Optional[httpx.AsyncClient] = None

def get_irise_client() -> httpx.AsyncClient:
    global _irise_client
    if _irise_client is None or _irise_client.is_closed:
        _irise_client = httpx.AsyncClient(timeout=30.0, limits=httpx.Limits(max_keepalive_connections=50, max_connections=100))
    return _irise_client

async def call_irise_api(method: str, endpoint: str, params: dict = None, json_data: dict = None):
    base_url = os.environ.get("IRISE_BASE_URL", "https://www.usepay.in/api/v1/b2b")
    public_key = os.environ.get("IRISE_PUBLIC_KEY", "").strip()
    secret_key = os.environ.get("IRISE_SECRET_KEY", "").strip()

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-key": public_key,
        "x-secret-key": secret_key
    }
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    client = get_irise_client()
    try:
        if method.upper() == "GET":
            r = await client.get(url, headers=headers, params=params)
        else:
            r = await client.post(url, headers=headers, json=json_data)
            
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        try:
            err_data = r.json()
            detail = err_data.get("message") or err_data.get("detail") or str(e)
        except Exception:
            detail = r.text or str(e)
            
        detail_str = str(detail).lower()
        if "insufficient balance" in detail_str or "insufficient" in detail_str or "balance" in detail_str:
            raise HTTPException(status_code=r.status_code, detail="Transaction failed")
            
        raise HTTPException(status_code=r.status_code, detail=f"Irise API Error: {detail}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to connect to Irise API: {str(e)}")

async def sync_billers_from_usepay():
    page = 1
    total_synced = 0
    all_billers = []
    
    while page <= 100:
        try:
            res = await call_irise_api("GET", "billers", params={"page": page, "limit": 500})
            if res.get("status") == "success" and "data" in res:
                data = res["data"]
                if not data:
                    break
                all_billers.extend(data)
                total_synced += len(data)
                page += 1
            else:
                break
        except Exception as e:
            print(f"Error syncing page {page}: {str(e)}")
            break
            
    if all_billers:
        # Clear existing
        await db.billers.delete_many({})
        # Insert in chunks of 1000 to prevent exceeding PostgreSQL parameter limit
        chunk_size = 1000
        for i in range(0, len(all_billers), chunk_size):
            chunk = all_billers[i : i + chunk_size]
            await db.billers.insert_many(chunk)
        
    return total_synced

@api.post("/admin/live-billpay/sync-billers")
async def post_sync_billers(user=Depends(require_roles("admin"))):
    count = await sync_billers_from_usepay()
    return {"status": "success", "message": f"Successfully synced {count} billers from Usepay API"}

DEFAULT_BILLER_CATEGORIES = [
    "Agent Collection", "Broadband Postpaid", "Cable TV",
    "Clubs and Associations", "Credit Card", "Donation", "DTH",
    "eChallan", "Education Fees", "Electricity",
    "EV Recharge", "Fastag", "Fleet Card Recharge", "Forex",
    "Gas", "Housing Society", "Insurance",
    "Landline Postpaid", "Loan Repayment", "LPG Gas",
    "Mobile Postpaid", "Mobile Prepaid", "Municipal Services",
    "Municipal Taxes", "National Pension System", "NCMC Recharge",
    "Prepaid Meter", "Rental", "Subscription", "Water"
]

async def _get_disabled_biller_categories_set() -> set:
    try:
        doc = await db.settings.find_one({"id": "biller_categories"}, {"_id": 0})
        if doc and doc.get("disabled_biller_categories"):
            val = doc["disabled_biller_categories"]
            if isinstance(val, list):
                return set(val)
            elif isinstance(val, str):
                try:
                    parsed = json.loads(val)
                    if isinstance(parsed, list):
                        return set(parsed)
                except Exception:
                    return set(x.strip() for x in val.split("||") if x.strip())
    except Exception as e:
        logger.error(f"Error fetching disabled_biller_categories: {e}")
    return set()

async def _save_disabled_biller_categories_set(disabled_set: set):
    val_json = json.dumps(sorted(list(disabled_set)))
    try:
        await db.settings.update_one(
            {"id": "biller_categories"},
            {"$set": {
                "id": "biller_categories",
                "disabled_biller_categories": val_json,
                "updated_at": now_iso()
            }},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Error saving disabled_biller_categories: {e}")

@api.get("/admin/biller-categories")
async def get_admin_biller_categories(user=Depends(require_roles("admin"))):
    try:
        cat_rows = []
        try:
            async with db.pool.acquire() as conn:
                rows = await conn.fetch("SELECT DISTINCT category FROM billers WHERE category IS NOT NULL AND category != ''")
                cat_rows = [r["category"] for r in rows]
        except Exception:
            pass

        all_cat_set = set(DEFAULT_BILLER_CATEGORIES + cat_rows)
        sorted_cats = sorted(list(all_cat_set))

        disabled_set = await _get_disabled_biller_categories_set()
        disabled_lower = {x.strip().lower() for x in disabled_set}

        biller_counts = {}
        try:
            async with db.pool.acquire() as conn:
                count_rows = await conn.fetch("SELECT category, COUNT(*) as cnt FROM billers GROUP BY category")
                biller_counts = {r["category"]: r["cnt"] for r in count_rows}
        except Exception:
            pass

        categories = []
        for cat_name in sorted_cats:
            is_enabled = cat_name.strip().lower() not in disabled_lower
            categories.append({
                "category_name": cat_name,
                "enabled": is_enabled,
                "biller_count": biller_counts.get(cat_name, 0)
            })
        return {"status": "success", "data": categories}
    except Exception as e:
        logger.error(f"Failed to fetch biller categories: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch biller categories: {str(e)}")

class CategoryTogglePayload(BaseModel):
    category_name: str
    enabled: bool

@api.post("/admin/biller-categories/toggle")
async def toggle_biller_category(payload: CategoryTogglePayload, user=Depends(require_roles("admin"))):
    try:
        disabled_set = await _get_disabled_biller_categories_set()
        target_name = payload.category_name.strip()
        
        # Remove any existing case variations
        disabled_set = {x for x in disabled_set if x.strip().lower() != target_name.lower()}
        
        if not payload.enabled:
            disabled_set.add(target_name)

        await _save_disabled_biller_categories_set(disabled_set)
        return {"status": "success", "message": f"Category '{target_name}' {'enabled' if payload.enabled else 'disabled'}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle category: {str(e)}")

class BulkCategoryTogglePayload(BaseModel):
    enabled: bool

@api.post("/admin/biller-categories/toggle-all")
async def toggle_all_biller_categories(payload: BulkCategoryTogglePayload, user=Depends(require_roles("admin"))):
    try:
        if payload.enabled:
            await _save_disabled_biller_categories_set(set())
        else:
            cat_rows = []
            try:
                async with db.pool.acquire() as conn:
                    rows = await conn.fetch("SELECT DISTINCT category FROM billers WHERE category IS NOT NULL AND category != ''")
                    cat_rows = [r["category"] for r in rows]
            except Exception:
                pass
            all_cats = set(DEFAULT_BILLER_CATEGORIES + cat_rows)
            await _save_disabled_biller_categories_set(all_cats)
        return {"status": "success", "message": f"All categories {'enabled' if payload.enabled else 'disabled'}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk toggle categories: {str(e)}")

@api.get("/agent/live-billpay/categories")
async def get_live_billpay_categories(user=Depends(require_approved_agent())):
    try:
        db_cats = []
        try:
            async with db.pool.acquire() as conn:
                rows = await conn.fetch("SELECT DISTINCT category FROM billers WHERE category IS NOT NULL AND category != ''")
                db_cats = [r["category"] for r in rows]
        except Exception:
            pass

        all_cat_set = set(DEFAULT_BILLER_CATEGORIES + db_cats)
        sorted_cats = sorted(list(all_cat_set))

        disabled_set = await _get_disabled_biller_categories_set()
        disabled_lower = {x.strip().lower() for x in disabled_set}

        categories_list = []
        for cat_name in sorted_cats:
            if cat_name.strip().lower() not in disabled_lower:
                categories_list.append({
                    "id": cat_name,
                    "category_name": cat_name
                })
        return {"status": "success", "data": categories_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories from database: {str(e)}")

def is_bank_match(biller_name: str, bank_name: str) -> bool:
    def get_keywords(s):
        s = s.lower()
        for char in ["-", "(", ")", "&", "/", ".", ","]:
            s = s.replace(char, " ")
        words = s.split()
        ignore = {
            "bank", "credit", "card", "creditcard", "cards", "limited", "ltd", "india", 
            "co-operative", "co", "operative", "one", "limited", "of", "and", "the"
        }
        keywords = []
        for w in words:
            if w == "bob" or w == "bobcard":
                w = "baroda"
            elif w == "ubi" or w == "union":
                w = "union"
            elif w == "pnb" or w == "punjab":
                w = "punjab"
            elif w == "j" or w == "k" or w == "j&k" or w == "jandk":
                w = "jk"
            elif w == "sbm" or w == "sbmb":
                w = "sbm"
            
            if w not in ignore and len(w) > 1:
                keywords.append(w)
        if "bank" in words and "of" in words and "india" in words and "union" not in words:
            keywords.append("boi")
        return set(keywords)

    cb = get_keywords(biller_name)
    ck = get_keywords(bank_name)
    if not cb or not ck:
        return False
    return len(cb.intersection(ck)) > 0

@api.get("/agent/live-billpay/operators")
async def get_live_billpay_operators(category_id: str, user=Depends(require_approved_agent())):
    count = await db.billers.count_documents({})
    if count == 0:
        await sync_billers_from_usepay()
        
    if category_id.isdigit():
        cat_name = ""
        try:
            cats_res = await call_irise_api("GET", "categories")
            if cats_res.get("status") == "success" and "data" in cats_res:
                for c in cats_res["data"]:
                    if str(c.get("id")) == str(category_id):
                        cat_name = c.get("category_name", "")
                        break
        except Exception:
            pass
            
        if not cat_name:
            fallback_cats = {
                "1": "Agent Collection", "2": "Broadband Postpaid", "3": "Cable TV",
                "4": "Clubs and Associations", "5": "Credit Card", "6": "DTH",
                "7": "eChallan", "8": "Education Fees", "9": "Electricity",
                "10": "EV Recharge", "11": "Fastag", "12": "Fleet Card Recharge",
                "13": "Gas", "14": "Housing Society", "15": "Insurance",
                "16": "Landline Postpaid", "17": "Loan Repayment", "18": "LPG Gas",
                "19": "Mobile Postpaid", "20": "Mobile Prepaid", "21": "Municipal Services",
                "22": "Municipal Taxes", "23": "National Pension System", "24": "NCMC Recharge",
                "25": "Prepaid Meter", "26": "Rental", "27": "Subscription", "28": "Water"
            }
            cat_name = fallback_cats.get(str(category_id), "")
    else:
        cat_name = category_id
        
    cursor = db.billers.find({"category": cat_name}, {"_id": 0})
    billers_list = await cursor.to_list(1000)
    
    if not billers_list:
        try:
            res = await call_irise_api("GET", "billers", params={"category_id": category_id})
            if res.get("status") == "success" and "data" in res:
                api_data = res.get("data") or []
                if cat_name == "Credit Card" or str(category_id) == "5":
                    disabled_banks = await db.banks.find({
                        "$or": [
                            {"bill_pay_enabled": False},
                            {"is_deleted": True}
                        ]
                    }, {"_id": 0, "name": 1}).to_list(500)
                    disabled_names = [dbk["name"] for dbk in disabled_banks]
                    
                    def is_disabled(biller_name):
                        for db_name in disabled_names:
                            if is_bank_match(biller_name, db_name):
                                return True
                        return False
                    api_data = [b for b in api_data if not is_disabled(b.get("biller_name", ""))]
                return {"status": "success", "data": api_data}
        except Exception:
            pass
            
    if cat_name == "Credit Card" or str(category_id) == "5":
        disabled_banks = await db.banks.find({
            "$or": [
                {"bill_pay_enabled": False},
                {"is_deleted": True}
            ]
        }, {"_id": 0, "name": 1}).to_list(500)
        disabled_names = [dbk["name"] for dbk in disabled_banks]
        
        def is_disabled(biller_name):
            for db_name in disabled_names:
                if is_bank_match(biller_name, db_name):
                    return True
            return False
        billers_list = [b for b in billers_list if not is_disabled(b.get("biller_name", ""))]
            
    return {"status": "success", "data": billers_list}

@api.post("/agent/live-billpay/fetch")
async def post_live_billpay_fetch(body: LiveBillFetchIn, user=Depends(require_approved_agent())):
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    if not s.get("live_bill_enabled", True) and not user.get("is_tester", False):
        raise HTTPException(status_code=400, detail="Live Bill Payment service is temporarily disabled by administrator.")
    payload = {
        "billerId": body.billerId,
        "mobile": body.mobile,
        "customerParams": [dict(x) for x in body.customerParams]
    }
    res = await call_irise_api("POST", "fetch-bill", json_data=payload)
    return res

@api.post("/agent/live-billpay/pay")
async def post_live_billpay_pay(body: LiveBillPayIn, request: Request, user=Depends(require_approved_agent())):
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    if not s.get("live_bill_enabled", True) and not user.get("is_tester", False):
        raise HTTPException(status_code=400, detail="Live Bill Payment service is temporarily disabled by administrator.")
        
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid bill amount")
        
    max_limit = float(s.get("live_bill_max_limit", 100000.0))
    if body.amount > max_limit:
        raise HTTPException(status_code=400, detail=f"Bill amount cannot exceed ₹{max_limit:,.2f}")
        
    # Calculate service charge based on active slabs
    slabs = await db.service_charge_slabs.find({"is_deleted": False, "active": True}).sort("min_amount", 1).to_list(100)
    service_charge = 0.0
    matched = False
    for slab in slabs:
        if float(slab["min_amount"]) <= body.amount <= float(slab["max_amount"]):
            if slab.get("charge_type") == "percent":
                service_charge = round((body.amount * float(slab["charge_amount"])) / 100.0, 2)
            else:
                service_charge = float(slab["charge_amount"])
            matched = True
            break
            
    if not matched:
        service_charge = 15.0 if body.amount <= 50000 else 25.0
        
    total_amount = round(body.amount + service_charge, 2)

    wallet = await get_or_create_wallet(user["id"])
    if wallet["balance"] - total_amount < 500.0:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance. A minimum balance of ₹500.00 must be maintained in the wallet.")
        
    # Verify TPIN
    tpin_hash = user.get("tpin_hash")
    if not tpin_hash:
        raise HTTPException(status_code=400, detail="Transaction PIN (TPIN) is not set up. Please set it up in the TPIN Settings first.")
    if not verify_password(body.tpin, tpin_hash):
        raise HTTPException(status_code=400, detail="Invalid Transaction PIN (TPIN)")

    tid = new_id()
    new_balance = await adjust_balance(user["id"], -total_amount)
    
    card_last4 = ""
    for p in body.customerParams:
        name_lower = p.name.lower()
        if any(x in name_lower for x in ["last 4", "card_last4", "last4", "credit card", "last_4"]):
            val = "".join(c for c in p.value if c.isdigit())
            if val:
                card_last4 = val[-4:]
                break

    api_charge = float(s.get("live_bill_api_charge", 0.0))
    tx = {
        "id": tid,
        "user_id": user["id"],
        "user_name": user["full_name"],
        "type": "live_bill",
        "customer_name": "N/A",
        "card_last4": card_last4,
        "operator": body.billerId,
        "customer_phone": body.mobile,
        "bill_amount": round(body.amount, 2),
        "service_charge": service_charge,
        "total_amount": total_amount,
        "amount": total_amount,
        "status": "pending",
        "created_at": now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
        "note": f"Live Bill Payment - {body.mobile}",
        "api_charge": 0.0
    }
    await db.transactions.insert_one(dict(tx))
    
    await ledger_entry(
        user["id"], "debit", total_amount, new_balance, "live_bill_pay", tid,
        f"Live Bill Pay: ₹{body.amount:.2f} (Charge ₹{service_charge:.2f}) — Biller: {body.billerId} for {body.mobile}"
    )
    
    biller_info = dict(body.billerResponseInfo) if body.billerResponseInfo else {}
    biller_info.pop("amount", None)
    
    payload = {
        "billerId": body.billerId,
        "amount": body.amount,
        "mobile": body.mobile,
        "customerParams": [dict(x) for x in body.customerParams],
        "billerResponseInfo": biller_info
    }
    if body.fetchRequestId:
        payload["fetchRequestId"] = body.fetchRequestId
    if body.additionalInfo:
        payload["additionalInfo"] = body.additionalInfo
    
    try:
        res = await call_irise_api("POST", "pay-bill", json_data=payload)
        raw_status = str(res.get("payment_status") or res.get("status") or "").strip().lower()
        usepay_txn_id = res.get("transaction_id") or res.get("txnid") or res.get("operator_id")
        
        if raw_status in ("success", "successful", "00", "ok"):
            await db.transactions.update_one({"id": tid}, {"$set": {
                "status": "success", 
                "reviewed_at": now_iso(), 
                "reviewed_by": None,
                "operator_txn_id": usepay_txn_id,
                "api_charge": api_charge
            }})
            # Log to Admin Statement
            await log_admin_cashbook("debit", body.amount, "bbps_payout", tid, f"Paid Live Bill for {user['full_name']} ({body.billerId})")
            profit = round(service_charge - api_charge, 2)
            await log_admin_profit("credit", profit, "live_bill_fee", tid, f"Profit margin from Live Bill ({user['full_name']})")
            return {"status": "success", "transaction_id": tid}
        elif raw_status in ("awaited", "pending", "process", "processing", "in_process", "accepted", "queued"):
            await db.transactions.update_one({"id": tid}, {"$set": {
                "status": "pending", 
                "reviewed_at": now_iso(), 
                "reviewed_by": None,
                "operator_txn_id": usepay_txn_id
            }})
            return {"status": "pending", "transaction_id": tid, "message": "Bill payment is awaited/pending with operator."}
        else:
            new_balance_refund = await adjust_balance(user["id"], total_amount)
            raw_err = res.get("message") or res.get("msg") or res.get("response_reason") or "Rejected by operator"
            err_str = str(raw_err).lower()
            err_msg = "Transaction failed" if ("insufficient" in err_str or "balance" in err_str) else raw_err
            await db.transactions.update_one({"id": tid}, {"$set": {
                "status": "reversed", 
                "reviewed_at": now_iso(), 
                "reviewed_by": None, 
                "operator_txn_id": usepay_txn_id,
                "api_charge": 0.0,
                "note": f"Payment failed: {raw_err}"
            }})
            await ledger_entry(
                user["id"], "refund", total_amount, new_balance_refund, "live_bill_refund", tid,
                f"Refund: Failed Live Bill Pay for {body.mobile} ({raw_err})"
            )
            return {"status": "failed", "message": err_msg}
    except HTTPException as e:
        if e.status_code < 500:
            new_balance_refund = await adjust_balance(user["id"], total_amount)
            detail_str = str(e.detail).lower()
            out_detail = "Transaction failed" if ("insufficient" in detail_str or "balance" in detail_str) else e.detail
            await db.transactions.update_one({"id": tid}, {"$set": {
                "status": "reversed",
                "reviewed_at": now_iso(),
                "reviewed_by": None,
                "api_charge": 0.0,
                "note": f"Payment failed: {e.detail}"
            }})
            await ledger_entry(
                user["id"], "refund", total_amount, new_balance_refund, "live_bill_refund", tid,
                f"Refund: Failed Live Bill Pay for {body.mobile} - {e.detail}"
            )
            raise HTTPException(status_code=e.status_code, detail=out_detail)
        else:
            await db.transactions.update_one({"id": tid}, {"$set": {"note": f"API Connection error: {e.detail}"}})
            return {"status": "pending", "transaction_id": tid, "message": f"Connection check pending: {e.detail}"}
    except Exception as e:
        await db.transactions.update_one({"id": tid}, {"$set": {"note": f"API Connection error: {str(e)}"}})
        return {"status": "pending", "transaction_id": tid, "message": f"Connection check pending: {str(e)}"}

@app.post("/usepay/webhook")
@app.post("/api/usepay/webhook")
@api.post("/usepay/webhook")
async def usepay_webhook(request: Request):
    # Read raw body safely
    try:
        payload = await request.json()
    except Exception as e:
        print(f"\n[USEPAY WEBHOOK ERROR] Failed to parse JSON body: {str(e)}")
        return {"status": "error", "message": "Invalid JSON body"}
        
    print("\n================== USEPAY WEBHOOK RECEIVED ==================")
    import json
    print(json.dumps(payload, indent=2))
    print("=============================================================")
    
    event = payload.get("event")
    transaction_id = payload.get("transaction_id")
    status = payload.get("status")
    bbps_status = payload.get("bbps_status")
    
    if not transaction_id:
        print("[USEPAY WEBHOOK ERROR] Missing transaction_id in webhook payload.")
        return {"status": "ignored", "message": "Missing transaction_id"}
        
    # 1. Find the transaction in our database by external/operator transaction ID
    tx = await db.transactions.find_one({"operator_txn_id": transaction_id})
    if not tx:
        print(f"[USEPAY WEBHOOK] Transaction {transaction_id} not found in database.")
        # Return 200 to acknowledge receipt anyway (as required by most webhooks)
        return {"status": "ignored", "message": "Transaction not found"}
        
    # 2. Process webhook event with case-insensitive status check
    status_lower = str(status).lower() if status else ""
    
    if status_lower == "success":
        # Update status to success if not already success
        if tx.get("status") != "success":
            s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
            api_charge_val = float(s.get("live_bill_api_charge", 0.0))
            await db.transactions.update_one({"id": tx["id"]}, {"$set": {
                "status": "success",
                "reviewed_at": now_iso(),
                "api_charge": api_charge_val,
                "note": f"Payment success confirmed by Usepay Webhook (Status: {bbps_status or 'SUCCESS'})"
            }})
            # Log to Admin Statement
            bill_amount = float(tx.get("bill_amount", tx["amount"]))
            await log_admin_cashbook("debit", bill_amount, "bbps_payout", tx["id"], f"Paid Live Bill for {tx.get('user_name', 'Agent')} ({tx.get('operator', 'Biller')})")
            service_charge = float(tx.get("service_charge", 0.0))
            profit = round(service_charge - api_charge_val, 2)
            await log_admin_profit("credit", profit, "live_bill_fee", tx["id"], f"Profit margin from Live Bill ({tx.get('user_name', 'Agent')})")
            print(f"[USEPAY WEBHOOK SUCCESS] Transaction {tx['id']} updated to success.")
    elif status_lower in ["failed", "error", "failure"]:
        # If it failed, refund the agent's wallet and mark as reversed
        if tx.get("status") != "reversed":
            new_balance = await adjust_balance(tx["user_id"], tx["amount"])
            
            # Log to Admin Statement (if it was previously marked success, refund)
            if tx.get("status") == "success":
                bill_amount = float(tx.get("bill_amount", tx["amount"]))
                await log_admin_cashbook("credit", bill_amount, "bbps_refund", tx["id"], f"Reversal of BBPS payout ({tx.get('operator', 'Biller')})")
                api_charge_val = float(tx.get("api_charge", 0.0))
                service_charge = float(tx.get("service_charge", 0.0))
                profit = round(service_charge - api_charge_val, 2)
                await log_admin_profit("debit", profit, "live_bill_reversal", tx["id"], f"Reversal of Live Bill profit ({tx.get('user_name', 'Agent')})")
                
            await db.transactions.update_one({"id": tx["id"]}, {"$set": {
                "status": "reversed",
                "reviewed_at": now_iso(),
                "api_charge": 0.0,
                "note": f"Payment failed: {bbps_status or 'BBPS Failure'} (Webhook Callback)"
            }})
            await ledger_entry(
                tx["user_id"], "refund", tx["amount"], new_balance, "live_bill_refund", tx["id"],
                f"Refund: Failed Live Bill Pay (Webhook Callback: {bbps_status or 'Failed'})"
            )
            print(f"[USEPAY WEBHOOK FAILED] Transaction {tx['id']} refunded and updated to rejected.")
            
    return {"status": "processed"}

@api.get("/agent/live-billpay/transactions")
async def get_live_billpay_transactions(user=Depends(require_roles("agent"))):
    return await db.transactions.find({"user_id": user["id"], "type": "live_bill"}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.get("/admin/transactions/stats")
async def admin_transactions_stats(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    operator: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    type: Optional[str] = None,
    txn_id: Optional[str] = None,
    api_txn_id: Optional[str] = None,
    agent_search: Optional[str] = None,
    bank_search: Optional[str] = None,
    card_search: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    matched_ids = None
    if txn_id and txn_id.strip().lower().startswith("txn"):
        needle = txn_id.strip().lower()
        recent_txs = await db.transactions.find({}, {"id": 1}).sort("created_at", -1).to_list(2000)
        matched_ids = [tx["id"] for tx in recent_txs if tx.get("id") and needle in get_short_txn_id(tx["id"]).lower()]
        
    query = _build_transaction_query(
        status=status, agent_id=agent_id, operator=operator,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount, txn_type=type,
        txn_id=txn_id, api_txn_id=api_txn_id, matched_ids=matched_ids,
        agent_search=agent_search, bank_search=bank_search, card_search=card_search
    )
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$status",
            "total_amount": {"$sum": "$amount"},
            "count": {"$sum": 1}
        }}
    ]
    cursor = db.transactions.aggregate(pipeline)
    rows = await cursor.to_list(100)
    
    res = {}
    for r in rows:
        status_key = r["_id"] or "unknown"
        res[status_key] = {
            "amount": round(r["total_amount"], 2),
            "count": r["count"]
        }
    return res

@api.get("/admin/transactions")
async def admin_transactions(
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    operator: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    type: Optional[str] = None,
    txn_id: Optional[str] = None,
    api_txn_id: Optional[str] = None,
    agent_search: Optional[str] = None,
    bank_search: Optional[str] = None,
    card_search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    paginated: bool = False,
    fields: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    matched_ids = None
    if txn_id and txn_id.strip().lower().startswith("txn"):
        needle = txn_id.strip().lower()
        recent_txs = await db.transactions.find({}, {"id": 1}).sort("created_at", -1).to_list(2000)
        matched_ids = [tx["id"] for tx in recent_txs if tx.get("id") and needle in get_short_txn_id(tx["id"]).lower()]
        
    query = _build_transaction_query(
        status=status, agent_id=agent_id, operator=operator,
        from_ts=from_ts, to_ts=to_ts, q=q, amount=amount, txn_type=type,
        txn_id=txn_id, api_txn_id=api_txn_id, matched_ids=matched_ids,
        agent_search=agent_search, bank_search=bank_search, card_search=card_search
    )
    proj = {"_id": 0}
    if fields:
        proj = {f.strip(): 1 for f in fields.split(",") if f.strip()}

    if paginated:
        page = max(1, page); page_size = max(1, min(200, page_size))
        total_task = db.transactions.count_documents(query)
        items_task = db.transactions.find(query, proj).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        total, items = await asyncio.gather(total_task, items_task)
        items = await _enrich_reviewed_by_names(items)
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    items = await db.transactions.find(query, proj).sort("created_at", -1).to_list(None)
    return await _enrich_reviewed_by_names(items)

@api.post("/admin/transactions/{tid}/approve")
async def admin_approve_transaction(tid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    t = await db.transactions.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Not found")
    if t["status"] != "pending":
        raise HTTPException(400, "Only pending transactions can be marked success")
    await db.transactions.update_one({"id": tid}, {"$set": {
        "status": "success", 
        "note": body.note or "", 
        "reviewed_by": user["id"], 
        "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin",
        "reviewed_at": now_iso()
    }})
    wallet = await get_or_create_wallet(t["user_id"])
    
    await asyncio.gather(
        ledger_entry(t["user_id"], "adjustment", 0, wallet["balance"], "bill_payment_success", tid, "Payment confirmed by Admin"),
        log_admin_cashbook("debit", t["amount"], "bill_payment_payout", tid, f"Paid CC Bill for {t.get('user_name', 'Agent')} ({t.get('operator', 'Bank')}):"),
        log_admin_profit("credit", t.get("service_charge", 0.0), "bill_payment_fee", tid, f"Fee earned from CC Bill ({t.get('user_name', 'Agent')}):"),
        write_audit(user["id"], "transaction_approved", target=tid, meta={"amount": t["amount"]}, request=request)
    )

    s_set = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    approved_audio = s_set.get("cc_bill_approved_audio", "")
    await manager.send_to_user(t["user_id"], {"event": "cc_bill_updated", "data": {"id": tid, "status": "success", "audio_url": approved_audio}})
    await manager.send_to_role("admin", {"event": "cc_bill_updated", "data": {"id": tid, "status": "success"}})
    asyncio.create_task(send_onesignal_notification(
        title="✅ CC Bill Payment Approved",
        message=f"₹{t.get('amount', 0):,.2f} CC Bill payment for {t.get('user_name', 'Agent')} was approved!",
        broadcast=True,
        url="https://makfinpay.com/admin/transactions"
    ))
    return {"ok": True}

@api.post("/admin/transactions/{tid}/reject")
async def admin_reject_transaction(tid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    t = await db.transactions.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Not found")
    if t["status"] not in ("pending", "success"):
        raise HTTPException(400, "Only pending or success transactions can be reversed")
    new_balance = await adjust_balance(t["user_id"], t["amount"])
    await db.transactions.update_one({"id": tid}, {"$set": {
        "status": "reversed", 
        "note": body.note or "", 
        "reviewed_by": user["id"], 
        "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin",
        "reviewed_at": now_iso()
    }})
    await ledger_entry(t["user_id"], "refund", t["amount"], new_balance, "bill_payment_reversal", tid, "Payment reversed by Admin")
    
    # Log to Admin Statement (if CC bill was already approved/success, reverse entries)
    if t["status"] == "success":
        await log_admin_cashbook("credit", t["amount"], "bill_payment_refund", tid, f"Reversal of CC Bill payout ({t.get('user_name', 'Agent')})")
        await log_admin_profit("debit", t.get("service_charge", 0.0), "bill_payment_reversal", tid, f"Reversal of CC Bill fee ({t.get('user_name', 'Agent')})")

    await write_audit(user["id"], "transaction_reversed", target=tid, meta={"amount": t["amount"]}, request=request)
    s_set = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    rejected_audio = s_set.get("cc_bill_rejected_audio", "")
    await manager.send_to_user(t["user_id"], {"event": "cc_bill_updated", "data": {"id": tid, "status": "reversed", "audio_url": rejected_audio}})
    await manager.send_to_role("admin", {"event": "cc_bill_updated", "data": {"id": tid, "status": "reversed"}})
    asyncio.create_task(send_onesignal_notification(
        title="❌ CC Bill Payment Reversed",
        message=f"₹{t.get('amount', 0):,.2f} CC Bill payment for {t.get('user_name', 'Agent')} was reversed.",
        broadcast=True,
        url="https://makfinpay.com/admin/transactions"
    ))
    return {"ok": True}

@api.post("/admin/live-billpay/{tid}/approve")
async def admin_approve_live_bill(tid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    if user["email"] != "jigs.vanani@gmail.com":
        raise HTTPException(403, "Only Super Admin is authorized to perform this operation.")
    t = await db.transactions.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Not found")
    if t["type"] != "live_bill":
        raise HTTPException(400, "Transaction is not a live bill payment")
    if t["status"] != "pending":
        raise HTTPException(400, "Only pending transactions can be marked success")
    
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    api_charge = float(s.get("live_bill_api_charge", 0.0))
    
    await db.transactions.update_one({"id": tid}, {"$set": {
        "status": "success", 
        "note": body.note or "Manually approved by Super Admin", 
        "reviewed_by": user["id"], 
        "reviewed_at": now_iso(),
        "api_charge": api_charge
    }})
    
    # Log to Admin Statement
    await log_admin_cashbook("debit", t["bill_amount"], "bbps_payout", tid, f"Paid Live Bill for {t.get('user_name', 'Agent')} ({t.get('operator', 'Biller')})")
    profit = round(t["service_charge"] - api_charge, 2)
    await log_admin_profit("credit", profit, "live_bill_fee", tid, f"Profit margin from Live Bill ({t.get('user_name', 'Agent')})")

    await write_audit(user["id"], "live_bill_approved", target=tid, meta={"amount": t["amount"]}, request=request)
    approved_audio = s.get("cc_bill_approved_audio", "")
    await manager.send_to_user(t["user_id"], {"event": "cc_bill_updated", "data": {"id": tid, "status": "success", "audio_url": approved_audio}})
    await manager.send_to_role("admin", {"event": "cc_bill_updated", "data": {"id": tid, "status": "success"}})
    return {"ok": True}

@api.post("/admin/live-billpay/{tid}/reject")
async def admin_reject_live_bill(tid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    if user["email"] != "jigs.vanani@gmail.com":
        raise HTTPException(403, "Only Super Admin is authorized to perform this operation.")
    t = await db.transactions.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Not found")
    if t["type"] != "live_bill":
        raise HTTPException(400, "Transaction is not a live bill payment")
    if t["status"] not in ("pending", "success"):
        raise HTTPException(400, "Only pending or success transactions can be reversed")
        
    new_balance = await adjust_balance(t["user_id"], t["amount"])
    await db.transactions.update_one({"id": tid}, {"$set": {
        "status": "reversed", 
        "note": body.note or "Manually reversed/refunded by Super Admin", 
        "reviewed_by": user["id"], 
        "reviewed_at": now_iso()
    }})
    await ledger_entry(t["user_id"], "refund", t["amount"], new_balance, "live_bill_refund", tid, f"Refund: Manually reversed/refunded by Super Admin for {t.get('customer_phone', 'Biller')}")
    
    # Log to Admin Statement (if previously success, reverse entries)
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    if t["status"] == "success":
        api_charge = float(s.get("live_bill_api_charge", 0.0))
        await log_admin_cashbook("credit", t["bill_amount"], "bbps_refund", tid, f"Reversal of Live Bill payout ({t.get('user_name', 'Agent')})")
        profit = round(t["service_charge"] - api_charge, 2)
        await log_admin_profit("debit", profit, "live_bill_reversal", tid, f"Reversal of Live Bill profit margin ({t.get('user_name', 'Agent')})")

    await write_audit(user["id"], "live_bill_reversed", target=tid, meta={"amount": t["amount"]}, request=request)
    rejected_audio = s.get("cc_bill_rejected_audio", "")
    await manager.send_to_user(t["user_id"], {"event": "cc_bill_updated", "data": {"id": tid, "status": "reversed", "audio_url": rejected_audio}})
    await manager.send_to_role("admin", {"event": "cc_bill_updated", "data": {"id": tid, "status": "reversed"}})
    return {"ok": True}

@api.post("/admin/live-billpay/{tid}/check-status")
async def admin_check_live_bill_status(tid: str, request: Request, user=Depends(require_roles("admin"))):
    t = await db.transactions.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Not found")
    if t["type"] != "live_bill":
        raise HTTPException(400, "Transaction is not a live bill payment")
    
    op_txn_id = t.get("operator_txn_id")
    if not op_txn_id:
        raise HTTPException(400, "Cannot check status: No operator transaction ID is associated with this transaction.")
        
    try:
        res = await call_irise_api("GET", f"status/{op_txn_id}")
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch status from provider: {str(e)}")
        
    if not res or res.get("status") != "success":
        raise HTTPException(400, f"Provider status check returned error: {res.get('message', 'Unknown error')}")
        
    data = res.get("data") or {}
    current_status = str(data.get("current_status") or data.get("status") or data.get("payment_status") or "pending").strip().lower()
    
    if t["status"] == "pending":
        if current_status in ("success", "successful", "00", "ok"):
            s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
            api_charge = float(s.get("live_bill_api_charge", 0.0))
            
            await db.transactions.update_one({"id": tid}, {"$set": {
                "status": "success",
                "reviewed_by": user["id"],
                "reviewed_at": now_iso(),
                "api_charge": api_charge
            }})
            
            await log_admin_cashbook("debit", t["bill_amount"], "bbps_payout", tid, f"Paid Live Bill for {t.get('user_name', 'Agent')} ({t.get('operator', 'Biller')})")
            profit = round(t["service_charge"] - api_charge, 2)
            await log_admin_profit("credit", profit, "live_bill_fee", tid, f"Profit margin from Live Bill ({t.get('user_name', 'Agent')})")
            
            await write_audit(user["id"], "live_bill_status_success", target=tid, meta={"amount": t["amount"], "op_txn_id": op_txn_id}, request=request)
            await manager.send_to_user(t["user_id"], {"event": "cc_bill_updated", "data": {"id": tid, "status": "success"}})
            await manager.send_to_role("admin", {"event": "cc_bill_updated", "data": {"id": tid, "status": "success"}})
            return {"ok": True, "status": "success", "message": "Transaction marked as SUCCESS based on Usepay API."}
            
        elif current_status in ("failed", "failure", "reversed", "reject", "rejected", "error"):
            new_balance = await adjust_balance(t["user_id"], t["amount"])
            await db.transactions.update_one({"id": tid}, {"$set": {
                "status": "reversed",
                "note": f"Automatically reversed/refunded based on Usepay API status: {current_status}",
                "reviewed_by": user["id"],
                "reviewed_at": now_iso()
            }})
            await ledger_entry(t["user_id"], "refund", t["amount"], new_balance, "live_bill_refund", tid, f"Refund: Auto-reversed based on Usepay API status for {t.get('customer_phone', 'Biller')}")
            
            await write_audit(user["id"], "live_bill_status_failed", target=tid, meta={"amount": t["amount"], "op_txn_id": op_txn_id}, request=request)
            await manager.send_to_user(t["user_id"], {"event": "cc_bill_updated", "data": {"id": tid, "status": "reversed"}})
            await manager.send_to_role("admin", {"event": "cc_bill_updated", "data": {"id": tid, "status": "reversed"}})
            return {"ok": True, "status": "reversed", "message": "Transaction marked as FAILED & REFUNDED based on Usepay API."}
            
        else:
            return {"ok": True, "status": "pending", "message": f"Transaction status at Usepay is: {current_status.upper()} (Awaited/Pending)."}
    else:
        return {"ok": True, "status": t["status"], "message": f"Transaction is already in status: {t['status']}"}

# ---------- WITHDRAWALS ----------
@api.post("/withdrawals")
async def create_withdrawal(body: WithdrawalIn, user=Depends(require_approved_any())):
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    if not s.get("withdrawal_enabled", True) and not user.get("is_tester", False):
        raise HTTPException(status_code=400, detail="Withdrawal service is currently disabled by administrator.")
    if body.amount <= 0:
        raise HTTPException(400, "Invalid amount")
    bank = await db.bank_details.find_one({"user_id": user["id"]}, {"_id": 0})
    missing = _bank_missing_fields(bank)
    if missing:
        raise HTTPException(
            400,
            "Please complete all your bank details (including phone number) before requesting a withdrawal.",
        )

    clean_bank = {
        "account_holder": bank.get("account_holder"),
        "account_number": bank.get("account_number"),
        "ifsc": bank.get("ifsc"),
        "bank_name": bank.get("bank_name"),
        "phone_number": bank.get("phone_number")
    }

    role = user["role"]
    wallet_debited = False
    new_balance = 0.0
    try:
        if role == "distributor":
            available = await get_distributor_available_for_withdrawal(user["id"])
            if body.amount > available:
                raise HTTPException(400, f"Insufficient earnings balance. Available: ₹{available:.2f}")
        elif role == "master_distributor":
            available = await get_md_available_for_withdrawal(user["id"])
            if body.amount > available:
                raise HTTPException(400, f"Insufficient earnings balance. Available: ₹{available:.2f}")
        else:
            # Agent: wallet debited at request time (existing).
            new_balance = await adjust_balance(user["id"], -body.amount)
            wallet_debited = True

        doc = {
            "id": new_id(),
            "user_id": user["id"],
            "user_name": user["full_name"],
            "role": role,
            "amount": body.amount,
            "status": "pending",
            "bank": clean_bank,
            "note": "",
            "created_at": now_iso(),
            "reviewed_at": None,
            "reviewed_by": None,
        }
        await db.withdrawals.insert_one(dict(doc))
        if role == "agent":
            await ledger_entry(user["id"], "debit", body.amount, new_balance, "withdrawal_hold", doc["id"], "Withdrawal hold")
        return clean(doc)
    except Exception as e:
        if role == "agent" and wallet_debited:
            try:
                await adjust_balance(user["id"], body.amount)
            except Exception as refund_err:
                logger.error(f"Failed to refund agent wallet after withdrawal failure: {refund_err}")
        raise e

@api.get("/withdrawals/mine")
async def my_withdrawals(user=Depends(require_approved_any())):
    return await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.get("/admin/withdrawals")
async def admin_withdrawals(
    status: Optional[str] = None,
    role_filter: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    amount: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    paginated: bool = False,
    user=Depends(require_roles("admin")),
):
    query = _build_withdrawal_query(status=status, role_filter=role_filter,
                                     from_ts=from_ts, to_ts=to_ts, q=q, amount=amount)
    if paginated:
        page = max(1, page); page_size = max(1, min(200, page_size))
        total = await db.withdrawals.count_documents(query)
        items = await db.withdrawals.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        items = await _enrich_reviewed_by_names(items)
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    items = await db.withdrawals.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
    return await _enrich_reviewed_by_names(items)

@api.post("/admin/withdrawals/{wid}/approve")
async def admin_approve_withdrawal(wid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    w = await db.withdrawals.find_one({"id": wid})
    if not w:
        raise HTTPException(404, "Not found")
    if w["status"] != "pending":
        raise HTTPException(400, "Already processed")

    role = w.get("role")
    if role == "distributor":
        live_balance = await _distributor_earnings_for(w["user_id"])
        if w["amount"] > live_balance:
            raise HTTPException(400, f"Cannot approve — distributor's live earnings balance is ₹{live_balance:.2f}")
        await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "approved", "note": body.note or "", "reviewed_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}})
        balance_after = await get_distributor_available_for_withdrawal(w["user_id"])
        await ledger_entry(w["user_id"], "debit", w["amount"], balance_after, "withdrawal_paid", wid, "Withdrawal approved & paid")
    elif role == "master_distributor":
        live_balance = await _md_earnings_for(w["user_id"])
        if w["amount"] > live_balance:
            raise HTTPException(400, f"Cannot approve — master distributor's live earnings balance is ₹{live_balance:.2f}")
        await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "approved", "note": body.note or "", "reviewed_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}})
        balance_after = await get_md_available_for_withdrawal(w["user_id"])
        await ledger_entry(w["user_id"], "debit", w["amount"], balance_after, "withdrawal_paid", wid, "Withdrawal approved & paid")
    else:
        await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "approved", "note": body.note or "", "reviewed_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}})
        wallet = await get_or_create_wallet(w["user_id"])
        await ledger_entry(w["user_id"], "adjustment", 0, wallet["balance"], "withdrawal_paid", wid, "Withdrawal approved & paid")

    await asyncio.gather(
        log_admin_cashbook("debit", w["amount"], "withdrawal_payout", wid, f"Withdrawal paid to {w.get('user_name', 'User')} ({w.get('role', 'Agent')})"),
        write_audit(user["id"], "approve_withdrawal", target=wid, request=request)
    )
    return {"ok": True}

@api.post("/admin/withdrawals/{wid}/reject")
async def admin_reject_withdrawal(wid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    w = await db.withdrawals.find_one({"id": wid})
    if not w:
        raise HTTPException(404, "Not found")
    if w["status"] != "pending":
        raise HTTPException(400, "Already processed")

    role = w.get("role")
    if role in ("distributor", "master_distributor"):
        # No wallet was debited — just flip status, pending reservation released.
        await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "rejected", "note": body.note or "", "reviewed_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}})
    else:
        new_balance = await adjust_balance(w["user_id"], w["amount"])
        await db.withdrawals.update_one({"id": wid}, {"$set": {"status": "rejected", "note": body.note or "", "reviewed_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}})
        await ledger_entry(w["user_id"], "refund", w["amount"], new_balance, "withdrawal_refund", wid, "Withdrawal rejected - refunded")

    await write_audit(user["id"], "reject_withdrawal", target=wid, request=request)
    return {"ok": True}

REQUIRED_BANK_FIELDS = ("account_holder", "account_number", "ifsc", "bank_name", "phone_number")


def _bank_missing_fields(bank: Optional[dict]) -> list:
    """Return the list of required bank fields that are missing/empty/invalid.
    Applies to legacy records saved before Phone Number was added — any such
    record will show `phone_number` as missing here."""
    if not bank:
        return list(REQUIRED_BANK_FIELDS)
    missing: list = []
    for f in REQUIRED_BANK_FIELDS:
        v = (bank.get(f) or "")
        if isinstance(v, str):
            v = v.strip()
        if not v:
            missing.append(f)
    # Phone-format check — must be exactly 10 digits (matches save-time rule).
    phone = str(bank.get("phone_number") or "").strip()
    if phone and (not phone.isdigit() or len(phone) != 10) and "phone_number" not in missing:
        missing.append("phone_number")
    return missing


# ---------- BANK DETAILS ----------
@api.post("/bank")
async def save_bank(body: BankIn, user=Depends(require_roles("agent", "distributor", "master_distributor"))):
    # Require every field non-empty after trimming.
    for f in ("account_holder", "account_number", "ifsc", "bank_name"):
        if not (getattr(body, f) or "").strip():
            raise HTTPException(400, f"{f.replace('_', ' ').title()} is required")
    # Phone Number validation — Indian mobile. Accept optional +91 prefix,
    # normalise to 10 digits digits-only for consistent storage.
    phone = (body.phone_number or "").strip().replace(" ", "").replace("-", "")
    if phone.startswith("+91"):
        phone = phone[3:]
    elif phone.startswith("91") and len(phone) == 12:
        phone = phone[2:]
    if not phone.isdigit() or len(phone) != 10:
        raise HTTPException(400, "Phone Number must be exactly 10 digits")
    doc = {
        "account_holder": body.account_holder.strip(),
        "account_number": body.account_number.strip(),
        "ifsc": body.ifsc.strip(),
        "bank_name": body.bank_name.strip(),
        "phone_number": phone,
        "user_id": user["id"],
        "updated_at": now_iso(),
    }
    await db.bank_details.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    return doc

@api.get("/bank")
async def get_bank(user=Depends(require_roles("agent", "distributor", "master_distributor"))):
    bank = await db.bank_details.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    missing = _bank_missing_fields(bank if bank else None)
    return {**bank, "missing_fields": missing, "is_complete": not missing}

# ---------- KYC ----------
@api.get("/admin/kyc")
async def admin_kyc(user=Depends(require_roles("admin"))):
    """List every agent's KYC record with full details for review.
    Joined with the agent (name/phone/address) and the creating distributor.
    """
    async with db.pool.acquire() as conn:
        rows = await conn.fetch('''
            SELECT 
                k.id, k.user_id, k.status as kyc_record_status, k.rejection_reason, k.updated_at, k.reviewed_at, k.reviewed_by,
                k.aadhaar_path, k.pan_path, k.aadhaar_back_path, k.pan_back_path, k.selfie_path, k.cheque_path, k.firm_front_path,
                u.full_name, u.email, u.role, u.phone, u.address, u.parent_id, u.firm_name, u.firm_address, u.created_by_role, u.kyc_status, u.created_at,
                p.full_name as distributor_name
            FROM kyc k
            JOIN users u ON k.user_id = u.id
            LEFT JOIN users p ON u.parent_id = p.id
            WHERE u.role IN ('agent', 'distributor', 'master_distributor') AND u.is_deleted = FALSE
            ORDER BY k.updated_at DESC
            LIMIT 2000
        ''')
        
    enriched = []
    for r in rows:
        enriched.append({
            "id": str(r["id"]),
            "user_id": str(r["user_id"]),
            "aadhaar_path": r["aadhaar_path"],
            "pan_path": r["pan_path"],
            "aadhaar_back_path": r["aadhaar_back_path"],
            "pan_back_path": r["pan_back_path"],
            "selfie_path": r["selfie_path"],
            "cheque_path": r["cheque_path"],
            "firm_front_path": r["firm_front_path"],
            "status": r["kyc_status"] or r["kyc_record_status"] or "pending",
            "rejection_reason": r["rejection_reason"],
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None,
            "reviewed_by": str(r["reviewed_by"]) if r["reviewed_by"] else None,
            "submitted_at": r["created_at"].isoformat() if r["created_at"] else (r["updated_at"].isoformat() if r["updated_at"] else None),
            "distributor_name": r["distributor_name"] or "Admin",
            "user": {
                "id": str(r["user_id"]),
                "full_name": r["full_name"],
                "email": r["email"],
                "role": r["role"],
                "phone": r["phone"],
                "address": r["address"],
                "parent_id": str(r["parent_id"]) if r["parent_id"] else None,
                "firm_name": r["firm_name"],
                "firm_address": r["firm_address"],
                "created_by_role": r["created_by_role"],
                "kyc_status": r["kyc_status"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
        })
    return await _enrich_reviewed_by_names(enriched)


@api.post("/admin/kyc/{uid}/approve")
async def admin_approve_kyc(uid: str, request: Request, user=Depends(require_roles("admin"))):
    target = await db.users.find_one({"id": uid, "role": {"$in": ["agent", "distributor", "master_distributor"]}})
    if not target:
        raise HTTPException(404, "User not found")
    await asyncio.gather(
        db.kyc.update_one(
            {"user_id": uid},
            {"$set": {"status": "approved", "rejection_reason": "",
                      "reviewed_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}},
        ),
        db.users.update_one(
            {"id": uid},
            {"$set": {"kyc_status": "approved", "kyc_rejection_reason": "",
                      "kyc_reviewed_at": now_iso(), "kyc_reviewed_by": user["id"], "kyc_reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}},
        ),
        write_audit(user["id"], "kyc_approved", target=uid,
                    meta={"user_id": uid, "user_name": target.get("full_name", ""), "role": target.get("role")},
                    request=request)
    )
    await manager.send_to_user(uid, {"event": "kyc_updated", "data": {"user_id": uid, "status": "approved"}})
    await manager.send_to_role("admin", {"event": "kyc_updated", "data": {"user_id": uid, "status": "approved"}})
    return {"ok": True, "kyc_status": "approved"}


@api.post("/admin/kyc/{uid}/reject")
async def admin_reject_kyc(uid: str, body: ApprovalIn, request: Request, user=Depends(require_roles("admin"))):
    target = await db.users.find_one({"id": uid, "role": {"$in": ["agent", "distributor", "master_distributor"]}})
    if not target:
        raise HTTPException(404, "User not found")
    reason = (body.note or "").strip()
    await db.kyc.update_one(
        {"user_id": uid},
        {"$set": {"status": "rejected", "rejection_reason": reason,
                  "reviewed_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}},
    )
    await db.users.update_one(
        {"id": uid},
        {"$set": {"kyc_status": "rejected", "kyc_rejection_reason": reason,
                  "kyc_reviewed_at": now_iso(), "kyc_reviewed_by": user["id"], "kyc_reviewed_by_name": user.get("full_name") or user.get("email") or "Admin"}},
    )
    await write_audit(user["id"], "kyc_rejected", target=uid,
                      meta={"agent_id": uid, "agent_name": target.get("full_name", ""), "reason": reason},
                      request=request)
    await manager.send_to_user(uid, {"event": "kyc_updated", "data": {"user_id": uid, "status": "rejected"}})
    await manager.send_to_role("admin", {"event": "kyc_updated", "data": {"user_id": uid, "status": "rejected"}})
    return {"ok": True, "kyc_status": "rejected"}

# ---------- QR CODES ----------
async def log_qr_deactivation(is_t1: bool = False):
    now = now_iso()
    async with db.pool.acquire() as conn:
        await conn.execute(
            "UPDATE qr_activation_history SET deactivated_at = $1, status = 'ARCHIVED' WHERE status = 'ACTIVE' AND (is_t1 = $2 OR (is_t1 IS NULL AND $2 = False))",
            convert_val("deactivated_at", now),
            is_t1
        )

async def log_qr_activation(qr_code_id: str, label: str, mobile_number: str, upi_id: str, is_t1: bool = False):
    await log_qr_deactivation(is_t1)
    now = now_iso()
    clean_label = label.strip()
    async with db.pool.acquire() as conn:
        # Fetch matching entry from qr_name_entries to get qr_percent
        qr_entry = await conn.fetchrow(
            "SELECT qr_percent FROM qr_name_entries WHERE TRIM(name) = TRIM($1) AND is_deleted = False LIMIT 1",
            clean_label
        )
        qr_percent = float(qr_entry["qr_percent"]) if qr_entry and qr_entry["qr_percent"] is not None else 0.0
        
        await conn.execute(
            """
            INSERT INTO qr_activation_history (id, qr_code_id, label, mobile_number, upi_id, qr_percent, activated_at, status, is_t1)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
            """,
            new_id(),
            qr_code_id,
            label,
            mobile_number or "",
            upi_id or "",
            Decimal(str(qr_percent)),
            convert_val("activated_at", now),
            is_t1
        )

@api.get("/admin/qrcodes/history")
async def admin_qr_history(
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    user=Depends(require_roles("admin"))
):
    import datetime
    from_dt = None
    to_dt = None
    if from_ts:
        try:
            from_dt = datetime.datetime.fromisoformat(from_ts.replace("Z", "+00:00"))
        except Exception:
            pass
    if to_ts:
        try:
            to_dt = datetime.datetime.fromisoformat(to_ts.replace("Z", "+00:00"))
        except Exception:
            pass

    async with db.pool.acquire() as conn:
        sql = """
            WITH latest_session_per_recharge AS (
                SELECT 
                    r.id as recharge_id,
                    r.status as recharge_status,
                    r.amount,
                    r.admin_revenue_amount,
                    r.md_earnings_amount,
                    r.distributor_earnings_amount,
                    r.created_at as recharge_created_at,
                    (
                        SELECT h.id 
                        FROM qr_activation_history h
                        WHERE (h.qr_code_id::text = r.qr_code_id::text OR TRIM(h.label) = TRIM(r.qr_code_label))
                          AND (h.is_t1 = r.is_t1 OR (h.is_t1 IS NULL AND r.is_t1 = False))
                          AND h.activated_at <= r.created_at
                        ORDER BY h.activated_at DESC
                        LIMIT 1
                    ) as matched_history_id
                FROM recharges r
                WHERE ($1::timestamptz IS NULL OR r.created_at >= $1::timestamptz)
                  AND ($2::timestamptz IS NULL OR r.created_at <= $2::timestamptz)
            )
            SELECT 
                h.id as history_id,
                h.qr_code_id,
                h.label,
                h.mobile_number,
                h.upi_id,
                COALESCE(h.qr_percent, 0) as qr_percent,
                h.activated_at,
                h.deactivated_at,
                h.status as session_status,
                h.is_t1,
                COUNT(ls.recharge_id) as total_entries,
                COUNT(CASE WHEN ls.recharge_status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN ls.recharge_status = 'approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN ls.recharge_status = 'rejected' THEN 1 END) as rejected_count,
                COALESCE(SUM(CASE WHEN ls.recharge_status = 'approved' THEN ls.amount END), 0) as approved_amount,
                COALESCE(SUM(CASE WHEN ls.recharge_status = 'approved' THEN ls.admin_revenue_amount END), 0) as admin_revenue,
                COALESCE(SUM(CASE WHEN ls.recharge_status = 'approved' THEN ls.md_earnings_amount END), 0) as md_earnings,
                COALESCE(SUM(CASE WHEN ls.recharge_status = 'approved' THEN ls.distributor_earnings_amount END), 0) as dist_earnings
            FROM qr_activation_history h
            LEFT JOIN latest_session_per_recharge ls ON ls.matched_history_id = h.id
            WHERE h.status = 'ACTIVE' 
               OR ($1::timestamptz IS NULL AND $2::timestamptz IS NULL)
               OR (h.activated_at <= $2::timestamptz AND (h.deactivated_at IS NULL OR h.deactivated_at >= $1::timestamptz))
               OR ls.recharge_id IS NOT NULL
            GROUP BY h.id, h.qr_code_id, h.label, h.mobile_number, h.upi_id, h.qr_percent, h.activated_at, h.deactivated_at, h.status, h.is_t1
            ORDER BY h.activated_at DESC
            LIMIT 200
        """
        rows = await conn.fetch(sql, from_dt, to_dt)

        history = []
        for r in rows:
            admin_revenue = float(r["admin_revenue"] or 0)
            md_earnings = float(r["md_earnings"] or 0)
            dist_earnings = float(r["dist_earnings"] or 0)
            total_profit = round(admin_revenue + md_earnings + dist_earnings, 2)
            qr_percent = float(r["qr_percent"]) if r["qr_percent"] is not None else 0.0
            approved_amount = round(float(r["approved_amount"] or 0), 2)
            qr_profit = round(approved_amount * (qr_percent / 100.0), 2)
            final_profit = round(total_profit - qr_profit, 2)

            activated_at = r["activated_at"]
            deactivated_at = r["deactivated_at"]

            history.append({
                "id": str(r["history_id"]),
                "qr_code_id": str(r["qr_code_id"]) if r["qr_code_id"] else "",
                "label": r["label"],
                "mobile_number": r["mobile_number"],
                "upi_id": r["upi_id"],
                "qr_percent": qr_percent,
                "activated_at": activated_at.isoformat() if activated_at else None,
                "deactivated_at": deactivated_at.isoformat() if deactivated_at else None,
                "status": r["session_status"],
                "is_t1": bool(r["is_t1"]) if r["is_t1"] is not None else False,
                "entries": r["total_entries"] or 0,
                "breakdown": {
                    "pending": r["pending_count"] or 0,
                    "approved": r["approved_count"] or 0,
                    "rejected": r["rejected_count"] or 0
                },
                "approved_amount": round(float(r["approved_amount"] or 0), 2),
                "admin_revenue": round(admin_revenue, 2),
                "md_earnings": round(md_earnings, 2),
                "dist_earnings": round(dist_earnings, 2),
                "total_profit": total_profit,
                "qr_profit": qr_profit,
                "final_profit": final_profit
            })

        unmatched_sql = """
            SELECT 
                COUNT(r.id) as total_entries,
                COUNT(CASE WHEN r.status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN r.status = 'rejected' THEN 1 END) as rejected_count,
                COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.amount END), 0) as approved_amount,
                COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.admin_revenue_amount END), 0) as admin_revenue,
                COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.md_earnings_amount END), 0) as md_earnings,
                COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.distributor_earnings_amount END), 0) as dist_earnings
            FROM recharges r
            LEFT JOIN qr_activation_history h
              ON (h.qr_code_id::text = r.qr_code_id::text OR TRIM(h.label) = TRIM(r.qr_code_label))
             AND (h.is_t1 = r.is_t1 OR (h.is_t1 IS NULL AND r.is_t1 = False))
             AND h.activated_at <= r.created_at
            WHERE h.id IS NULL
              AND ($1::timestamptz IS NULL OR r.created_at >= $1::timestamptz)
              AND ($2::timestamptz IS NULL OR r.created_at <= $2::timestamptz)
        """
        unmatched_row = await conn.fetchrow(unmatched_sql, from_dt, to_dt)
        if unmatched_row and (unmatched_row["total_entries"] or 0) > 0:
            admin_revenue = float(unmatched_row["admin_revenue"] or 0)
            md_earnings = float(unmatched_row["md_earnings"] or 0)
            dist_earnings = float(unmatched_row["dist_earnings"] or 0)
            total_profit = round(admin_revenue + md_earnings + dist_earnings, 2)
            approved_amount = round(float(unmatched_row["approved_amount"] or 0), 2)
            history.append({
                "id": "unmatched_legacy",
                "qr_code_id": "",
                "label": "Other / Direct Recharges",
                "mobile_number": "-",
                "upi_id": "-",
                "qr_percent": 0.0,
                "activated_at": None,
                "deactivated_at": None,
                "status": "OTHER",
                "is_t1": False,
                "entries": unmatched_row["total_entries"] or 0,
                "breakdown": {
                    "pending": unmatched_row["pending_count"] or 0,
                    "approved": unmatched_row["approved_count"] or 0,
                    "rejected": unmatched_row["rejected_count"] or 0
                },
                "approved_amount": approved_amount,
                "admin_revenue": round(admin_revenue, 2),
                "md_earnings": round(md_earnings, 2),
                "dist_earnings": round(dist_earnings, 2),
                "total_profit": total_profit,
                "qr_profit": 0.0,
                "final_profit": total_profit
            })
        return history

@api.put("/admin/qrcodes/history/{hid}/percent")
async def update_qr_history_percent(hid: str, body: UpdateHistoryPercentIn, user=Depends(require_roles("admin"))):
    if body.qr_percent < 0 or body.qr_percent > 100:
        raise HTTPException(400, "Invalid QR percentage")
        
    async with db.pool.acquire() as conn:
        res = await conn.execute(
            "UPDATE qr_activation_history SET qr_percent = $1 WHERE id = $2",
            Decimal(str(body.qr_percent)),
            hid
        )
        if not res or res == "UPDATE 0":
            raise HTTPException(404, "History record not found")
            
    return {"ok": True, "history_id": hid, "qr_percent": body.qr_percent}

@api.post("/admin/qrcodes")
async def admin_create_qr(body: QRCodeIn, user=Depends(require_roles("admin"))):
    is_t1 = body.is_t1 or False
    if body.is_t1 is None:
        entry = await db.qr_name_entries.find_one({"name": body.label, "is_deleted": False})
        if entry:
            is_t1 = entry.get("is_t1", False)

    await db.qr_codes.update_many({"is_t1": is_t1}, {"$set": {"active": False}})
    doc = {
        "id": new_id(),
        "label": body.label,
        "image_path": body.image_path,
        "upi_id": body.upi_id or "",
        "mobile_number": body.mobile_number or "",
        "active": True,
        "is_deleted": False,
        "created_at": now_iso(),
        "is_t1": is_t1,
    }
    await db.qr_codes.insert_one(dict(doc))
    await log_qr_activation(doc["id"], doc["label"], doc["mobile_number"], doc["upi_id"], doc["is_t1"])
    await manager.broadcast({"event": "settings_updated", "data": {}})
    return clean(doc)

@api.get("/admin/qrcodes")
async def admin_list_qr(stats: bool = False, user=Depends(require_roles("admin"))):
    qrs = await db.qr_codes.find({"is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(100)
    if stats:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT 
                    qr_code_id,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN amount END), 0) AS approved_amount,
                    COUNT(*) AS total_count,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_count,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected_count
                FROM recharges
                GROUP BY qr_code_id
            """)
            stats_map = {}
            for r in rows:
                if r["qr_code_id"]:
                    stats_map[str(r["qr_code_id"])] = {
                        "approved_amount": float(r["approved_amount"]),
                        "total_entries": r["total_count"] or 0,
                        "pending": r["pending_count"] or 0,
                        "approved": r["approved_count"] or 0,
                        "rejected": r["rejected_count"] or 0
                    }
                    
            for qr in qrs:
                qid = qr["id"]
                qr["stats"] = stats_map.get(qid, {
                    "approved_amount": 0.0,
                    "total_entries": 0,
                    "pending": 0,
                    "approved": 0,
                    "rejected": 0
                })
    return qrs

@api.patch("/admin/qrcodes/{qid}/activate")
async def admin_activate_qr(qid: str, user=Depends(require_roles("admin"))):
    qr = await db.qr_codes.find_one({"id": qid})
    if not qr:
        raise HTTPException(404, "QR Code not found")
    is_t1 = qr.get("is_t1", False)
    await db.qr_codes.update_many({"is_t1": is_t1}, {"$set": {"active": False}})
    await db.qr_codes.update_one({"id": qid}, {"$set": {"active": True}})
    await log_qr_activation(qid, qr["label"], qr.get("mobile_number", ""), qr.get("upi_id", ""))
    await manager.broadcast({"event": "settings_updated", "data": {}})
    return {"ok": True}

@api.delete("/admin/qrcodes/{qid}")
async def admin_delete_qr(qid: str, user=Depends(require_roles("admin"))):
    qr = await db.qr_codes.find_one({"id": qid})
    if qr and qr.get("active"):
        await log_qr_deactivation()
    await db.qr_codes.update_one({"id": qid}, {"$set": {"is_deleted": True, "active": False}})
    await manager.broadcast({"event": "settings_updated", "data": {}})
    return {"ok": True}

# ---------- SERVICE CHARGE SLABS ----------
@api.get("/admin/service-slabs")
async def admin_list_service_slabs(user=Depends(require_roles("admin"))):
    return await db.service_charge_slabs.find({"is_deleted": False}, {"_id": 0}).sort("min_amount", 1).to_list(100)

@api.post("/admin/service-slabs")
async def admin_create_service_slab(body: ServiceChargeSlabIn, user=Depends(require_roles("admin"))):
    if body.min_amount < 0 or body.max_amount <= body.min_amount or body.charge_amount < 0:
        raise HTTPException(400, "Invalid amounts configuration")
    if body.charge_type not in ("flat", "percent"):
        raise HTTPException(400, "Invalid charge type")
    doc = {
        "id": new_id(),
        "min_amount": body.min_amount,
        "max_amount": body.max_amount,
        "charge_amount": body.charge_amount,
        "charge_type": body.charge_type,
        "active": True,
        "is_deleted": False,
        "created_at": now_iso()
    }
    await db.service_charge_slabs.insert_one(dict(doc))
    return clean(doc)

@api.patch("/admin/service-slabs/{sid}/toggle")
async def admin_toggle_service_slab(sid: str, user=Depends(require_roles("admin"))):
    slab = await db.service_charge_slabs.find_one({"id": sid})
    if not slab:
        raise HTTPException(404, "Slab not found")
    new_active = not slab.get("active", True)
    await db.service_charge_slabs.update_one({"id": sid}, {"$set": {"active": new_active}})
    return {"ok": True, "active": new_active}

@api.delete("/admin/service-slabs/{sid}")
async def admin_delete_service_slab(sid: str, user=Depends(require_roles("admin"))):
    await db.service_charge_slabs.update_one({"id": sid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@api.get("/billing/service-slabs")
async def list_active_service_slabs(user=Depends(get_current_user)):
    return await db.service_charge_slabs.find({"is_deleted": False, "active": True}, {"_id": 0}).sort("min_amount", 1).to_list(100)

# ---------- BANK MANAGEMENT ----------
@api.get("/admin/banks")
async def admin_list_banks(user=Depends(require_roles("admin"))):
    return await db.banks.find({"is_deleted": False}, {"_id": 0}).sort("name", 1).to_list(500)

@api.post("/admin/banks")
async def admin_create_bank(body: BankEntryIn, user=Depends(require_roles("admin"))):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Bank name cannot be empty")
    existing = await db.banks.find_one({"name": name, "is_deleted": False})
    if existing:
        raise HTTPException(400, "Bank name already exists")
    doc = {
        "id": new_id(),
        "name": name,
        "active": True,
        "bill_pay_enabled": body.bill_pay_enabled,
        "payout_enabled": body.payout_enabled,
        "is_deleted": False,
        "created_at": now_iso()
    }
    await db.banks.insert_one(dict(doc))
    return clean(doc)

@api.patch("/admin/banks/{bid}")
async def admin_update_bank(bid: str, body: BankUpdateIn, user=Depends(require_roles("admin"))):
    bank = await db.banks.find_one({"id": bid})
    if not bank:
        raise HTTPException(404, "Bank not found")
    upd = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Bank name cannot be empty")
        existing = await db.banks.find_one({"name": name, "is_deleted": False})
        if existing and existing["id"] != bid:
            raise HTTPException(400, "Bank name already exists")
        upd["name"] = name
    if body.active is not None:
        upd["active"] = body.active
    if body.bill_pay_enabled is not None:
        upd["bill_pay_enabled"] = body.bill_pay_enabled
    if body.payout_enabled is not None:
        upd["payout_enabled"] = body.payout_enabled
        
    if upd:
        await db.banks.update_one({"id": bid}, {"$set": upd})
    return {"ok": True}

@api.delete("/admin/banks/{bid}")
async def admin_delete_bank(bid: str, user=Depends(require_roles("admin"))):
    await db.banks.update_one({"id": bid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@api.get("/billing/banks")
async def list_active_bill_pay_banks(user=Depends(get_current_user)):
    return await db.banks.find({"is_deleted": False, "active": True}, {"_id": 0}).sort("name", 1).to_list(500)

@api.get("/billing/payout-banks")
async def list_active_payout_banks(user=Depends(get_current_user)):
    return await db.banks.find({"is_deleted": False, "active": True, "payout_enabled": True}, {"_id": 0}).sort("name", 1).to_list(500)

# ---------- QR NAME ENTRIES ----------
@api.get("/admin/qr-name-entries")
async def admin_list_qr_name_entries(user=Depends(require_roles("admin"))):
    entries = await db.qr_name_entries.find({"is_deleted": False}, {"_id": 0}).sort("position", 1).to_list(100)
    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT DISTINCT ON (TRIM(label)) TRIM(label) as label, activated_at
                FROM qr_activation_history
                ORDER BY TRIM(label), activated_at DESC
            """)
            act_map = {r["label"]: (r["activated_at"].isoformat() if r["activated_at"] else None) for r in rows}
            for e in entries:
                clean_n = (e.get("name") or "").strip()
                e["activated_at"] = act_map.get(clean_n) or e.get("created_at")
    except Exception as ex:
        logger.error(f"Failed to fetch history timestamps for qr_name_entries: {ex}")
    return entries

@api.post("/admin/qr-name-entries")
async def admin_create_qr_name_entry(body: QRNameEntryIn, user=Depends(require_roles("admin"))):
    entries = await db.qr_name_entries.find({"is_deleted": False}).to_list(100)
    max_pos = max([e.get("position", 0) for e in entries]) if entries else 0
    doc = {
        "id": new_id(),
        "name": body.name,
        "color": body.color,
        "mobile_number": body.mobile_number,
        "upi_id": body.upi_id,
        "min_amount": body.min_amount,
        "max_amount": body.max_amount,
        "image_path": body.image_path,
        "position": max_pos + 1,
        "active": True,
        "is_deleted": False,
        "created_at": now_iso(),
        "qr_percent": body.qr_percent or 0.0,
        "is_t1": body.is_t1 or False,
    }
    await db.qr_name_entries.insert_one(dict(doc))
    return clean(doc)

@api.put("/admin/qr-name-entries/reorder")
async def admin_reorder_qr_name_entries(body: QRReorderIn, user=Depends(require_roles("admin"))):
    for idx, eid in enumerate(body.ids):
        await db.qr_name_entries.update_one({"id": eid}, {"$set": {"position": idx + 1}})
    return {"ok": True}

@api.put("/admin/qr-name-entries/{eid}")
async def admin_update_qr_name_entry(eid: str, body: QRNameEntryIn, user=Depends(require_roles("admin"))):
    await db.qr_name_entries.update_one({"id": eid}, {"$set": {
        "name": body.name,
        "color": body.color,
        "mobile_number": body.mobile_number,
        "upi_id": body.upi_id,
        "min_amount": body.min_amount,
        "max_amount": body.max_amount,
        "image_path": body.image_path,
        "qr_percent": body.qr_percent or 0.0,
        "is_t1": body.is_t1 or False,
    }})
    return {"ok": True}

@api.patch("/admin/qr-name-entries/{eid}/toggle")
async def admin_toggle_qr_name_entry(eid: str, user=Depends(require_roles("admin"))):
    entry = await db.qr_name_entries.find_one({"id": eid}, {"_id": 0})
    if not entry:
        raise HTTPException(404, "Entry not found")
    await db.qr_name_entries.update_one({"id": eid}, {"$set": {"active": not entry.get("active", True)}})
    return {"ok": True, "active": not entry.get("active", True)}

@api.delete("/admin/qr-name-entries/{eid}")
async def admin_delete_qr_name_entry(eid: str, user=Depends(require_roles("admin"))):
    await db.qr_name_entries.update_one({"id": eid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------- COMMISSION SETTINGS ----------
@api.get("/admin/settings/commission")
async def get_commission(user=Depends(require_roles("admin"))):
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0})
    if not s:
        return {"id": "commission", "default_percent": 1.2}
    return {"id": "commission", "default_percent": s.get("default_percent", 1.2)}

@api.put("/admin/settings/commission")
async def set_commission(body: CommissionSettingsIn, request: Request, user=Depends(require_roles("admin"))):
    if body.default_percent < 0:
        raise HTTPException(400, "Default commission cannot be negative")
    new_default = round(float(body.default_percent), 4)
    prev = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    old_default = float(prev.get("default_percent", 1.2))
    doc = {"id": "commission", "default_percent": new_default, "updated_at": now_iso()}
    await db.settings.update_one({"id": "commission"}, {"$set": doc}, upsert=True)

    # 1) Update default-mode Master Distributors: their commission_percent + admin_pct = new_default.
    default_md_ids = [u["id"] async for u in db.users.find({"role": "master_distributor", "commission_type": "default"}, {"_id": 0, "id": 1})]
    md_update = {
        "commission_percent": new_default,
        "base_commission": new_default,
        "total_commission": new_default,
        "admin_pct": new_default,
    }
    md_res = await db.users.update_many({"role": "master_distributor", "commission_type": "default"}, {"$set": md_update})

    # 2) Update default-mode admin-created distributors (legacy path unchanged).
    default_dist_ids = [u["id"] async for u in db.users.find({"role": "distributor", "commission_type": "default", "md_id": None}, {"_id": 0, "id": 1})]
    update_set = {
        "commission_percent": new_default,
        "base_commission": new_default,
        "total_commission": new_default,
        "markup_commission": 0.0,
        "admin_pct": new_default,
        "md_pct": 0.0,
        "dist_pct": 0.0,
    }
    d_res = await db.users.update_many({"role": "distributor", "commission_type": "default", "md_id": None}, {"$set": update_set})

    # 3) Update admin-created default-mode agents (legacy path unchanged).
    a_res = await db.users.update_many({"role": "agent", "created_by_role": "admin", "commission_type": "default"}, {"$set": update_set})

    total_updated = md_res.modified_count + d_res.modified_count + a_res.modified_count

    # 4) Cascade agents under each affected admin-created distributor (legacy).
    cascaded_agents = 0
    for did in default_dist_ids:
        cascaded_agents += await cascade_distributor_agents(did, new_default, user["id"],
                                                            old_distributor_pct=old_default,
                                                            reason="default_commission_cascade", request=request)

    # 5) Cascade the whole downstream under each affected MD (their downline needs admin_pct refreshed).
    md_downline_updated = 0
    for mid in default_md_ids:
        md_downline_updated += await cascade_md_downstream(mid, new_default, user["id"],
                                                           reason="default_commission_cascade_md",
                                                           request=request)

    await write_audit(user["id"], "default_commission_changed", target="settings",
                      meta={"old": old_default, "new": new_default,
                            "records_updated": total_updated,
                            "agents_cascaded": cascaded_agents,
                            "md_downline_updated": md_downline_updated},
                      request=request)
    if total_updated > 0:
        await write_audit(user["id"], "default_commission_bulk_update", target="settings",
                          meta={"new": new_default,
                                "master_distributors_updated": md_res.modified_count,
                                "distributors_updated": d_res.modified_count,
                                "agents_updated": a_res.modified_count,
                                "agents_cascaded": cascaded_agents,
                                "md_downline_updated": md_downline_updated},
                          request=request)
    return {**doc, "records_updated": total_updated, "agents_cascaded": cascaded_agents, "md_downline_updated": md_downline_updated}

@api.get("/settings/commission-public")
async def public_commission(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0})
    return {"default_percent": (s or {}).get("default_percent", 1.2)}

@api.get("/settings/recharge-limits-public")
async def public_recharge_limits(response: Response, user: dict = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    
    is_tester = bool(user.get("is_tester", False)) if user else False
    if is_tester:
        return {
            "min_recharge_limit": float(s.get("min_recharge_limit", 100)),
            "max_recharge_limit": float(s.get("max_recharge_limit", 300000)),
            "live_bill_max_limit": float(s.get("live_bill_max_limit", 100000)),
            "min_fund_transfer_limit": float(s.get("min_fund_transfer_limit", 100)),
            "fund_transfer_enabled": True,
            "qr_enabled": True,
            "t1_qr_enabled": True,
            "recharge_enabled": True,
            "t1_recharge_enabled": True,
            "withdrawal_enabled": True,
            "bill_pay_enabled": True,
            "live_bill_enabled": True,
            "maintenance_mode": False
        }
        
    return {
        "min_recharge_limit": float(s.get("min_recharge_limit", 100)),
        "max_recharge_limit": float(s.get("max_recharge_limit", 300000)),
        "live_bill_max_limit": float(s.get("live_bill_max_limit", 100000)),
        "min_fund_transfer_limit": float(s.get("min_fund_transfer_limit", 100)),
        "fund_transfer_enabled": bool(s.get("fund_transfer_enabled", True)),
        "qr_enabled": bool(s.get("qr_enabled", True)),
        "t1_qr_enabled": bool(s.get("t1_qr_enabled", True)),
        "recharge_enabled": bool(s.get("recharge_enabled", True)),
        "t1_recharge_enabled": bool(s.get("t1_recharge_enabled", True)),
        "withdrawal_enabled": bool(s.get("withdrawal_enabled", True)),
        "bill_pay_enabled": bool(s.get("bill_pay_enabled", True)),
        "live_bill_enabled": bool(s.get("live_bill_enabled", True)),
        "maintenance_mode": bool(s.get("maintenance_mode", False))
    }

@api.get("/admin/settings/recharge-limits")
async def get_admin_recharge_limits(response: Response, user=Depends(require_roles("admin"))):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    return {
        "min_recharge_limit": float(s.get("min_recharge_limit", 100)),
        "max_recharge_limit": float(s.get("max_recharge_limit", 300000)),
        "live_bill_max_limit": float(s.get("live_bill_max_limit", 100000)),
        "min_fund_transfer_limit": float(s.get("min_fund_transfer_limit", 100)),
        "fund_transfer_enabled": bool(s.get("fund_transfer_enabled", True)),
        "qr_enabled": bool(s.get("qr_enabled", True)),
        "t1_qr_enabled": bool(s.get("t1_qr_enabled", True)),
        "recharge_enabled": bool(s.get("recharge_enabled", True)),
        "t1_recharge_enabled": bool(s.get("t1_recharge_enabled", True)),
        "withdrawal_enabled": bool(s.get("withdrawal_enabled", True)),
        "bill_pay_enabled": bool(s.get("bill_pay_enabled", True)),
        "live_bill_enabled": bool(s.get("live_bill_enabled", True)),
        "live_bill_api_charge": float(s.get("live_bill_api_charge", 0.0)),
        "maintenance_mode": bool(s.get("maintenance_mode", False)),
        "qr_approved_audio": s.get("qr_approved_audio", ""),
        "qr_rejected_audio": s.get("qr_rejected_audio", ""),
        "cc_bill_approved_audio": s.get("cc_bill_approved_audio", ""),
        "cc_bill_rejected_audio": s.get("cc_bill_rejected_audio", ""),
        "qr_request_received_audio": s.get("qr_request_received_audio", ""),
        "cc_bill_request_received_audio": s.get("cc_bill_request_received_audio", ""),
        "live_bill_enabled_audio": s.get("live_bill_enabled_audio", ""),
        "qr_approved_audio_enabled": bool(s.get("qr_approved_audio_enabled", True)),
        "qr_rejected_audio_enabled": bool(s.get("qr_rejected_audio_enabled", True)),
        "cc_bill_approved_audio_enabled": bool(s.get("cc_bill_approved_audio_enabled", True)),
        "cc_bill_rejected_audio_enabled": bool(s.get("cc_bill_rejected_audio_enabled", True)),
        "qr_request_received_audio_enabled": bool(s.get("qr_request_received_audio_enabled", True)),
        "cc_bill_request_received_audio_enabled": bool(s.get("cc_bill_request_received_audio_enabled", True)),
        "live_bill_enabled_audio_enabled": bool(s.get("live_bill_enabled_audio_enabled", True))
    }

@api.put("/admin/settings/recharge-limits")
async def update_admin_recharge_limits(body: RechargeLimitsIn, request: Request, user=Depends(require_roles("admin"))):
    if body.min_recharge_limit <= 0:
        raise HTTPException(status_code=400, detail="Minimum limit must be greater than zero")
    if body.max_recharge_limit < body.min_recharge_limit:
        raise HTTPException(status_code=400, detail="Maximum limit cannot be less than minimum limit")
    if body.live_bill_max_limit is not None and body.live_bill_max_limit <= 0:
        raise HTTPException(status_code=400, detail="Live Bill maximum limit must be greater than zero")
    if body.min_fund_transfer_limit is not None and body.min_fund_transfer_limit <= 0:
        raise HTTPException(status_code=400, detail="Minimum fund transfer limit must be greater than zero")
    
    doc = {
        "min_recharge_limit": body.min_recharge_limit,
        "max_recharge_limit": body.max_recharge_limit,
        "live_bill_max_limit": body.live_bill_max_limit if body.live_bill_max_limit is not None else 100000.0,
        "min_fund_transfer_limit": body.min_fund_transfer_limit if body.min_fund_transfer_limit is not None else 100.0,
        "updated_at": now_iso()
    }
    await db.settings.update_one({"id": "commission"}, {"$set": doc}, upsert=True)
    await write_audit(user["id"], "recharge_limits_changed", target="settings", meta=doc, request=request)
    await manager.broadcast({"event": "settings_updated", "data": doc})
    return doc

@api.put("/admin/settings/recharge-toggles")
async def update_admin_recharge_toggles(body: RechargeTogglesIn, request: Request, user=Depends(require_roles("admin"))):
    old_settings = await db.settings.find_one({"id": "commission"}) or {}
    old_live_bill_enabled = bool(old_settings.get("live_bill_enabled", True))

    doc = {
        "updated_at": now_iso()
    }
    if body.qr_enabled is not None:
        doc["qr_enabled"] = body.qr_enabled
    if body.t1_qr_enabled is not None:
        doc["t1_qr_enabled"] = body.t1_qr_enabled
    if body.recharge_enabled is not None:
        doc["recharge_enabled"] = body.recharge_enabled
    if body.t1_recharge_enabled is not None:
        doc["t1_recharge_enabled"] = body.t1_recharge_enabled
    if body.withdrawal_enabled is not None:
        doc["withdrawal_enabled"] = body.withdrawal_enabled
    if body.bill_pay_enabled is not None:
        doc["bill_pay_enabled"] = body.bill_pay_enabled
    if body.live_bill_enabled is not None:
        doc["live_bill_enabled"] = body.live_bill_enabled
    if body.fund_transfer_enabled is not None:
        doc["fund_transfer_enabled"] = body.fund_transfer_enabled
    if body.live_bill_api_charge is not None:
        doc["live_bill_api_charge"] = body.live_bill_api_charge
    if body.maintenance_mode is not None:
        doc["maintenance_mode"] = body.maintenance_mode

    if body.qr_approved_audio is not None:
        doc["qr_approved_audio"] = body.qr_approved_audio
    if body.qr_rejected_audio is not None:
        doc["qr_rejected_audio"] = body.qr_rejected_audio
    if body.cc_bill_approved_audio is not None:
        doc["cc_bill_approved_audio"] = body.cc_bill_approved_audio
    if body.cc_bill_rejected_audio is not None:
        doc["cc_bill_rejected_audio"] = body.cc_bill_rejected_audio
    if body.qr_request_received_audio is not None:
        doc["qr_request_received_audio"] = body.qr_request_received_audio
    if body.cc_bill_request_received_audio is not None:
        doc["cc_bill_request_received_audio"] = body.cc_bill_request_received_audio
    if body.live_bill_enabled_audio is not None:
        doc["live_bill_enabled_audio"] = body.live_bill_enabled_audio

    if body.qr_approved_audio_enabled is not None:
        doc["qr_approved_audio_enabled"] = body.qr_approved_audio_enabled
    if body.qr_rejected_audio_enabled is not None:
        doc["qr_rejected_audio_enabled"] = body.qr_rejected_audio_enabled
    if body.cc_bill_approved_audio_enabled is not None:
        doc["cc_bill_approved_audio_enabled"] = body.cc_bill_approved_audio_enabled
    if body.cc_bill_rejected_audio_enabled is not None:
        doc["cc_bill_rejected_audio_enabled"] = body.cc_bill_rejected_audio_enabled
    if body.qr_request_received_audio_enabled is not None:
        doc["qr_request_received_audio_enabled"] = body.qr_request_received_audio_enabled
    if body.cc_bill_request_received_audio_enabled is not None:
        doc["cc_bill_request_received_audio_enabled"] = body.cc_bill_request_received_audio_enabled
    if body.live_bill_enabled_audio_enabled is not None:
        doc["live_bill_enabled_audio_enabled"] = body.live_bill_enabled_audio_enabled

    try:
        await db.settings.update_one({"id": "commission"}, {"$set": doc}, upsert=True)
    except Exception as e:
        if "does not exist" in str(e).lower():
            logger.warning(f"Settings column missing, running self-healing migration: {e}")
            try:
                async with db.pool.acquire() as conn:
                    for col_name in ["qr_approved_audio", "qr_rejected_audio", "cc_bill_approved_audio", "cc_bill_rejected_audio", "qr_request_received_audio", "cc_bill_request_received_audio", "live_bill_enabled_audio"]:
                        await conn.execute(f"ALTER TABLE settings ADD COLUMN IF NOT EXISTS {col_name} TEXT DEFAULT ''")
                    for col_name in ["qr_approved_audio_enabled", "qr_rejected_audio_enabled", "cc_bill_approved_audio_enabled", "cc_bill_rejected_audio_enabled", "qr_request_received_audio_enabled", "cc_bill_request_received_audio_enabled", "live_bill_enabled_audio_enabled"]:
                        await conn.execute(f"ALTER TABLE settings ADD COLUMN IF NOT EXISTS {col_name} BOOLEAN DEFAULT TRUE")
                await db.settings.update_one({"id": "commission"}, {"$set": doc}, upsert=True)
            except Exception as retry_err:
                logger.error(f"Error updating recharge toggles after column migration retry: {retry_err}")
                raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(retry_err)}")
        else:
            logger.error(f"Error updating recharge toggles: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")

    # Check if Live Bill Pay was toggled from OFF (False) to ON (True)
    new_live_bill_enabled = doc.get("live_bill_enabled")
    if new_live_bill_enabled is True and old_live_bill_enabled is False:
        audio_path = doc.get("live_bill_enabled_audio") if "live_bill_enabled_audio" in doc else old_settings.get("live_bill_enabled_audio", "")
        audio_enabled = doc.get("live_bill_enabled_audio_enabled") if "live_bill_enabled_audio_enabled" in doc else old_settings.get("live_bill_enabled_audio_enabled", True)
        audio_url = audio_path if audio_enabled else ""
        await manager.broadcast({
            "event": "live_bill_enabled_turned_on",
            "data": {
                "live_bill_enabled": True,
                "audio_url": audio_url
            }
        })

    await write_audit(user["id"], "recharge_toggles_changed", target="settings", meta=doc, request=request)
    await manager.broadcast({"event": "settings_updated", "data": doc})
    return doc

# ---------- FUND TRANSFER SYSTEM ----------
@api.get("/fund-transfer/recipients")
async def get_fund_transfer_recipients(user=Depends(require_approved_any())):
    role = user.get("role")
    if role not in ("master_distributor", "distributor"):
        raise HTTPException(403, "Only Master Distributors and Distributors can perform fund transfers.")
    
    target_role = "distributor" if role == "master_distributor" else "agent"
    recipients = await db.users.find({
        "parent_id": user["id"],
        "role": target_role,
        "is_deleted": False,
        "frozen": False
    }, {"_id": 0, "password_hash": 0, "mpin_hash": 0, "tpin_hash": 0}).to_list(1000)
    
    result = []
    for r in recipients:
        w = await get_or_create_wallet(r["id"])
        r["balance"] = w.get("balance", 0.0)
        result.append(r)
        
    return result

@api.post("/fund-transfer/execute")
async def execute_fund_transfer(body: FundTransferIn, request: Request, user=Depends(require_approved_any())):
    role = user.get("role")
    if role not in ("master_distributor", "distributor"):
        raise HTTPException(403, "Only Master Distributors and Distributors can perform fund transfers.")
    
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
        
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    if not s.get("fund_transfer_enabled", True):
        raise HTTPException(400, "Fund transfer service is currently disabled by Admin.")
        
    min_limit = float(s.get("min_fund_transfer_limit", 100.0))
    if body.amount < min_limit:
        raise HTTPException(400, f"Minimum fund transfer limit is ₹{min_limit:.2f}")
        
    if role == "master_distributor":
        sender_avail_bal = await _md_earnings_for(user["id"])
    elif role == "distributor":
        sender_avail_bal = await _distributor_earnings_for(user["id"])
    else:
        sender_wallet = await get_or_create_wallet(user["id"])
        sender_avail_bal = float(sender_wallet.get("balance", 0.0))
        
    if sender_avail_bal < body.amount:
        raise HTTPException(400, "Insufficient balance for fund transfer")
        
    recipient = await db.users.find_one({"id": body.recipient_id, "is_deleted": False})
    if not recipient:
        raise HTTPException(404, "Recipient user not found")
        
    target_role = "distributor" if role == "master_distributor" else "agent"
    if recipient.get("parent_id") != user["id"] or recipient.get("role") != target_role:
        raise HTTPException(403, "Invalid recipient: You can only transfer funds to your direct downline users.")
        
    remarks_val = (body.remarks or body.note or "").strip()
    transfer_id = new_id()
    sender_note = f"Fund Transfer to {recipient.get('full_name')} ({recipient.get('email')})" + (f": {remarks_val}" if remarks_val else "")
    recip_note = f"Fund Transfer from {user.get('full_name')} ({user.get('email')})" + (f": {remarks_val}" if remarks_val else "")
    
    sender_new_balance = await adjust_balance(user["id"], -body.amount)
    recip_new_balance = await adjust_balance(body.recipient_id, body.amount)
    
    await ledger_entry(user["id"], "debit", body.amount, sender_new_balance, "fund_transfer", transfer_id, sender_note)
    await ledger_entry(body.recipient_id, "credit", body.amount, recip_new_balance, "fund_transfer", transfer_id, recip_note)
    
    await write_audit(user["id"], "fund_transfer", target=body.recipient_id, meta={
        "amount": body.amount,
        "recipient_name": recipient.get("full_name"),
        "recipient_role": recipient.get("role")
    }, request=request)
    
    await manager.send_to_user(user["id"], {"event": "wallet_updated", "data": {"balance": sender_new_balance}})
    await manager.send_to_user(body.recipient_id, {"event": "wallet_updated", "data": {"balance": recip_new_balance}})
    
    return {
        "ok": True,
        "transfer_id": transfer_id,
        "amount": body.amount,
        "recipient_id": body.recipient_id,
        "recipient_name": recipient.get("full_name"),
        "sender_balance": sender_new_balance,
        "sender_new_balance": sender_new_balance
    }

@api.get("/admin/fund-transfer-senders")
async def get_fund_transfer_senders(user=Depends(require_roles("admin"))):
    senders = await db.users.find(
        {"role": {"$in": ["master_distributor", "distributor"]}, "is_deleted": False},
        {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "role": 1, "firm_name": 1}
    ).sort("full_name", 1).to_list(1000)
    return senders

@api.get("/admin/fund-transfers")
async def get_admin_fund_transfers(
    page: int = 1,
    page_size: int = 20,
    from_ts: Optional[str] = Query(None),
    to_ts: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    sender_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    user=Depends(require_roles("admin"))
):
    page = max(1, page)
    page_size = max(1, min(200, page_size))

    query = {"ref_type": "fund_transfer", "kind": "debit"}

    if sender_id and sender_id != "all":
        query["user_id"] = sender_id

    if from_ts or to_ts:
        dt_query = {}
        if from_ts:
            dt_query["$gte"] = from_ts
        if to_ts:
            dt_query["$lt"] = to_ts
        query["created_at"] = dt_query

    debit_items = await db.ledger.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)

    all_user_ids = set()
    for d in debit_items:
        if d.get("user_id"):
            all_user_ids.add(d.get("user_id"))

    ref_ids = [d.get("ref_id") for d in debit_items if d.get("ref_id")]
    recip_ledger_map = {}
    if ref_ids:
        recip_entries = await db.ledger.find(
            {"ref_type": "fund_transfer", "kind": "credit", "ref_id": {"$in": ref_ids}},
            {"_id": 0}
        ).to_list(None)
        for r_entry in recip_entries:
            recip_ledger_map[r_entry.get("ref_id")] = r_entry
            if r_entry.get("user_id"):
                all_user_ids.add(r_entry.get("user_id"))

    audit_map = {}
    if ref_ids:
        audits = await db.audit_logs.find(
            {"action": "fund_transfer"},
            {"_id": 0}
        ).to_list(None)
        for a in audits:
            meta = a.get("meta") or {}
            tid = meta.get("transfer_id") or a.get("id")
            if tid:
                audit_map[tid] = a
                if a.get("target"):
                    all_user_ids.add(a.get("target"))

    users_list = []
    if all_user_ids:
        users_list = await db.users.find(
            {"id": {"$in": list(all_user_ids)}},
            {"_id": 0, "password_hash": 0, "mpin_hash": 0, "tpin_hash": 0}
        ).to_list(None)
    user_map = {u["id"]: u for u in users_list if u.get("id")}

    enriched = []
    for d in debit_items:
        s_user = user_map.get(d.get("user_id")) or {}
        sender_role = s_user.get("role", "")

        if role and role != "all" and sender_role != role:
            continue

        ref_id = d.get("ref_id")
        recip_ledger = recip_ledger_map.get(ref_id) or {}
        audit_entry = audit_map.get(ref_id) or {}

        recip_id = recip_ledger.get("user_id") or audit_entry.get("target") or ""
        r_user = user_map.get(recip_id) or {}

        if q:
            needle = q.strip().lower()
            s_name = (s_user.get("full_name") or "").lower()
            s_email = (s_user.get("email") or "").lower()
            s_phone = (s_user.get("phone") or "").lower()
            s_firm = (s_user.get("firm_name") or "").lower()

            r_name = (r_user.get("full_name") or audit_entry.get("meta", {}).get("recipient_name") or "").lower()
            r_email = (r_user.get("email") or "").lower()
            r_phone = (r_user.get("phone") or "").lower()
            r_firm = (r_user.get("firm_name") or "").lower()

            t_id = (ref_id or "").lower()
            note = (d.get("note") or "").lower()

            match = (
                needle in s_name or needle in s_email or needle in s_phone or needle in s_firm or
                needle in r_name or needle in r_email or needle in r_phone or needle in r_firm or
                needle in t_id or needle in note
            )
            if not match:
                continue

        enriched.append({
            "id": ref_id or d.get("id"),
            "ledger_id": d.get("id"),
            "created_at": d.get("created_at"),
            "amount": float(d.get("amount") or 0.0),
            "sender_id": d.get("user_id"),
            "sender_name": s_user.get("full_name") or "Unknown",
            "sender_email": s_user.get("email") or "",
            "sender_phone": s_user.get("phone") or "",
            "sender_role": sender_role,
            "sender_firm": s_user.get("firm_name") or "",
            "sender_balance_after": float(d.get("balance_after") or 0.0),
            "recipient_id": recip_id,
            "recipient_name": r_user.get("full_name") or audit_entry.get("meta", {}).get("recipient_name") or "Unknown",
            "recipient_email": r_user.get("email") or "",
            "recipient_phone": r_user.get("phone") or "",
            "recipient_role": r_user.get("role") or audit_entry.get("meta", {}).get("recipient_role") or "",
            "recipient_firm": r_user.get("firm_name") or "",
            "recip_balance_after": float(recip_ledger.get("balance_after") or 0.0) if recip_ledger else None,
            "note": d.get("note") or ""
        })

    all_debit_transfers = await db.ledger.find({"ref_type": "fund_transfer", "kind": "debit"}, {"_id": 0, "amount": 1, "created_at": 1}).to_list(None)

    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    today_amount = 0.0
    today_count = 0
    yesterday_amount = 0.0
    yesterday_count = 0
    this_month_amount = 0.0
    this_month_count = 0
    all_time_amount = 0.0
    all_time_count = len(all_debit_transfers)

    for item in all_debit_transfers:
        amt = float(item.get("amount") or 0.0)
        all_time_amount += amt
        dt_str = item.get("created_at")
        if dt_str:
            try:
                dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                if dt >= today_start:
                    today_amount += amt
                    today_count += 1
                elif dt >= yesterday_start and dt < today_start:
                    yesterday_amount += amt
                    yesterday_count += 1
                if dt >= month_start:
                    this_month_amount += amt
                    this_month_count += 1
            except Exception:
                pass

    filtered_amount = sum(it["amount"] for it in enriched)
    filtered_count = len(enriched)

    total_items = len(enriched)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_items = enriched[start_idx:end_idx]

    return {
        "items": paginated_items,
        "total": total_items,
        "page": page,
        "page_size": page_size,
        "stats": {
            "today_amount": round(today_amount, 2),
            "today_count": today_count,
            "yesterday_amount": round(yesterday_amount, 2),
            "yesterday_count": yesterday_count,
            "this_month_amount": round(this_month_amount, 2),
            "this_month_count": this_month_count,
            "all_time_amount": round(all_time_amount, 2),
            "all_time_count": all_time_count,
            "filtered_amount": round(filtered_amount, 2),
            "filtered_count": filtered_count
        }
    }

class BrandingSettingsIn(BaseModel):
    logo_path: Optional[str] = None
    favicon_path: Optional[str] = None
    logo_collapsed_path: Optional[str] = None
    watermark_path: Optional[str] = None

@api.get("/settings/branding-public")
async def get_public_branding():
    s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    return {
        "logo_path": s.get("logo_path") or "",
        "favicon_path": s.get("favicon_path") or "",
        "logo_collapsed_path": s.get("logo_collapsed_path") or "",
        "watermark_path": s.get("watermark_path") or "",
    }

@api.put("/admin/settings/branding")
async def update_branding_settings(body: BrandingSettingsIn, request: Request, user=Depends(require_roles("admin"))):
    doc = {
        "updated_at": now_iso()
    }
    if body.logo_path is not None:
        doc["logo_path"] = body.logo_path
    if body.favicon_path is not None:
        doc["favicon_path"] = body.favicon_path
    if body.logo_collapsed_path is not None:
        doc["logo_collapsed_path"] = body.logo_collapsed_path
    if body.watermark_path is not None:
        doc["watermark_path"] = body.watermark_path
        
    await db.settings.update_one({"id": "commission"}, {"$set": doc})
    await write_audit(user["id"], "branding_settings_changed", target="settings", meta=doc, request=request)
    return doc

# ---------- ONESIGNAL PUSH NOTIFICATIONS ----------
class OneSignalSettingsIn(BaseModel):
    onesignal_app_id: str
    onesignal_rest_api_key: str

async def send_onesignal_notification(
    title: str,
    message: str,
    target_roles: Optional[List[str]] = None,
    target_user_ids: Optional[List[str]] = None,
    url: Optional[str] = None,
    broadcast: bool = False
) -> dict:
    try:
        s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
        app_id = (s.get("onesignal_app_id") or "").strip()
        api_key = (s.get("onesignal_rest_api_key") or "").strip()
        if not app_id or not api_key:
            return {"status": "error", "message": "OneSignal credentials not configured"}
        
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Basic {api_key}"
        }
        
        payload = {
            "app_id": app_id,
            "headings": {"en": title},
            "contents": {"en": message},
            "url": url or "https://makfinpay.com/"
        }
        
        if broadcast or target_roles or (not target_user_ids and not target_roles):
            payload["included_segments"] = ["Subscribed Users", "Total Subscriptions"]
        elif target_user_ids:
            payload["include_aliases"] = {"external_id": target_user_ids}
            payload["include_external_user_ids"] = target_user_ids
            payload["target_channel"] = "push"
            
        async with httpx.AsyncClient() as client:
            res = await client.post("https://onesignal.com/api/v1/notifications", json=payload, headers=headers, timeout=10.0)
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            logger.info(f"OneSignal Push response: {res.status_code} - {res.text}")
            return {"status_code": res.status_code, "data": data, "recipients": data.get("recipients", 0), "id": data.get("id")}
    except Exception as e:
        logger.error(f"Failed to send OneSignal notification: {e}")
        return {"status": "error", "message": str(e)}

@api.get("/settings/onesignal-public")
async def get_public_onesignal_app_id():
    try:
        s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    except Exception:
        s = {}
    return {
        "onesignal_app_id": (s.get("onesignal_app_id") or "").strip()
    }

@api.get("/admin/settings/onesignal")
async def get_onesignal_settings(user=Depends(require_roles("admin"))):
    if not is_super_admin(user):
        raise HTTPException(403, "Access denied: Only Super Admin (jigs.vanani@gmail.com) can access OneSignal configuration.")
    try:
        s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
    except Exception as e:
        logger.warning(f"Error reading OneSignal settings, attempting self-healing migration: {e}")
        try:
            async with db.pool.acquire() as conn:
                await conn.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS onesignal_app_id TEXT DEFAULT ''")
                await conn.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS onesignal_rest_api_key TEXT DEFAULT ''")
            s = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {}
        except Exception:
            s = {}
    return {
        "onesignal_app_id": s.get("onesignal_app_id") or "",
        "onesignal_rest_api_key": s.get("onesignal_rest_api_key") or ""
    }

@api.put("/admin/settings/onesignal")
async def update_onesignal_settings(body: OneSignalSettingsIn, request: Request, user=Depends(require_roles("admin"))):
    if not is_super_admin(user):
        raise HTTPException(403, "Access denied: Only Super Admin (jigs.vanani@gmail.com) can update OneSignal configuration.")
    doc = {
        "onesignal_app_id": body.onesignal_app_id.strip(),
        "onesignal_rest_api_key": body.onesignal_rest_api_key.strip(),
        "updated_at": now_iso()
    }
    try:
        await db.settings.update_one({"id": "commission"}, {"$set": doc}, upsert=True)
    except Exception as e:
        logger.warning(f"Error updating OneSignal settings, attempting self-healing migration: {e}")
        try:
            async with db.pool.acquire() as conn:
                await conn.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS onesignal_app_id TEXT DEFAULT ''")
                await conn.execute("ALTER TABLE settings ADD COLUMN IF NOT EXISTS onesignal_rest_api_key TEXT DEFAULT ''")
            await db.settings.update_one({"id": "commission"}, {"$set": doc}, upsert=True)
        except Exception as retry_err:
            logger.error(f"Failed to update OneSignal settings after migration retry: {retry_err}")
            raise HTTPException(500, f"Failed to save OneSignal settings: {str(retry_err)}")

    await write_audit(user["id"], "onesignal_settings_changed", target="settings", meta={"onesignal_app_id": doc["onesignal_app_id"]}, request=request)
    return {"ok": True, "message": "OneSignal credentials updated successfully"}

@api.post("/admin/settings/onesignal/test")
async def test_onesignal_notification(request: Request, user=Depends(require_roles("admin"))):
    if not is_super_admin(user):
        raise HTTPException(403, "Access denied: Only Super Admin can send test OneSignal notifications.")
    res = await send_onesignal_notification(
        title="🔔 OneSignal Test Notification",
        message="Push notifications are working perfectly on MAK FIN PAY!",
        broadcast=True,
        url="https://makfinpay.com/admin"
    )
    data = res.get("data", {})
    recipients = res.get("recipients", 0)
    errors = data.get("errors")
    if errors:
        err_msg = ", ".join(errors) if isinstance(errors, list) else str(errors)
        raise HTTPException(400, f"OneSignal returned error: {err_msg}")
    if recipients == 0:
        return {
            "ok": True,
            "message": "Test push request sent to OneSignal, but 0 subscribers were found. Make sure you opened the app on your mobile and allowed push notifications!",
            "details": res
        }
    return {"ok": True, "message": f"Test push notification sent successfully to {recipients} subscriber(s)! 🔔", "details": res}

class AdminAdjustmentIn(BaseModel):
    type: str  # credit | debit
    amount: float
    note: str

@api.get("/admin/profit-ledger")
async def get_admin_profit_ledger(user=Depends(require_roles("admin"))):
    return await db.admin_profit_ledger.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api.get("/admin/cashbook")
async def get_admin_cashbook(user=Depends(require_roles("admin"))):
    return await db.admin_cashbook.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api.get("/admin/system-ledger")
async def get_admin_system_ledger(
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    service_type: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
    amount: Optional[float] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    user=Depends(require_roles("admin"))
):
    page = max(1, page); page_size = max(1, min(200, page_size))
    query = {"ref_type": {"$ne": "daily_commission_settlement"}}
    if isinstance(kind, str) and kind != "all":
        query["kind"] = kind

    if isinstance(service_type, str) and service_type != "all":
        if service_type == "recharge":
            query["ref_type"] = "recharge"
        elif service_type == "cc_bill":
            query["ref_type"] = {"$in": ["bill_payment", "bill_payment_reversal"]}
        elif service_type == "live_bill":
            query["ref_type"] = {"$in": ["live_bill", "live_bill_refund"]}
        elif service_type == "withdrawal":
            query["ref_type"] = {"$in": ["withdrawal", "withdrawal_paid", "withdrawal_refund", "withdrawal_hold"]}
        elif service_type == "hold":
            query["ref_type"] = {"$in": ["wallet_hold", "wallet_unhold"]}
        elif service_type == "adjustment":
            query["ref_type"] = {"$in": ["manual_adjustment", "adjustment"]}

    amt_conditions = {}
    if isinstance(min_amount, (int, float)):
        amt_conditions["$gte"] = min_amount
    if isinstance(max_amount, (int, float)):
        amt_conditions["$lte"] = max_amount
    if isinstance(amount, (int, float)):
        amt_conditions["$gte"] = round(amount - 0.01, 2)
        amt_conditions["$lte"] = round(amount + 0.01, 2)
    if amt_conditions:
        query["amount"] = amt_conditions

    date_conditions = {}
    if isinstance(from_date, str) and from_date.strip():
        date_conditions["$gte"] = from_date.strip()
    if isinstance(to_date, str) and to_date.strip():
        td = to_date.strip()
        if len(td) == 10:
            td += "T23:59:59.999999+00:00"
        date_conditions["$lte"] = td
    if date_conditions:
        query["created_at"] = date_conditions

    if isinstance(role, str) and role != "all":
        role_users = await db.users.find({"role": role}, {"_id": 0, "id": 1}).to_list(None)
        role_uids = [u["id"] for u in role_users]
        query["user_id"] = {"$in": role_uids}

    if isinstance(search, str) and search.strip():
        s = search.strip()
        matched_users = await db.users.find({
            "$or": [
                {"full_name": {"$regex": s, "$options": "i"}},
                {"email": {"$regex": s, "$options": "i"}},
                {"phone": {"$regex": s, "$options": "i"}}
            ]
        }, {"_id": 0, "id": 1}).to_list(None)
        
        s_query = [
            {"note": {"$regex": s, "$options": "i"}},
            {"ref_type": {"$regex": s, "$options": "i"}},
            {"ref_id": {"$regex": s, "$options": "i"}}
        ]
        if matched_users:
            s_query.append({"user_id": {"$in": [u["id"] for u in matched_users]}})

        query["$or"] = s_query

    total_task = db.ledger.count_documents(query)
    items_task = db.ledger.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    all_wallets_task = db.wallets.find({}, {"_id": 0, "balance": 1, "hold_balance": 1}).to_list(None)
    matched_all_task = db.ledger.find(query, {"_id": 0, "kind": 1, "amount": 1}).to_list(None)

    total, items, all_wallets, matched_all = await asyncio.gather(
        total_task, items_task, all_wallets_task, matched_all_task
    )

    user_ids = list({item.get("user_id") for item in items if item.get("user_id")})
    user_map = {}
    if user_ids:
        users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "role": 1}).to_list(None)
        user_map = {u["id"]: u for u in users}

    for item in items:
        uid = item.get("user_id")
        if uid and uid in user_map:
            u = user_map[uid]
            item["user_name"] = u.get("full_name")
            item["user_email"] = u.get("email")
            item["user_phone"] = u.get("phone")
            item["user_role"] = u.get("role")

        amt = float(item.get("amount") or 0.0)
        closing_bal = float(item.get("balance_after") or 0.0)
        k = item.get("kind")
        if k in ("credit", "refund"):
            op_bal = round(closing_bal - amt, 2)
        elif k == "debit":
            op_bal = round(closing_bal + amt, 2)
        else:
            op_bal = closing_bal
        item["opening_balance"] = op_bal
        item["closing_balance"] = closing_bal

        rt = item.get("ref_type", "")
        if rt == "recharge":
            item["service_name"] = "QR Load Wallet"
        elif rt in ("bill_payment", "bill_payment_reversal"):
            item["service_name"] = "Credit Card Bill"
        elif rt in ("live_bill", "live_bill_refund"):
            item["service_name"] = "Live Bill Pay"
        elif rt in ("withdrawal", "withdrawal_paid", "withdrawal_refund", "withdrawal_hold"):
            item["service_name"] = "Payout Withdrawal"
        elif rt in ("wallet_hold", "wallet_unhold"):
            item["service_name"] = "Wallet Hold/Unhold"
        elif rt in ("manual_adjustment", "adjustment"):
            item["service_name"] = "Manual Adjustment"
        else:
            item["service_name"] = rt.replace("_", " ").title() if rt else "General"

    total_system_wallet_balance = round(sum(float(w.get("balance") or 0.0) for w in all_wallets), 2)
    total_hold_balance = round(sum(float(w.get("hold_balance") or 0.0) for w in all_wallets), 2)

    period_credit = round(sum(float(it.get("amount") or 0.0) for it in matched_all if it.get("kind") == "credit"), 2)
    period_debit = round(sum(float(it.get("amount") or 0.0) for it in matched_all if it.get("kind") == "debit"), 2)
    period_refund = round(sum(float(it.get("amount") or 0.0) for it in matched_all if it.get("kind") == "refund"), 2)

    summary = {
        "total_system_wallet_balance": total_system_wallet_balance,
        "total_hold_balance": total_hold_balance,
        "period_credit": period_credit,
        "period_debit": period_debit,
        "period_refund": period_refund
    }

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": summary
    }

@api.get("/admin/admin-statement")
async def get_admin_statement_report(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    user=Depends(require_roles("admin"))
):
    page = max(1, page); page_size = max(1, min(200, page_size))
    query = {}

    if isinstance(kind, str) and kind != "all":
        query["kind"] = kind

    if isinstance(type, str) and type != "all":
        if type == "cc_bill":
            query["ref_type"] = {"$in": ["bill_payment", "bill_payment_reversal", "bill_payment_hold", "bill_payment_success"]}
        elif type == "live_bill" or type == "bill_pay":
            query["ref_type"] = {"$in": ["live_bill", "live_bill_pay", "live_bill_refund"]}
        elif type == "payout":
            query["ref_type"] = {"$in": ["withdrawal", "withdrawal_paid", "withdrawal_refund", "withdrawal_hold"]}
        elif type == "qr_payment" or type == "recharge":
            query["ref_type"] = "recharge"
        elif type == "adjustment":
            query["ref_type"] = {"$in": ["manual_adjustment", "adjustment", "wallet_hold", "wallet_unhold"]}

    amt_conditions = {}
    if isinstance(min_amount, (int, float)):
        amt_conditions["$gte"] = min_amount
    if isinstance(max_amount, (int, float)):
        amt_conditions["$lte"] = max_amount
    if amt_conditions:
        query["amount"] = amt_conditions

    date_conditions = {}
    if isinstance(from_date, str) and from_date.strip():
        date_conditions["$gte"] = from_date.strip()
    if isinstance(to_date, str) and to_date.strip():
        td = to_date.strip()
        if len(td) == 10:
            td += "T23:59:59.999999+00:00"
        date_conditions["$lte"] = td
    if date_conditions:
        query["created_at"] = date_conditions

    if isinstance(role, str) and role != "all":
        role_users = await db.users.find({"role": role}, {"_id": 0, "id": 1}).to_list(None)
        query["user_id"] = {"$in": [u["id"] for u in role_users]}

    if isinstance(search, str) and search.strip():
        s = search.strip()
        matched_users = await db.users.find({
            "$or": [
                {"full_name": {"$regex": s, "$options": "i"}},
                {"firm_name": {"$regex": s, "$options": "i"}},
                {"email": {"$regex": s, "$options": "i"}},
                {"phone": {"$regex": s, "$options": "i"}}
            ]
        }, {"_id": 0, "id": 1}).to_list(None)
        
        s_query = [
            {"note": {"$regex": s, "$options": "i"}},
            {"ref_type": {"$regex": s, "$options": "i"}},
            {"ref_id": {"$regex": s, "$options": "i"}}
        ]
        if matched_users:
            s_query.append({"user_id": {"$in": [u["id"] for u in matched_users]}})
        query["$or"] = s_query

    total = await db.ledger.count_documents(query)
    items = await db.ledger.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)

    user_ids = list({item.get("user_id") for item in items if item.get("user_id")})
    user_map = {}
    wallet_map = {}
    if user_ids:
        users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "full_name": 1, "firm_name": 1, "email": 1, "phone": 1, "role": 1}).to_list(None)
        user_map = {u["id"]: u for u in users}
        
        wallets = await db.wallets.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "balance": 1}).to_list(None)
        wallet_map = {w["user_id"]: float(w.get("balance") or 0.0) for w in wallets}

    all_agent_users = await db.users.find({"role": "agent"}, {"_id": 0, "id": 1}).to_list(None)
    agent_uids = [u["id"] for u in all_agent_users]
    agent_wallets = await db.wallets.find({"user_id": {"$in": agent_uids}}, {"_id": 0, "balance": 1}).to_list(None)
    agent_wallet_total = round(sum(float(w.get("balance") or 0.0) for w in agent_wallets), 2)

    # By default, primary wallet balance is agent wallet balance (matches dashboard)
    current_wallet_total = agent_wallet_total

    # Fetch MD & Distributor Earnings matching Dashboard Overview
    dist_lifetime = await db.recharges.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$distributor_earnings_amount"}}}
    ]).to_list(1)
    dist_paid = await db.withdrawals.aggregate([
        {"$match": {"status": "approved", "role": "distributor"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)

    md_lifetime = await db.recharges.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$md_earnings_amount"}}}
    ]).to_list(1)
    md_paid = await db.withdrawals.aggregate([
        {"$match": {"status": "approved", "role": "master_distributor"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)

    dist_recharges_sum = dist_lifetime[0]["total"] if dist_lifetime else 0.0
    dist_paid_sum = dist_paid[0]["total"] if dist_paid else 0.0
    md_recharges_sum = md_lifetime[0]["total"] if md_lifetime else 0.0
    md_paid_sum = md_paid[0]["total"] if md_paid else 0.0

    distributor_earnings_total = max(0.0, round(dist_recharges_sum - dist_paid_sum, 2))
    md_earnings_total = max(0.0, round(md_recharges_sum - md_paid_sum, 2))
    system_funds_total = round(agent_wallet_total + distributor_earnings_total + md_earnings_total, 2)

    matched_all = await db.ledger.find(query, {"_id": 0, "kind": 1, "amount": 1, "balance_after": 1}).to_list(None)
    total_credits = round(sum(float(it.get("amount") or 0.0) for it in matched_all if it.get("kind") in ("credit", "refund")), 2)
    total_debits = round(sum(float(it.get("amount") or 0.0) for it in matched_all if it.get("kind") == "debit"), 2)

    if items:
        top_item_time = items[0].get("created_at")
        newer_ledger = await db.ledger.find({
            "created_at": {"$gt": top_item_time}
        }, {"_id": 0, "kind": 1, "amount": 1}).to_list(None)
        
        newer_credits = sum(float(it.get("amount") or 0.0) for it in newer_ledger if it.get("kind") in ("credit", "refund"))
        newer_debits = sum(float(it.get("amount") or 0.0) for it in newer_ledger if it.get("kind") == "debit")
        
        running_admin_bal = agent_wallet_total - newer_credits + newer_debits
    else:
        running_admin_bal = agent_wallet_total

    ref_ids = list({item.get("ref_id") for item in items if item.get("ref_id")})
    txn_map = {}
    if ref_ids:
        txns = await db.transactions.find({"id": {"$in": ref_ids}}, {"_id": 0}).to_list(None)
        txn_map = {t["id"]: t for t in txns}

    formatted_items = []
    for item in items:
        uid = item.get("user_id")
        u = user_map.get(uid, {})
        live_bal = wallet_map.get(uid, 0.0)
        
        firm = u.get("firm_name") or u.get("full_name") or "N/A"
        user_name = u.get("full_name") or "System User"
        user_email = u.get("email") or "N/A"
        
        rt = item.get("ref_type", "")
        kind = item.get("kind", "")
        amt = float(item.get("amount") or 0.0)
        closing_bal = float(item.get("balance_after") or 0.0)

        # Dynamic Entry-wise Running Admin Balance
        entry_admin_bal = round(running_admin_bal, 2)
        if kind in ("credit", "refund"):
            running_admin_bal -= amt
        elif kind == "debit":
            running_admin_bal += amt
        
        ref_id = item.get("ref_id") or ""
        short_id = f"#{ref_id[:8].upper()}" if ref_id else f"#{str(item.get('id', ''))[:8].upper()}"
        note = item.get("note") or ""
        txn_obj = txn_map.get(ref_id, {})

        # Category Badge Logic (CC BILL vs LIVE BILL vs QR PAYMENT vs PAYOUT)
        if txn_obj.get("type") == "credit_card" or "Credit Card" in note or "Bill:" in note or rt in ("bill_payment_hold", "bill_payment_success", "bill_payment_reversal"):
            type_label = "CC BILL"
            type_color = "rose"
        elif rt in ("live_bill_pay", "live_bill_refund") or "Live Bill" in note:
            type_label = "LIVE BILL"
            type_color = "amber"
        elif rt == "recharge":
            type_label = "QR PAYMENT"
            type_color = "blue"
        elif rt == "withdrawal" or "withdrawal" in rt:
            type_label = "PAYOUT"
            type_color = "purple"
        elif "hold" in rt:
            type_label = "HOLD"
            type_color = "amber"
        else:
            type_label = kind.upper()
            type_color = "emerald" if kind in ("credit", "refund") else "slate"

        # Structured 2-Line Description with Bill Amount & Charge
        if txn_obj:
            b_amt = float(txn_obj.get("bill_amount") or 0.0)
            s_chg = float(txn_obj.get("service_charge") or 0.0)
            op_name = txn_obj.get("operator") or "Bill Payment"
            card_4 = txn_obj.get("card_last4")
            card_suffix = f" ****{card_4}" if card_4 else ""
            line1 = f"Bill: ₹{b_amt:,.2f} + Charge: ₹{s_chg:,.2f}"
            line2 = f"{op_name}{card_suffix}"
            if rt == "bill_payment_success":
                line2 += " (Confirmed)"
            desc = f"{line1} — {line2}"
        elif note:
            desc = note
            if " — " in note:
                parts = note.split(" — ", 1)
                line1 = parts[0]
                line2 = parts[1]
            elif " - Biller:" in note:
                parts = note.split(" - Biller:", 1)
                line1 = parts[0]
                line2 = "Biller: " + parts[1]
            elif " – " in note:
                parts = note.split(" – ", 1)
                line1 = parts[0]
                line2 = parts[1]
            else:
                line1 = note
                line2 = ""
        else:
            line1 = f"{type_label} Transaction"
            line2 = ""
            desc = line1

        # Comprehensive Status Mapping for all transaction states
        txn_st = (txn_obj.get("status") or "").lower() if txn_obj else ""
        
        if txn_st == "success" or rt == "bill_payment_success":
            status = "APPROVED"
        elif txn_st == "rejected":
            status = "REJECTED"
        elif txn_st == "failed":
            status = "FAILED"
        elif txn_st == "reversed" or "reversal" in rt or "refund" in rt or kind == "refund":
            status = "REFUNDED"
        elif txn_st == "pending" or ("hold" in rt and not txn_st):
            status = "PENDING"
        else:
            status = "APPROVED"

        formatted_items.append({
            "id": item.get("id"),
            "created_at": item.get("created_at"),
            "ref_id": short_id,
            "type_label": type_label,
            "type_color": type_color,
            "user_name": user_name,
            "firm_name": firm,
            "user_email": user_email,
            "user_phone": u.get("phone") or "",
            "user_role": u.get("role") or "",
            "description": desc,
            "description_line1": line1,
            "description_line2": line2,
            "note": note,
            "ref_type": rt,
            "kind": kind,
            "amount": amt,
            "credit": amt if kind in ("credit", "refund") else None,
            "debit": amt if kind == "debit" else None,
            "admin_balance": entry_admin_bal,
            "status": status,
            "user_current_wallet": live_bal,
            "user_closing_balance": closing_bal
        })

    opening_balance = round(current_wallet_total - total_credits + total_debits, 2)
    closing_balance = round(opening_balance + total_credits - total_debits, 2)

    summary = {
        "opening_balance": opening_balance,
        "total_credits": total_credits,
        "total_debits": total_debits,
        "closing_balance": closing_balance,
        "current_wallet_total": agent_wallet_total,
        "agent_wallet_total": agent_wallet_total,
        "distributor_earnings_total": distributor_earnings_total,
        "md_earnings_total": md_earnings_total,
        "system_funds_total": system_funds_total,
        "is_reconciled": True
    }

    return {
        "items": formatted_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": summary
    }

@api.post("/admin/profit-ledger/adjust")
async def adjust_admin_profit(body: AdminAdjustmentIn, request: Request, user=Depends(require_roles("admin"))):
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    if body.type not in ("credit", "debit"):
        raise HTTPException(400, "Type must be credit or debit")
    await log_admin_profit(
        type_str=body.type,
        amount=body.amount,
        ref_type="manual_adjustment",
        ref_id=user["id"],
        note=body.note
    )
    return {"ok": True}

@api.post("/admin/cashbook/adjust")
async def adjust_admin_cashbook(body: AdminAdjustmentIn, request: Request, user=Depends(require_roles("admin"))):
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    if body.type not in ("credit", "debit"):
        raise HTTPException(400, "Type must be credit or debit")
    await log_admin_cashbook(
        type_str=body.type,
        amount=body.amount,
        ref_type="manual_adjustment",
        ref_id=user["id"],
        note=body.note
    )
    return {"ok": True}

# --- Cascade helper: recompute all agents under a distributor ---
async def cascade_distributor_agents(distributor_id: str, new_distributor_pct: float, actor_id: str,
                                     old_distributor_pct: Optional[float] = None,
                                     reason: str = "", request: Optional[Request] = None) -> int:
    """Atomically recompute base_commission and total_commission for every
    distributor-created agent under `distributor_id`. Markup is preserved.
    Returns the number of agents updated.
    """
    pipeline = [{
        "$set": {
            "base_commission": new_distributor_pct,
            "total_commission": {"$add": [new_distributor_pct, {"$ifNull": ["$markup_commission", 0]}]},
            "commission_percent": {"$add": [new_distributor_pct, {"$ifNull": ["$markup_commission", 0]}]},
        }
    }]
    res = await db.users.update_many(
        {"role": "agent", "created_by_role": "distributor", "parent_id": distributor_id},
        pipeline,
    )
    n = res.modified_count
    if n > 0:
        await write_audit(actor_id, "agent_commission_cascade_update", target=distributor_id,
                          meta={"distributor_id": distributor_id,
                                "old_distributor_pct": old_distributor_pct,
                                "new_distributor_pct": new_distributor_pct,
                                "agents_updated": n, "reason": reason},
                          request=request)
    # Also refresh admin_pct + dist_pct on those agents (best-effort — matches recharge snapshot needs).
    dist = await db.users.find_one({"id": distributor_id}, {"_id": 0, "admin_pct": 1, "md_pct": 1})
    if dist:
        await db.users.update_many(
            {"role": "agent", "created_by_role": "distributor", "parent_id": distributor_id},
            [{"$set": {
                "admin_pct": float(dist.get("admin_pct", new_distributor_pct)),
                "md_pct":    float(dist.get("md_pct", 0.0)),
                "dist_pct":  {"$ifNull": ["$markup_commission", 0]},
            }}],
        )
    return n


async def cascade_md_downstream(md_id: str, new_md_pct: float, actor_id: str,
                                 reason: str = "", request: Optional[Request] = None) -> int:
    """Recompute every user in the MD's downline so their admin_pct = new_md_pct.
    Existing markup values (md_pct on distributor / direct agent; dist_pct on
    distributor-created agent) are preserved. Returns total records touched.
    Cascades affect FUTURE recharges only — history is immutable."""
    touched = 0
    # 1) Distributors under this MD: base = new_md_pct; total = new_md_pct + md_pct.
    dist_pipeline = [{
        "$set": {
            "admin_pct": new_md_pct,
            "base_commission": new_md_pct,
            "commission_percent": {"$add": [new_md_pct, {"$ifNull": ["$md_pct", 0]}]},
            "total_commission":   {"$add": [new_md_pct, {"$ifNull": ["$md_pct", 0]}]},
        }
    }]
    d_res = await db.users.update_many({"role": "distributor", "md_id": md_id}, dist_pipeline)
    touched += d_res.modified_count

    # 2) Direct MD agents.
    da_pipeline = [{
        "$set": {
            "admin_pct": new_md_pct,
            "base_commission": new_md_pct,
            "commission_percent": {"$add": [new_md_pct, {"$ifNull": ["$md_pct", 0]}]},
            "total_commission":   {"$add": [new_md_pct, {"$ifNull": ["$md_pct", 0]}]},
        }
    }]
    da_res = await db.users.update_many(
        {"role": "agent", "created_by_role": "master_distributor", "md_id": md_id},
        da_pipeline,
    )
    touched += da_res.modified_count

    # 3) Agents under each of this MD's distributors (inherit distributor's md_pct).
    async for did_doc in db.users.find({"role": "distributor", "md_id": md_id}, {"_id": 0, "id": 1, "md_pct": 1}):
        did = did_doc["id"]
        d_md_pct = float(did_doc.get("md_pct", 0.0))
        base_new = round(new_md_pct + d_md_pct, 4)
        agent_pipe = [{
            "$set": {
                "admin_pct": new_md_pct,
                "md_pct":    d_md_pct,
                "base_commission": base_new,
                "commission_percent": {"$add": [base_new, {"$ifNull": ["$markup_commission", 0]}]},
                "total_commission":   {"$add": [base_new, {"$ifNull": ["$markup_commission", 0]}]},
                "dist_pct": {"$ifNull": ["$markup_commission", 0]},
            }
        }]
        a2 = await db.users.update_many({"role": "agent", "created_by_role": "distributor", "parent_id": did}, agent_pipe)
        touched += a2.modified_count

    if touched > 0:
        await write_audit(actor_id, "md_downstream_cascade", target=md_id,
                          meta={"md_id": md_id, "new_md_pct": new_md_pct,
                                "records_updated": touched, "reason": reason},
                          request=request)
    return touched

# --- Edit commission endpoints ---
@api.patch("/admin/users/{uid}/commission")
async def admin_update_commission(uid: str, body: CommissionUpdateIn, request: Request, user=Depends(require_roles("admin"))):
    if body.commission_percent < 0:
        raise HTTPException(400, "Commission cannot be negative")
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(404, "User not found")
    if target["role"] == "agent" and target.get("created_by_role") == "distributor":
        raise HTTPException(403, "Distributor-created agents can only be edited by their distributor")
    if target["role"] == "agent" and target.get("created_by_role") == "master_distributor":
        raise HTTPException(403, "MD-created agents can only be edited by their master distributor")
    if target["role"] not in ("master_distributor", "distributor", "agent"):
        raise HTTPException(400, "Only master distributors / distributors / admin-created agents are editable here")
    if target["role"] == "distributor" and target.get("md_id"):
        raise HTTPException(403, "MD-managed distributors can only be edited by their master distributor")
    new_pct = round(float(body.commission_percent), 4)
    old_pct = float(target.get("commission_percent", 0))
    was_default = target.get("commission_type") == "default"
    if target["role"] == "master_distributor":
        updates = {
            "commission_percent": new_pct,
            "base_commission": new_pct,
            "total_commission": new_pct,
            "admin_pct": new_pct,
            "commission_type": "custom",
        }
    else:
        updates = {
            "commission_percent": new_pct,
            "base_commission": new_pct,
            "markup_commission": 0.0,
            "total_commission": new_pct,
            "admin_pct": new_pct,
            "md_pct": 0.0,
            "dist_pct": 0.0,
            "commission_type": "custom",
        }
    await db.users.update_one({"id": uid}, {"$set": updates})
    event = "commission_set_to_custom" if was_default else "commission_custom_edited"
    await write_audit(user["id"], event, target=uid,
                      meta={"role": target["role"], "old": old_pct, "new": new_pct, "by_role": "admin"},
                      request=request)
    if target["role"] == "distributor":
        await cascade_distributor_agents(uid, new_pct, user["id"],
                                         old_distributor_pct=old_pct,
                                         reason=event, request=request)
    if target["role"] == "master_distributor":
        await cascade_md_downstream(uid, new_pct, user["id"], reason=event, request=request)
    return {"ok": True, "commission_percent": new_pct, "commission_type": "custom"}

@api.patch("/admin/users/{uid}/commission/reset")
async def admin_reset_commission(uid: str, request: Request, user=Depends(require_roles("admin"))):
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(404, "User not found")
    if target["role"] == "agent" and target.get("created_by_role") == "distributor":
        raise HTTPException(403, "Distributor-created agents can only be edited by their distributor")
    if target["role"] == "agent" and target.get("created_by_role") == "master_distributor":
        raise HTTPException(403, "MD-created agents can only be edited by their master distributor")
    if target["role"] not in ("master_distributor", "distributor", "agent"):
        raise HTTPException(400, "Only master distributors / distributors / admin-created agents are resettable here")
    if target["role"] == "distributor" and target.get("md_id"):
        raise HTTPException(403, "MD-managed distributors can only be edited by their master distributor")
    settings = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {"default_percent": 1.2}
    default_pct = round(float(settings.get("default_percent", 1.2)), 4)
    old_pct = float(target.get("commission_percent", 0))
    if target["role"] == "master_distributor":
        updates = {
            "commission_percent": default_pct,
            "base_commission": default_pct,
            "total_commission": default_pct,
            "admin_pct": default_pct,
            "commission_type": "default",
        }
    else:
        updates = {
            "commission_percent": default_pct,
            "base_commission": default_pct,
            "markup_commission": 0.0,
            "total_commission": default_pct,
            "admin_pct": default_pct,
            "md_pct": 0.0,
            "dist_pct": 0.0,
            "commission_type": "default",
        }
    await db.users.update_one({"id": uid}, {"$set": updates})
    await write_audit(user["id"], "commission_reset_to_default", target=uid,
                      meta={"role": target["role"], "previous_custom": old_pct, "new": default_pct, "by_role": "admin"},
                      request=request)
    if target["role"] == "distributor":
        await cascade_distributor_agents(uid, default_pct, user["id"],
                                         old_distributor_pct=old_pct,
                                         reason="commission_reset_to_default", request=request)
    if target["role"] == "master_distributor":
        await cascade_md_downstream(uid, default_pct, user["id"],
                                     reason="commission_reset_to_default", request=request)
    return {"ok": True, "commission_percent": default_pct, "commission_type": "default"}

@api.patch("/distributor/agents/{uid}/markup")
async def distributor_update_markup(uid: str, body: MarkupUpdateIn, request: Request, user=Depends(require_approved_distributor())):
    if body.markup_percent < 0:
        raise HTTPException(400, "Markup cannot be negative")
    target = await db.users.find_one({"id": uid, "parent_id": user["id"], "role": "agent"})
    if not target:
        raise HTTPException(404, "Agent not found")
    d_admin_pct = float(user.get("admin_pct", user.get("base_commission", 0.0)) or 0.0)
    d_md_pct = float(user.get("md_pct", 0.0) or 0.0)
    base = round(d_admin_pct + d_md_pct, 4)
    new_markup = round(float(body.markup_percent), 4)
    new_total = round(base + new_markup, 4)
    old_total = float(target.get("commission_percent", 0))
    await db.users.update_one({"id": uid}, {"$set": {
        "base_commission": base,
        "markup_commission": new_markup,
        "total_commission": new_total,
        "commission_percent": new_total,
        "admin_pct": d_admin_pct,
        "md_pct": d_md_pct,
        "dist_pct": new_markup,
    }})
    await write_audit(user["id"], "commission_updated", target=uid,
                      meta={"role": "agent", "old": old_total, "new": new_total,
                            "markup": new_markup, "base": base, "by_role": "distributor"},
                      request=request)
    return {"ok": True, "base_commission": base, "markup_commission": new_markup, "total_commission": new_total}


@api.patch("/master-distributor/users/{uid}/markup")
async def md_update_markup(uid: str, body: MarkupUpdateIn, request: Request, user=Depends(require_approved_md())):
    """MD sets/updates the md_markup on one of their distributors or direct agents.
    Cascades to that user's downstream (agents under a distributor) so future
    recharges use the new rate. History untouched."""
    if body.markup_percent < 0:
        raise HTTPException(400, "Markup cannot be negative")
    target = await db.users.find_one({"id": uid, "md_id": user["id"]})
    if not target or target["role"] not in ("distributor", "agent"):
        raise HTTPException(404, "User not found in your downline")
    if target["role"] == "agent" and target.get("created_by_role") != "master_distributor":
        raise HTTPException(400, "This agent is under a distributor — the distributor manages its markup")
    md_rate = float(user.get("commission_percent") or 0.0)
    new_md_markup = round(float(body.markup_percent), 4)
    if target["role"] == "distributor":
        new_total = round(md_rate + new_md_markup, 4)
        old_total = float(target.get("commission_percent", 0))
        await db.users.update_one({"id": uid}, {"$set": {
            "admin_pct": md_rate,
            "md_pct": new_md_markup,
            "dist_pct": 0.0,
            "base_commission": md_rate,
            "markup_commission": new_md_markup,
            "total_commission": new_total,
            "commission_percent": new_total,
        }})
        # Cascade agents under this distributor.
        await cascade_distributor_agents(uid, new_total, user["id"],
                                         old_distributor_pct=old_total,
                                         reason="md_markup_updated", request=request)
    else:
        # Direct MD agent — no downstream.
        new_total = round(md_rate + new_md_markup, 4)
        await db.users.update_one({"id": uid}, {"$set": {
            "admin_pct": md_rate,
            "md_pct": new_md_markup,
            "dist_pct": 0.0,
            "base_commission": md_rate,
            "markup_commission": new_md_markup,
            "total_commission": new_total,
            "commission_percent": new_total,
        }})
    await write_audit(user["id"], "md_markup_updated", target=uid,
                      meta={"role": target["role"], "md_markup": new_md_markup, "new_total": new_total},
                      request=request)
    return {"ok": True, "md_markup": new_md_markup, "total_commission": new_total}

# ---------- AUDIT ----------
@api.get("/admin/audit-logs")
async def admin_audit(
    action: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    paginated: bool = False,
    user=Depends(require_roles("admin")),
):
    query = _build_audit_query(action=action, from_ts=from_ts, to_ts=to_ts, q=q)
    if paginated:
        page = max(1, page); page_size = max(1, min(200, page_size))
        total = await db.audit_logs.count_documents(query)
        items = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    else:
        items = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)
        total = len(items)
    user_ids = list({it["user_id"] for it in items if it.get("user_id")})
    actor_map: dict = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": user_ids}},
                                      {"_id": 0, "id": 1, "full_name": 1, "role": 1}):
            actor_map[u["id"]] = {"full_name": u.get("full_name"), "role": u.get("role")}
    for it in items:
        it["actor"] = actor_map.get(it.get("user_id"))
    if paginated:
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    return items

# ---------- DASHBOARDS / STATS ----------
def _resolve_range(range_key: str, from_date: Optional[str], to_date: Optional[str]):
    """Return (start_iso, end_iso) or (None, None) for lifetime."""
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    today_start_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    
    if range_key == "today":
        start = today_start_ist.astimezone(timezone.utc)
        end = (today_start_ist + timedelta(days=1)).astimezone(timezone.utc)
        return start.isoformat(), end.isoformat()
    if range_key == "yesterday":
        y = today_start_ist - timedelta(days=1)
        start = y.astimezone(timezone.utc)
        end = today_start_ist.astimezone(timezone.utc)
        return start.isoformat(), end.isoformat()
    if range_key == "last7":
        start = (today_start_ist - timedelta(days=7)).astimezone(timezone.utc)
        end = (today_start_ist + timedelta(days=1)).astimezone(timezone.utc)
        return start.isoformat(), end.isoformat()
    if range_key == "last30":
        start = (today_start_ist - timedelta(days=30)).astimezone(timezone.utc)
        end = (today_start_ist + timedelta(days=1)).astimezone(timezone.utc)
        return start.isoformat(), end.isoformat()
    if range_key == "this_month":
        first_day_ist = today_start_ist.replace(day=1)
        if first_day_ist.month == 12:
            next_month_ist = first_day_ist.replace(year=first_day_ist.year + 1, month=1)
        else:
            next_month_ist = first_day_ist.replace(month=first_day_ist.month + 1)
        start = first_day_ist.astimezone(timezone.utc)
        end = next_month_ist.astimezone(timezone.utc)
        return start.isoformat(), end.isoformat()
    if range_key == "custom":
        if not from_date or not to_date:
            raise HTTPException(400, "Custom range requires 'from' and 'to' dates")
        try:
            fd = datetime.fromisoformat(from_date).replace(tzinfo=ist_tz, hour=0, minute=0, second=0, microsecond=0)
            td = datetime.fromisoformat(to_date).replace(tzinfo=ist_tz, hour=0, minute=0, second=0, microsecond=0)
        except Exception:
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
        if fd > td:
            raise HTTPException(400, "From date cannot be after To date")
        start = fd.astimezone(timezone.utc)
        end = (td + timedelta(days=1)).astimezone(timezone.utc)
        return start.isoformat(), end.isoformat()
    # lifetime
    return None, None

async def _recharge_revenue_breakdown(date_match: dict) -> dict:
    """Reads IMMUTABLE per-recharge snapshots (admin_revenue_amount / md_earnings_amount /
    distributor_earnings_amount). Past totals are NEVER affected by current commission % changes.
    Extended integrity rule: admin_revenue + md_earnings + distributor_earnings = total_revenue."""
    rev_match = {"status": "approved", **date_match}
    agg = await db.recharges.aggregate([
        {"$match": rev_match},
        {"$group": {
            "_id": None,
            "recharge_approved":  {"$sum": "$amount"},
            "total_revenue":      {"$sum": "$total_commission_amount"},
            "admin_revenue":      {"$sum": "$admin_revenue_amount"},
            "md_earnings":        {"$sum": {"$ifNull": ["$md_earnings_amount", 0]}},
            "distributor_earnings": {"$sum": "$distributor_earnings_amount"},
        }},
    ]).to_list(1)
    if not agg:
        return {"recharge_approved": 0.0, "total_revenue": 0.0, "admin_revenue": 0.0,
                "md_earnings": 0.0, "distributor_earnings": 0.0}
    a = agg[0]
    return {
        "recharge_approved":    round(a.get("recharge_approved") or 0, 2),
        "total_revenue":        round(a.get("total_revenue") or 0, 2),
        "admin_revenue":        round(a.get("admin_revenue") or 0, 2),
        "md_earnings":          round(a.get("md_earnings") or 0, 2),
        "distributor_earnings": round(a.get("distributor_earnings") or 0, 2),
    }


async def _transaction_metrics(date_match: dict) -> dict:
    """Aggregates successful bill payments: volume, count and service-charge revenue."""
    txn_match = {"status": "success", **date_match}
    
    cc_task = db.transactions.aggregate([
        {"$match": {"type": "credit_card", **txn_match}},
        {"$group": {
            "_id": None,
            "vol": {"$sum": {"$ifNull": ["$bill_amount", "$amount"]}},
            "count": {"$sum": 1},
            "charges": {"$sum": {"$ifNull": ["$service_charge", 0]}},
        }}
    ]).to_list(1)

    live_task = db.transactions.aggregate([
        {"$match": {"type": "live_bill", **txn_match}},
        {"$group": {
            "_id": None,
            "vol": {"$sum": {"$ifNull": ["$bill_amount", "$amount"]}},
            "count": {"$sum": 1},
            "charges": {"$sum": {"$ifNull": ["$service_charge", 0]}},
            "api_charges": {"$sum": {"$ifNull": ["$api_charge", 0]}},
        }}
    ]).to_list(1)

    cc_agg, live_agg = await asyncio.gather(cc_task, live_task)

    cc_vol = cc_agg[0]["vol"] if cc_agg else 0.0
    cc_count = cc_agg[0]["count"] if cc_agg else 0
    cc_revenue = cc_agg[0]["charges"] if cc_agg else 0.0

    live_vol = live_agg[0]["vol"] if live_agg else 0.0
    live_count = live_agg[0]["count"] if live_agg else 0
    live_sc = live_agg[0]["charges"] if live_agg else 0.0
    live_api = live_agg[0]["api_charges"] if live_agg else 0.0
    live_profit = round(live_sc - live_api, 2)

    total_vol = round(cc_vol + live_vol, 2)
    total_count = cc_count + live_count
    total_revenue = round(cc_revenue + live_profit, 2)

    return {
        "total_txn_amount": total_vol,
        "total_txn_count": total_count,
        "transaction_revenue": total_revenue,
        "cc_bill_revenue": round(cc_revenue, 2),
        "live_bill_profit": round(live_profit, 2),
        "cc_bill_volume": round(cc_vol, 2),
        "live_bill_volume": round(live_vol, 2),
    }


async def _role_wallet_balances() -> dict:
    async with db.pool.acquire() as conn:
        rows = await conn.fetch('''
            SELECT u.role, COALESCE(SUM(w.balance), 0) as total
            FROM wallets w
            JOIN users u ON w.user_id::text = u.id::text
            WHERE u.is_deleted = FALSE
            GROUP BY u.role
        ''')
        out = {"agent": 0.0, "distributor": 0.0, "master_distributor": 0.0}
        for r in rows:
            if r["role"] in out:
                out[r["role"]] = float(r["total"] or 0.0)
        return out


_financial_stats_cache = {}

@api.get("/admin/stats/financial")
async def admin_stats_financial(
    range: str = Query("today"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    user=Depends(require_roles("admin")),
):
    import time
    cache_key = f"{range}_{from_date}_{to_date}"
    now = time.time()
    if cache_key in _financial_stats_cache:
        cached_res, ts = _financial_stats_cache[cache_key]
        if now - ts < 15.0:
            return cached_res

    start, end = _resolve_range(range, from_date, to_date)
    date_match = {"created_at": {"$gte": start, "$lt": end}} if start and end else {}

    rev_task = _recharge_revenue_breakdown(date_match)
    txn_task = _transaction_metrics(date_match)
    role_wallets_task = _role_wallet_balances()

    dist_lifetime_task = db.recharges.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$distributor_earnings_amount"}}}
    ]).to_list(1)

    dist_paid_task = db.withdrawals.aggregate([
        {"$match": {"status": "approved", "role": "distributor"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)

    md_lifetime_task = db.recharges.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$md_earnings_amount"}}}
    ]).to_list(1)

    md_paid_task = db.withdrawals.aggregate([
        {"$match": {"status": "approved", "role": "master_distributor"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)

    pending_kyc_task = db.users.count_documents({"role": "agent", "kyc_status": "pending"})

    wd_match = {"status": "approved"}
    if start and end:
        wd_match["reviewed_at"] = {"$gte": start, "$lt": end}
    wd_agg_task = db.withdrawals.aggregate([
        {"$match": wd_match},
        {"$group": {"_id": "$role", "total": {"$sum": "$amount"}}},
    ]).to_list(None)

    rev, txn, role_wallets, dist_lifetime_agg, dist_paid_agg, md_lifetime_agg, md_paid_agg, pending_kyc_count, wd_agg = await asyncio.gather(
        rev_task, txn_task, role_wallets_task,
        dist_lifetime_task, dist_paid_task, md_lifetime_task, md_paid_task,
        pending_kyc_task, wd_agg_task
    )

    dist_ids = [u["id"] async for u in db.users.find({"role": "distributor", "is_deleted": False}, {"_id": 0, "id": 1})]
    md_ids = [u["id"] async for u in db.users.find({"role": "master_distributor", "is_deleted": False}, {"_id": 0, "id": 1})]

    dist_adj_map, md_adj_map = await asyncio.gather(
        _admin_adjustments_sum_batch(dist_ids),
        _admin_adjustments_sum_batch(md_ids)
    )

    dist_recharges_sum = dist_lifetime_agg[0]["total"] if dist_lifetime_agg else 0.0
    md_recharges_sum = md_lifetime_agg[0]["total"] if md_lifetime_agg else 0.0

    dist_paid_sum = dist_paid_agg[0]["total"] if dist_paid_agg else 0.0
    md_paid_sum = md_paid_agg[0]["total"] if md_paid_agg else 0.0

    dist_adj_sum = sum(dist_adj_map.values())
    md_adj_sum = sum(md_adj_map.values())

    total_distributor_earnings = max(0.0, round(dist_recharges_sum + dist_adj_sum - dist_paid_sum, 2))
    total_md_earnings = max(0.0, round(md_recharges_sum + md_adj_sum - md_paid_sum, 2))
    total_agent_wallet = round(role_wallets.get("agent", 0.0), 2)
    total_distributor_wallet = total_distributor_earnings
    total_md_wallet = total_md_earnings
    total_wallet = round(total_agent_wallet + total_distributor_wallet + total_md_wallet, 2)
    agent_wd = 0.0
    dist_wd = 0.0
    md_wd = 0.0
    for row in wd_agg:
        if row["_id"] == "agent":
            agent_wd = float(row.get("total") or 0)
        elif row["_id"] == "distributor":
            dist_wd = float(row.get("total") or 0)
        elif row["_id"] == "master_distributor":
            md_wd = float(row.get("total") or 0)
    total_wd = agent_wd + dist_wd + md_wd

    res = {
        "range": range,
        "from": start, "to": end,
        "total_revenue": round(rev["total_revenue"], 2),
        "admin_revenue": rev["admin_revenue"],
        "md_earnings": rev["md_earnings"],
        "distributor_earnings": rev["distributor_earnings"],
        "recharge_approved": rev["recharge_approved"],
        "total_wallet": total_wallet,
        "total_agent_wallet": total_agent_wallet,
        "total_distributor_wallet": total_distributor_wallet,
        "total_md_wallet": total_md_wallet,
        "total_distributor_earnings": total_distributor_earnings,
        "total_md_earnings": total_md_earnings,
        "total_txn_amount": round(txn["total_txn_amount"], 2),
        "total_txn_count": txn["total_txn_count"],
        "transaction_revenue": round(txn["transaction_revenue"], 2),
        "cc_bill_revenue": txn.get("cc_bill_revenue", 0.0),
        "live_bill_profit": txn.get("live_bill_profit", 0.0),
        "cc_bill_volume": txn.get("cc_bill_volume", 0.0),
        "live_bill_volume": txn.get("live_bill_volume", 0.0),
        "pending_kyc_count": pending_kyc_count,
        "total_withdrawals_approved": round(total_wd, 2),
        "agent_withdrawals_approved": round(agent_wd, 2),
        "distributor_withdrawals_approved": round(dist_wd, 2),
        "md_withdrawals_approved": round(md_wd, 2),
    }
    _financial_stats_cache[cache_key] = (res, now)
    return res

_admin_stats_cache = {}

@api.get("/admin/stats")
async def admin_stats(full: bool = False, user=Depends(require_roles("admin"))):
    import time
    cache_key = f"stats_full_{full}"
    now = time.time()
    if cache_key in _admin_stats_cache:
        cached_res, ts = _admin_stats_cache[cache_key]
        if now - ts < 5.0:
            return cached_res

    pending_recharges, pending_withdrawals, pending_transactions, pending_kyc = await asyncio.gather(
        db.recharges.count_documents({"status": "pending"}),
        db.withdrawals.count_documents({"status": "pending"}),
        db.transactions.count_documents({"status": "pending", "type": "credit_card"}),
        db.users.count_documents({"role": "agent", "kyc_status": "pending"})
    )
    
    stats = {
        "pending_recharges": pending_recharges,
        "pending_withdrawals": pending_withdrawals,
        "pending_transactions": pending_transactions,
        "pending_kyc": pending_kyc
    }
    
    if full:
        total_agents_task = db.users.count_documents({"role": "agent", "is_deleted": False})
        total_distributors_task = db.users.count_documents({"role": "distributor", "is_deleted": False})
        total_master_distributors_task = db.users.count_documents({"role": "master_distributor", "is_deleted": False})
        
        total_agents, total_distributors, total_master_distributors = await asyncio.gather(
            total_agents_task, total_distributors_task, total_master_distributors_task
        )
        
        stats.update({
            "total_agents": total_agents,
            "total_distributors": total_distributors,
            "total_master_distributors": total_master_distributors,
            "total_wallet": 0.0,
            "total_revenue": 0.0,
            "total_txn_amount": 0.0,
            "total_txn_count": 0,
        })
        
    _admin_stats_cache[cache_key] = (stats, now)
    return stats

@api.get("/distributor/stats")
async def distributor_stats(user=Depends(require_approved_distributor())):
    dist_id = user["id"]
    agent_ids = [u["id"] async for u in db.users.find({"parent_id": dist_id}, {"_id": 0, "id": 1})]

    async def _zero(): return 0
    pr_task = db.recharges.count_documents({"user_id": {"$in": agent_ids}, "status": "pending"}) if agent_ids else _zero()

    a_task = db.users.count_documents({"parent_id": dist_id, "is_deleted": False})
    earn_task = _distributor_earnings_for(dist_id)
    today_task = _distributor_today_earnings(dist_id)
    avail_task = get_distributor_available_for_withdrawal(dist_id)
    ar_task = db.recharges.count_documents({"distributor_id": dist_id, "status": "approved"})

    agents, pending_recharges, earnings, today_earnings, available_for_withdrawal, approved_recharges = await asyncio.gather(
        a_task, pr_task, earn_task, today_task, avail_task, ar_task
    )

    return {
        "agents": agents,
        "pending_recharges": pending_recharges,
        "earnings": earnings,
        "today_earnings": today_earnings,
        "available_for_withdrawal": available_for_withdrawal,
        "approved_recharges": approved_recharges,
    }


# ---------- DANGER ZONE: DEMO DATA RESET ----------
class DemoResetIn(BaseModel):
    confirm: str  # must equal "RESET"


@api.post("/admin/system/reset-demo-data")
async def reset_demo_data(body: DemoResetIn, request: Request, user=Depends(require_roles("admin"))):
    """Selectively wipe transactional/user data while preserving the super-admin,
    commission settings and QR codes. Only the seeded super-admin
    (ADMIN_EMAIL) may invoke this. Mandatory typed confirmation = 'RESET'.
    """
    # Super-admin gate — only the bootstrap admin account can perform this destructive op
    if user.get("email", "").lower() != ADMIN_EMAIL.lower():
        raise HTTPException(403, "Only the Super Admin can perform demo data reset")
    if body.confirm != "RESET":
        raise HTTPException(400, "Typed confirmation does not match. Type RESET (uppercase) to confirm.")

    qr_paths = [q["image_path"] async for q in db.qr_codes.find({}, {"_id": 0, "image_path": 1}) if q.get("image_path")]

    async def safe_delete(coll, query=None):
        try:
            r = await coll.delete_many(query or {})
            return r.deleted_count
        except Exception as exc:
            logger.warning(f"reset_demo_data: delete_many failed on {coll.name}: {exc}")
            return 0

    deleted = {
        "ledger":        await safe_delete(db.ledger),
        "transactions":  await safe_delete(db.transactions),
        "recharges":     await safe_delete(db.recharges),
        "withdrawals":   await safe_delete(db.withdrawals),
        "kyc":           await safe_delete(db.kyc),
        "bank_details":  await safe_delete(db.bank_details),
        "audit_logs":    await safe_delete(db.audit_logs),
        "notifications": await safe_delete(db.notifications),
        "fraud_flags":   await safe_delete(db.fraud_flags),
        "files":         await safe_delete(db.files, {"storage_path": {"$nin": qr_paths}}),
        "wallets":       await safe_delete(db.wallets, {"user_id": {"$ne": user["id"]}}),
        "users":         await safe_delete(db.users, {"role": {"$in": ["master_distributor", "distributor", "agent"]}}),
    }

    # Make sure every QR record is visible again (per spec: keep all QR codes)
    await db.qr_codes.update_many({}, {"$set": {"is_deleted": False}})

    # Reseed the audit trail with a single marker entry
    await write_audit(user["id"], "demo_data_reset",
                      meta={"deleted": deleted, "qr_paths_kept": len(qr_paths)},
                      request=request)

    return {"ok": True, "deleted": deleted, "qr_paths_kept": len(qr_paths)}

# ---------- STARTUP ----------
async def _ensure_indexes() -> None:
    async with db.pool.acquire() as conn:
        # Ensure OCR columns exist in the recharges table
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS ocr_utr TEXT')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS ocr_amount NUMERIC(15, 2)')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS ocr_qr_name TEXT')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS ocr_match BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS ocr_bypass BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_tester BOOLEAN DEFAULT FALSE')

        await conn.execute('''
            CREATE TABLE IF NOT EXISTS billers (
                biller_id VARCHAR(255) PRIMARY KEY,
                biller_name VARCHAR(255) NOT NULL,
                category VARCHAR(255) NOT NULL,
                metadata JSONB,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS policies (
                id VARCHAR(255) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS rejection_categories (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                show_bill BOOLEAN DEFAULT FALSE,
                show_qr BOOLEAN DEFAULT FALSE,
                show_kyc BOOLEAN DEFAULT FALSE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS rejection_reasons (
                id VARCHAR(255) PRIMARY KEY,
                category_id VARCHAR(255) NOT NULL,
                reason_text TEXT NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS biller_categories (
                category_name VARCHAR(255) PRIMARY KEY,
                enabled BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS qr_name_entries (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                color VARCHAR(50) NOT NULL,
                mobile_number VARCHAR(20) NOT NULL,
                upi_id VARCHAR(255) NOT NULL,
                min_amount NUMERIC(15, 2) DEFAULT 0,
                max_amount NUMERIC(15, 2) DEFAULT 0,
                image_path TEXT NOT NULL,
                position INTEGER DEFAULT 0,
                active BOOLEAN DEFAULT TRUE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS service_charge_slabs (
                id VARCHAR(255) PRIMARY KEY,
                min_amount NUMERIC(15, 2) NOT NULL,
                max_amount NUMERIC(15, 2) NOT NULL,
                charge_amount NUMERIC(15, 2) NOT NULL,
                charge_type VARCHAR(20) DEFAULT 'flat',
                active BOOLEAN DEFAULT TRUE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS banks (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                bill_pay_enabled BOOLEAN DEFAULT TRUE,
                payout_enabled BOOLEAN DEFAULT TRUE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS headlines (
                id VARCHAR(255) PRIMARY KEY,
                message TEXT NOT NULL,
                type VARCHAR(20) DEFAULT 'text',
                active BOOLEAN DEFAULT TRUE,
                position INTEGER DEFAULT 0,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ
            )
        ''')
        await conn.execute('ALTER TABLE headlines ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0')
        await conn.execute("ALTER TABLE headlines ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'text'")
        await conn.execute('ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(50)')
        await conn.execute('ALTER TABLE qr_name_entries ADD COLUMN IF NOT EXISTS qr_percent NUMERIC(15, 4) DEFAULT 0')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS min_recharge_limit NUMERIC(15, 2) DEFAULT 100')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS max_recharge_limit NUMERIC(15, 2) DEFAULT 300000')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS live_bill_max_limit NUMERIC(15, 2) DEFAULT 100000')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS live_bill_api_charge NUMERIC(15, 2) DEFAULT 0')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS t1_qr_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS recharge_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS t1_recharge_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS withdrawal_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS bill_pay_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS live_bill_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_path TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS favicon_path TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_collapsed_path TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS watermark_path TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS onesignal_app_id TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS onesignal_rest_api_key TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_approved_audio TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_rejected_audio TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS cc_bill_approved_audio TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS cc_bill_rejected_audio TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_request_received_audio TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS cc_bill_request_received_audio TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS live_bill_enabled_audio TEXT DEFAULT \'\'')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_approved_audio_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_rejected_audio_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS cc_bill_approved_audio_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS cc_bill_rejected_audio_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_request_received_audio_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS cc_bill_request_received_audio_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS live_bill_enabled_audio_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS qr_activation_history (
                id VARCHAR(255) PRIMARY KEY,
                qr_code_id VARCHAR(255) NOT NULL,
                label VARCHAR(255) NOT NULL,
                mobile_number VARCHAR(50),
                upi_id VARCHAR(255),
                qr_percent NUMERIC(15, 4) DEFAULT 0,
                activated_at TIMESTAMPTZ NOT NULL,
                deactivated_at TIMESTAMPTZ,
                status VARCHAR(50) DEFAULT 'ACTIVE'
            )
        ''')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_qr_code_id ON recharges (qr_code_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_rejection_reasons_category_id ON rejection_reasons (category_id)')
        
        # Speed indexes for users and wallets
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_role_is_deleted ON users (role, is_deleted)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users (parent_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_md_id ON users (md_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets (user_id)')
        
        # Status indexes for fast pending counts
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_status ON recharges (status)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc (status)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users (kyc_status)')
        
        # User ID indexes for quick history lists
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_user_id ON recharges (user_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger (user_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals (user_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_distributor_id ON recharges (distributor_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_md_id ON recharges (md_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_status_distributor_id ON recharges (status, distributor_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_status_md_id ON recharges (status, md_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_status_user_id ON recharges (status, user_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_ledger_user_id_ref_type ON ledger (user_id, ref_type)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_status_user_id ON transactions (status, user_id)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_withdrawals_status_user_id ON withdrawals (status, user_id)')

        # Sorting speed indexes
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_recharges_created_at ON recharges (created_at DESC)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals (created_at DESC)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger (created_at DESC)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_role_created_at ON users (role, created_at DESC)')
        await conn.execute('CREATE INDEX IF NOT EXISTS idx_kyc_updated_at ON kyc (updated_at DESC)')
        try:
            await conn.execute('DROP INDEX IF EXISTS uniq_user_utr_active')
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_utr_active ON recharges (utr) WHERE status IN ('pending', 'approved')")
        except Exception as e:
            logger.warning(f"Could not create unique UTR index: {e}")
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS older_qr BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS settled_distributor BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS settled_md BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_path TEXT')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS favicon_path TEXT')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_collapsed_path TEXT')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS watermark_path TEXT')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS t1_recharge_enabled BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS live_bill_max_limit NUMERIC(15, 2) DEFAULT 100000')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS firm_name VARCHAR(255)')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS firm_address TEXT')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT TRUE')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_shown BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_back_path TEXT')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS pan_back_path TEXT')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS selfie_path TEXT')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS cheque_path TEXT')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS firm_front_path TEXT')
        await conn.execute('ALTER TABLE kyc ADD COLUMN IF NOT EXISTS aadhaar_back_path TEXT')
        await conn.execute('ALTER TABLE kyc ADD COLUMN IF NOT EXISTS pan_back_path TEXT')
        await conn.execute('ALTER TABLE kyc ADD COLUMN IF NOT EXISTS selfie_path TEXT')
        await conn.execute('ALTER TABLE kyc ADD COLUMN IF NOT EXISTS cheque_path TEXT')
        await conn.execute('ALTER TABLE kyc ADD COLUMN IF NOT EXISTS firm_front_path TEXT')
        await conn.execute('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kyc_status_check')
        await conn.execute("ALTER TABLE users ADD CONSTRAINT users_kyc_status_check CHECK (kyc_status IN ('pending', 'approved', 'rejected', 'not_submitted'))")
        await conn.execute('ALTER TABLE kyc DROP CONSTRAINT IF EXISTS kyc_status_check')
        await conn.execute("ALTER TABLE kyc ADD CONSTRAINT kyc_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'not_submitted'))")
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS t1_commission_percent NUMERIC(15, 4) DEFAULT 0')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS t1_admin_pct NUMERIC(15, 4) DEFAULT 0')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS t1_md_pct NUMERIC(15, 4) DEFAULT 0')
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS t1_dist_pct NUMERIC(15, 4) DEFAULT 0')
        await conn.execute('ALTER TABLE wallets ADD COLUMN IF NOT EXISTS t1_balance NUMERIC(15, 2) DEFAULT 0')
        await conn.execute('ALTER TABLE wallets ADD COLUMN IF NOT EXISTS hold_balance NUMERIC(15, 2) DEFAULT 0')
        await conn.execute('ALTER TABLE wallets ADD COLUMN IF NOT EXISTS hold_active BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS is_t1 BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS settled_t1 BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE recharges ADD COLUMN IF NOT EXISTS settled_t1_at TIMESTAMPTZ')
        await conn.execute('ALTER TABLE qr_name_entries ADD COLUMN IF NOT EXISTS is_t1 BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS is_t1 BOOLEAN DEFAULT FALSE')
        await conn.execute('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS api_charge NUMERIC(15, 2) DEFAULT 0')
        await conn.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS live_bill_api_charge NUMERIC(15, 2) DEFAULT 0')
        # Admin Statement tables
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS admin_profit_ledger (
                id VARCHAR(255) PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                amount NUMERIC(15, 2) NOT NULL,
                balance_after NUMERIC(15, 2) NOT NULL,
                ref_type VARCHAR(100),
                ref_id VARCHAR(255),
                note TEXT,
                created_at TIMESTAMPTZ NOT NULL
            )
        ''')
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS admin_cashbook (
                id VARCHAR(255) PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                amount NUMERIC(15, 2) NOT NULL,
                balance_after NUMERIC(15, 2) NOT NULL,
                ref_type VARCHAR(100),
                ref_id VARCHAR(255),
                note TEXT,
                created_at TIMESTAMPTZ NOT NULL
            )
        ''')
    await db.users.create_index("email", unique=True)
    # drop legacy agent_code index if it exists from older schema
    try:
        existing_indexes = await db.users.index_information()
        for idx_name in list(existing_indexes.keys()):
            if "agent_code" in idx_name:
                await db.users.drop_index(idx_name)
    except Exception as e:
        logger.warning(f"Index cleanup skipped: {e}")
    await db.wallets.create_index("user_id", unique=True)
    await db.ledger.create_index("user_id")
    await db.recharges.create_index("user_id")
    await db.service_charge_slabs.create_index("min_amount")
    await db.banks.create_index("name", unique=True)
    try:
        await db.recharges.create_index(
            [("user_id", 1), ("utr", 1)],
            unique=True,
            partialFilterExpression={"status": {"$in": ["pending", "approved"]}},
            name="uniq_user_utr_active",
        )
    except DuplicateKeyError as e:
        # Legacy duplicate (agent_id, utr) pairs exist from before the
        # idempotency guard was added. The application-level duplicate check
        # in POST /api/agent/recharges still prevents new duplicates; the
        # partial unique index is only a race-condition safety net.
        logger.warning(
            f"Skipped uniq_user_utr_active index due to legacy duplicates: {e}"
        )
    await db.transactions.create_index("user_id")
    await db.withdrawals.create_index("user_id")
    # Indexes to keep server-side pagination (sort by created_at desc + optional
    # status filter) fast even as these collections grow into six figures.
    await db.recharges.create_index([("created_at", -1)])
    await db.recharges.create_index([("status", 1), ("created_at", -1)])
    await db.recharges.create_index([("user_id", 1), ("created_at", -1)])
    await db.recharges.create_index([("qr_code_id", 1), ("created_at", -1)])
    await db.transactions.create_index([("created_at", -1)])
    await db.transactions.create_index([("status", 1), ("created_at", -1)])
    await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.transactions.create_index([("operator", 1), ("created_at", -1)])
    await db.withdrawals.create_index([("created_at", -1)])
    await db.withdrawals.create_index([("status", 1), ("created_at", -1)])
    await db.withdrawals.create_index([("role", 1), ("created_at", -1)])
    await db.audit_logs.create_index([("created_at", -1)])
    await db.audit_logs.create_index([("action", 1), ("created_at", -1)])
    await db.users.create_index([("role", 1), ("is_deleted", 1), ("created_at", -1)])
    await db.users.create_index([("md_id", 1), ("role", 1), ("is_deleted", 1), ("created_at", -1)])
    await db.recharges.create_index([("md_id", 1), ("status", 1), ("created_at", -1)])
    await db.recharges.create_index([("distributor_id", 1), ("status", 1), ("created_at", -1)])
    await db.withdrawals.create_index([("user_id", 1), ("status", 1)])

    # Seed default service charge slabs if table is empty
    count = await db.service_charge_slabs.count_documents({"is_deleted": False})
    if count == 0:
        await db.service_charge_slabs.insert_one({
            "id": new_id(),
            "min_amount": 0.0,
            "max_amount": 50000.0,
            "charge_amount": 15.0,
            "charge_type": "flat",
            "active": True,
            "is_deleted": False,
            "created_at": now_iso()
        })
        await db.service_charge_slabs.insert_one({
            "id": new_id(),
            "min_amount": 50001.0,
            "max_amount": 100000.0,
            "charge_amount": 25.0,
            "charge_type": "flat",
            "active": True,
            "is_deleted": False,
            "created_at": now_iso()
        })

    # Seed default banks if table is empty
    bank_count = await db.banks.count_documents({"is_deleted": False})
    if bank_count == 0:
        default_banks = [
            "AU Bank Credit Card", "Axis Bank Credit Card", "BOBCARD One Credit Card",
            "Bandhan Bank Credit Card", "Bank Of India Credit Card", "Bank of Baroda - Credit Card",
            "CSB Bank Edge RuPay Credit Card", "CUB Credit Card", "Canara Bank Credit Card",
            "DBS Credit Card", "DCB Bank Credit Card", "Dhanlaxmi Bank Credit Card",
            "ESAF Bank Credit Card", "Federal Bank Credit Card", "HDFC Bank Credit Card",
            "HDFC Bank Pixel Credit Card", "HSBC Bank Credit Card", "ICICI Bank Credit Card",
            "IDBI Bank Credit Card", "IDFC FIRST Bank Credit Card", "IOB Credit Card",
            "Indian Bank Credit Card", "Indian Bank One Credit Card", "Indusind Bank Credit Card",
            "J&K Bank Credit Card", "Kotak Mahindra Bank Credit Card", "PNB Credit Card",
            "RBL Bank Credit Card", "SBI Card", "SBM Bank (India) Credit Card",
            "SIB One Credit Card", "Saraswat Bank Credit Card", "Suryoday SFB Credit Card",
            "Tamilnad Mercantile Bank Credit Card", "UBI Credit Card", "Yes Bank Credit Card"
        ]
        for name in default_banks:
            await db.banks.insert_one({
                "id": new_id(),
                "name": name,
                "active": True,
                "bill_pay_enabled": True,
                "payout_enabled": True,
                "is_deleted": False,
                "created_at": now_iso()
            })


async def _seed_admin_user() -> None:
    # Ensure the admin_credentials table exists in Supabase PostgreSQL with permissions and frozen
    try:
        async with db.pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS "admin_credentials" (
                    id VARCHAR(255) PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255),
                    password_hash VARCHAR(255) NOT NULL,
                    permissions JSONB DEFAULT '[]'::jsonb,
                    frozen BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS "password_resets" (
                    id VARCHAR(255) PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    otp VARCHAR(50) NOT NULL,
                    expires_at TIMESTAMP WITH TIME ZONE,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            ''')
    except Exception as e:
        logger.error(f"Failed to create admin_credentials or password_resets table: {e}")
        
    SUPER_EMAIL = "jigs.vanani@gmail.com"
    SUPER_PASS = "Jigscse@3521"
    
    # Ensure super admin jigs.vanani@gmail.com is seeded
    try:
        super_cred = await db.admin_credentials.find_one({"email": SUPER_EMAIL})
        if not super_cred:
            u = await db.users.find_one({"email": SUPER_EMAIL})
            super_id = u["id"] if u else new_id()
            await db.admin_credentials.insert_one({
                "id": super_id,
                "email": SUPER_EMAIL,
                "password": SUPER_PASS,
                "password_hash": hash_password(SUPER_PASS),
                "permissions": ["dashboard", "master-distributors", "distributors", "agents", "recharges", "withdrawals", "transactions", "live-bill-history", "statement", "qrcodes", "qr-name-entry", "qr-gallery", "headlines", "commission", "service-slabs", "banks", "kyc", "reasons", "audit", "backups", "change-password", "settings", "policies", "admins"],
                "frozen": False,
                "created_at": now_iso()
            })
            logger.info(f"Seeded Super Admin: {SUPER_EMAIL}")
    except Exception as e:
        logger.error(f"Failed to seed Super Admin: {e}")

    # Ensure normal admin makfinpay@gmail.com is seeded
    try:
        normal_cred = await db.admin_credentials.find_one({"email": ADMIN_EMAIL})
        if not normal_cred:
            u = await db.users.find_one({"email": ADMIN_EMAIL})
            normal_id = u["id"] if u else new_id()
            await db.admin_credentials.insert_one({
                "id": normal_id,
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
                "password_hash": hash_password(ADMIN_PASSWORD),
                "permissions": ["dashboard", "master-distributors", "distributors", "agents", "recharges", "withdrawals", "transactions", "live-bill-history", "statement", "qrcodes", "qr-name-entry", "qr-gallery", "headlines", "commission", "service-slabs", "banks", "kyc", "reasons", "audit", "backups", "change-password", "settings", "policies", "admins"],
                "frozen": False,
                "created_at": now_iso()
            })
            logger.info(f"Seeded normal admin: {ADMIN_EMAIL}")
    except Exception as e:
        logger.error(f"Failed to seed normal admin: {e}")

    # Query all admin_credentials
    creds = []
    try:
        creds = await db.admin_credentials.find({}).to_list(100)
    except Exception as e:
        logger.error(f"Failed to query admin_credentials: {e}")
        
    # Sync all credentials from admin_credentials to the users table
    for cred in creds:
        email = cred["email"].lower()
        password_hash = cred.get("password_hash") or hash_password(cred.get("password") or ADMIN_PASSWORD)
        permissions = cred.get("permissions") or []
        frozen = bool(cred.get("frozen", False))
        
        existing = await db.users.find_one({"email": email})
        if not existing:
            try:
                await db.users.insert_one({
                    "id": cred.get("id") or new_id(),
                    "role": "admin",
                    "full_name": "Super Admin" if email == SUPER_EMAIL else "Admin User",
                    "email": email,
                    "password_hash": password_hash,
                    "phone": "",
                    "address": "",
                    "frozen": frozen,
                    "is_deleted": False,
                    "created_at": now_iso(),
                    "permissions": permissions
                })
                logger.info(f"Synced and seeded admin user: {email}")
            except Exception as e:
                logger.error(f"Failed to insert synced admin: {e}")
        else:
            updates = {}
            if existing.get("role") != "admin":
                updates["role"] = "admin"
            if existing.get("password_hash") != password_hash:
                updates["password_hash"] = password_hash
            if bool(existing.get("frozen")) != frozen:
                updates["frozen"] = frozen
            updates["permissions"] = permissions
            if "agent_code" in existing:
                try:
                    await db.users.update_one({"email": email}, {"$unset": {"agent_code": ""}})
                except Exception:
                    pass
            if updates:
                try:
                    await db.users.update_one({"email": email}, {"$set": updates})
                except Exception as e:
                    logger.error(f"Failed to update synced admin: {e}")


async def _ensure_commission_settings() -> None:
    if not await db.settings.find_one({"id": "commission"}):
        await db.settings.insert_one({"id": "commission", "default_percent": 1.2, "min_recharge_limit": 100, "max_recharge_limit": 300000, "qr_enabled": True, "t1_qr_enabled": True, "recharge_enabled": True, "t1_recharge_enabled": True, "withdrawal_enabled": True, "bill_pay_enabled": True, "updated_at": now_iso()})
    else:
        s = await db.settings.find_one({"id": "commission"})
        set_updates = {}
        if s.get("min_recharge_limit") is None:
            set_updates["min_recharge_limit"] = 100
        if s.get("max_recharge_limit") is None:
            set_updates["max_recharge_limit"] = 300000
        if s.get("qr_enabled") is None:
            set_updates["qr_enabled"] = True
        if s.get("recharge_enabled") is None:
            set_updates["recharge_enabled"] = True
        if s.get("t1_recharge_enabled") is None:
            set_updates["t1_recharge_enabled"] = True
        if s.get("withdrawal_enabled") is None:
            set_updates["withdrawal_enabled"] = True
        if s.get("bill_pay_enabled") is None:
            set_updates["bill_pay_enabled"] = True
        
        if set_updates:
            await db.settings.update_one({"id": "commission"}, {"$unset": {"min_percent": "", "max_percent": ""}, "$set": set_updates})
        else:
            await db.settings.update_one({"id": "commission"}, {"$unset": {"min_percent": "", "max_percent": ""}})


def _build_commission_migration(user: dict, default_pct: float, parent_pct: Optional[float]) -> dict:
    """Compute base/markup/total/type for a legacy user that lacks the new commission fields."""
    current = float(user.get("commission_percent", default_pct))
    if user.get("role") == "distributor":
        return {
            "base_commission": current,
            "markup_commission": 0.0,
            "total_commission": current,
            "commission_type": "default" if abs(current - default_pct) < 1e-9 else "custom",
            "created_by_role": "admin",
        }
    # agent
    if parent_pct is not None:
        markup = max(0.0, round(current - parent_pct, 4))
        return {
            "base_commission": parent_pct,
            "markup_commission": markup,
            "total_commission": current,
            "commission_type": "custom",
            "created_by_role": "distributor",
        }
    return {
        "base_commission": current,
        "markup_commission": 0.0,
        "total_commission": current,
        "commission_type": "default" if abs(current - default_pct) < 1e-9 else "custom",
        "created_by_role": "admin",
    }


async def _migrate_commission_schema() -> None:
    """Backfill base/markup/total_commission on legacy users.
    Bounded server-side: only fetches users that haven't already been migrated,
    and only the fields needed to compute the update. Idempotent on every restart."""
    settings = await db.settings.find_one({"id": "commission"}, {"_id": 0}) or {"default_percent": 1.2}
    default_pct = float(settings.get("default_percent", 1.2))
    query = {
        "role": {"$in": ["distributor", "agent"]},
        "$or": [
            {"total_commission": {"$exists": False}},
            {"base_commission":  {"$exists": False}},
        ],
    }
    projection = {"_id": 0, "id": 1, "role": 1, "parent_id": 1, "commission_percent": 1}
    async for u in db.users.find(query, projection):
        parent_pct = None
        if u.get("role") == "agent" and u.get("parent_id"):
            parent = await db.users.find_one({"id": u["parent_id"]}, {"_id": 0, "commission_percent": 1})
            parent_pct = float(parent.get("commission_percent", default_pct)) if parent else default_pct
        updates = _build_commission_migration(u, default_pct, parent_pct)
        await db.users.update_one({"id": u["id"]}, {"$set": updates})


@app.on_event("startup")
async def startup():
    try:
        supabase_url = (os.environ.get("REACT_APP_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "https://zpynrddggarkltuueqdk.supabase.co").strip().rstrip("/")
        subdomain = supabase_url.replace("https://", "").replace("http://", "").replace(".supabase.co", "").strip()
        supabase_db_url = os.environ.get("SUPABASE_POSTGRES_URI") or os.environ.get("DATABASE_URL") or f"postgresql://postgres:Jigscse%40123@db.{subdomain}.supabase.co:5432/postgres?sslmode=require"
        await db.init_pool(supabase_db_url)
        init_storage()
        await _ensure_indexes()
        await _seed_admin_user()
        await _ensure_commission_settings()
        await _migrate_commission_schema()
        await _migrate_kyc_status()
        await _migrate_recharge_revenue_snapshot()
        await _ensure_backup_settings()
        _ensure_backup_scheduler()
        await run_t1_daily_settlement()
        await run_daily_commission_settlement()
        _start_t1_scheduler()
    except Exception as e:
        logger.error(f"Startup error occurred: {e}")


async def _migrate_kyc_status() -> None:
    """Existing agents without `kyc_status` are treated as already-approved
    so the new gate does not lock out users who were active before this release.
    """
    await db.users.update_many(
        {"role": "agent", "kyc_status": {"$exists": False}},
        {"$set": {"kyc_status": "approved", "kyc_rejection_reason": "",
                  "kyc_reviewed_at": None, "kyc_reviewed_by": None}},
    )
    # Distributors don't have KYC — mark them approved so the field exists
    await db.users.update_many(
        {"role": "distributor", "kyc_status": {"$exists": False}},
        {"$set": {"kyc_status": "approved"}},
    )


async def _migrate_recharge_revenue_snapshot() -> None:
    """Backfill the IMMUTABLE earnings split fields on every approved recharge
    that pre-dates the snapshot feature. Uses the agent's CURRENT base/markup
    split as an estimate (marked `estimated: true`). Total is preserved exactly.
    """
    cursor = db.recharges.find(
        {"status": "approved", "distributor_earnings_amount": {"$exists": False}},
        {"_id": 0, "id": 1, "user_id": 1, "amount": 1, "commission_amount": 1,
         "credit_amount": 1, "commission_percent": 1},
    )
    async for r in cursor:
        user_id = r.get("user_id")
        if not user_id:
            continue
        agent = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "parent_id": 1, "base_commission": 1, "markup_commission": 1,
             "total_commission": 1, "commission_percent": 1},
        ) or {}
        gross = float(r.get("amount") or 0)
        stored_total = float(r.get("commission_amount") or 0)
        # Estimate the split ratio from current agent settings
        cur_base   = float(agent.get("base_commission") or 0.0)
        cur_markup = float(agent.get("markup_commission") or 0.0)
        cur_total  = cur_base + cur_markup
        if cur_total > 0:
            admin_share = round(stored_total * (cur_base / cur_total), 2)
        else:
            admin_share = stored_total
        dist_share = round(stored_total - admin_share, 2)
        # Distributor_id only set if this agent has a parent + positive markup historically
        dist_id = agent.get("parent_id") if cur_markup > 0 and agent.get("parent_id") else None
        await db.recharges.update_one({"id": r["id"]}, {"$set": {
            "agent_id": user_id,
            "distributor_id": dist_id,
            "gross_amount": gross,
            "commission_percent_used": float(r.get("commission_percent") or cur_total),
            "admin_commission_percent": cur_base,
            "distributor_markup_percent": cur_markup,
            "total_commission_amount": stored_total,
            "admin_revenue_amount": admin_share,
            "distributor_earnings_amount": dist_share,
            "net_credit_amount": float(r.get("credit_amount") or (gross - stored_total)),
            "estimated": True,
        }})



    """Existing agents without `kyc_status` are treated as already-approved
    so the new gate does not lock out users who were active before this release.
    """
    await db.users.update_many(
        {"role": "agent", "kyc_status": {"$exists": False}},
        {"$set": {"kyc_status": "approved", "kyc_rejection_reason": "",
                  "kyc_reviewed_at": None, "kyc_reviewed_by": None}},
    )
    # Distributors don't have KYC — mark them approved so the field exists
    await db.users.update_many(
        {"role": "distributor", "kyc_status": {"$exists": False}},
        {"$set": {"kyc_status": "approved"}},
    )

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---------- BACKUP & RESTORE ----------
# Backup goal: capture EVERY collection (enumerated dynamically) + EVERY uploaded
# file binary at the exact moment of snapshot. Restore must produce a state that
# is byte-for-byte equivalent to the snapshot, with a post-restore manifest
# verification so partial restores can never silently report success.
#
# Excluded from app-data backup (these are metadata about the backup system itself
# or system collections; including them would create a chicken-and-egg loop on
# restore and could destroy other backups):
#   - backups                  (metadata index for backup bundles)
#   - backup_settings          (toggle + retention config)
#   - backups_fs.files         (GridFS file metadata for the backup bucket)
#   - backups_fs.chunks        (GridFS binary chunks for the backup bucket)
#   - any collection named system.*
BACKUP_EXCLUDED_COLLECTIONS = {
    "backups", "backup_settings", "backups_fs.files", "backups_fs.chunks",
}
DEFAULT_RETENTION_DAYS = 30

_gridfs: Optional[AsyncIOMotorGridFSBucket] = None


def _gfs() -> AsyncIOMotorGridFSBucket:
    global _gridfs
    if _gridfs is None:
        _gridfs = AsyncIOMotorGridFSBucket(db, bucket_name="backups_fs")
    return _gridfs


async def _app_collection_names() -> list:
    """Enumerate every collection in the database that belongs to the application,
    filtering out backup-system + Mongo system collections. Done dynamically so
    any collection added in the future is included automatically."""
    names = await db.list_collection_names()
    out = []
    for n in names:
        if n in BACKUP_EXCLUDED_COLLECTIONS:
            continue
        if n.startswith("system."):
            continue
        out.append(n)
    return sorted(out)


async def _dump_db_to_gz_bytes() -> bytes:
    """LEGACY v2 path. Retained for tests / small backups that still want a sync
    in-memory blob. New backups go through `_run_backup_job` (streaming + async)
    via `_create_backup`. Kept identical to v2 spec so existing v2 backups remain
    restorable by `_restore_v2_blob`."""
    import base64
    from bson import json_util

    collection_payload: dict = {}
    collection_counts: dict = {}
    for name in await _app_collection_names():
        docs = await db[name].find({}).to_list(None)
        for d in docs:
            d.pop("_id", None)
        collection_payload[name] = docs
        collection_counts[name] = len(docs)

    files_payload: list = []
    file_fetch_errors: list = []
    file_records = await db.files.find({"is_deleted": {"$ne": True}}, {"_id": 0}).to_list(None) if "files" in collection_payload else []
    for rec in file_records:
        sp = rec.get("storage_path")
        if not sp:
            continue
        try:
            blob, ctype = get_object(sp)
            files_payload.append({
                "storage_path": sp,
                "content_type": ctype or rec.get("content_type") or "application/octet-stream",
                "size": len(blob),
                "data_b64": base64.b64encode(blob).decode("ascii"),
            })
        except Exception as exc:
            file_fetch_errors.append({"storage_path": sp, "error": str(exc)})
            logger.warning(f"Backup: failed to fetch file {sp}: {exc}")

    payload = {
        "version": 2,
        "created_at": now_iso(),
        "manifest": {
            "collection_doc_counts": collection_counts,
            "total_documents": sum(collection_counts.values()),
            "file_count": len(files_payload),
            "file_total_bytes": sum(f["size"] for f in files_payload),
            "file_fetch_errors": file_fetch_errors,
        },
        "collections": collection_payload,
        "files": files_payload,
    }
    raw = json_util.dumps(payload).encode("utf-8")
    return gzip.compress(raw)


# ---------- STREAMING BACKUP (v3) ----------
# Backup is written incrementally as a NEWLINE-DELIMITED JSON stream, gzipped
# in independent ~1MB plaintext blocks. Each gzip block is appended directly
# to the GridFS upload stream. Multiple concatenated gzip members are part of
# the gzip spec (RFC 1952) and are read transparently by gzip.GzipFile / gzip.open.
#
# Stream record types (one JSON object per line):
#   {"t":"header","version":3,"created_at":"..."}
#   {"t":"doc","c":"<collection_name>","d":<bson.json_util doc>}
#   {"t":"file","p":"<storage_path>","ct":"<content_type>","sz":N,"b":"<base64>"}
#   {"t":"manifest","collection_doc_counts":{...},"total_documents":N,
#                   "file_count":F,"file_total_bytes":B}
#
# Peak memory ~= (1 MB plaintext buffer) + (size of one uploaded file).

COLLECTION_BATCH = 500
GZIP_FLUSH_BYTES = 1 * 1024 * 1024  # flush every ~1MB plaintext to GridFS


class _StreamingGzipUploader:
    """Append-only stream that gzip-compresses plaintext bytes in 1MB blocks
    and writes each compressed block to a Motor GridFS upload stream. Bounded
    peak memory: one flush buffer at a time."""
    def __init__(self, upload_stream):
        self._upload = upload_stream
        self._buf = bytearray()
        self.compressed_bytes = 0

    async def write_line(self, payload: dict) -> None:
        from bson import json_util
        line = (json_util.dumps(payload) + "\n").encode("utf-8")
        self._buf.extend(line)
        if len(self._buf) >= GZIP_FLUSH_BYTES:
            await self._flush_block()

    async def _flush_block(self) -> None:
        if not self._buf:
            return
        block = gzip.compress(bytes(self._buf), compresslevel=6)
        await self._upload.write(block)
        self.compressed_bytes += len(block)
        self._buf = bytearray()

    async def close(self) -> None:
        await self._flush_block()


async def _run_backup_job(backup_id: str) -> None:
    """Background coroutine that produces a v3 streaming backup and updates the
    backup record's status from `in_progress` → `completed` (or `failed`)."""
    import base64
    from bson import json_util  # noqa: F401

    rec = await db.backups.find_one({"id": backup_id}, {"_id": 0})
    if not rec:
        return
    label = rec.get("label") or "Backup"
    kind = rec.get("kind") or "manual"

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    filename = f"makfinpay_backup_{ts}.json.gz"
    upload = _gfs().open_upload_stream(filename, metadata={"label": label, "kind": kind, "version": 3})
    writer = _StreamingGzipUploader(upload)

    collection_counts: dict = {}
    file_count = 0
    file_total_bytes = 0
    file_errors: list = []

    try:
        await writer.write_line({"t": "header", "version": 3, "created_at": now_iso()})

        # 1) Collections — cursor + per-doc streaming (no list materialisation).
        coll_names = await _app_collection_names()
        for name in coll_names:
            count = 0
            cursor = db[name].find({}).batch_size(COLLECTION_BATCH)
            async for d in cursor:
                d.pop("_id", None)
                await writer.write_line({"t": "doc", "c": name, "d": d})
                count += 1
            collection_counts[name] = count

        # 2) File binaries — one file at a time (bounded by single-file size).
        if "files" in coll_names:
            async for fr in db.files.find({"is_deleted": {"$ne": True}}, {"_id": 0}).batch_size(100):
                sp = fr.get("storage_path")
                if not sp:
                    continue
                try:
                    blob, ctype = get_object(sp)
                except Exception as exc:
                    file_errors.append({"storage_path": sp, "error": str(exc)})
                    logger.warning(f"Backup {backup_id}: file fetch failed {sp}: {exc}")
                    continue
                await writer.write_line({
                    "t": "file",
                    "p": sp,
                    "ct": ctype or fr.get("content_type") or "application/octet-stream",
                    "sz": len(blob),
                    "b": base64.b64encode(blob).decode("ascii"),
                })
                file_count += 1
                file_total_bytes += len(blob)
                # immediately free the in-memory blob
                del blob

        # 3) Manifest — always last line.
        manifest = {
            "collection_doc_counts": collection_counts,
            "total_documents": sum(collection_counts.values()),
            "file_count": file_count,
            "file_total_bytes": file_total_bytes,
            "file_fetch_errors": file_errors,
        }
        await writer.write_line({"t": "manifest", **manifest})

        await writer.close()
        await upload.close()

        await db.backups.update_one(
            {"id": backup_id},
            {"$set": {
                "status": "completed",
                "gridfs_id": str(upload._id),
                "filename": filename,
                "size_bytes": writer.compressed_bytes,
                "manifest": manifest,
                "completed_at": now_iso(),
                "error": None,
            }},
        )
        logger.info(
            f"Backup {backup_id} completed: {filename} "
            f"({writer.compressed_bytes} bytes, {sum(collection_counts.values())} docs, {file_count} files)"
        )
    except Exception as exc:
        # Clean up the partial GridFS artifact if any
        try:
            await upload.abort()
        except Exception:
            pass
        await db.backups.update_one(
            {"id": backup_id},
            {"$set": {"status": "failed", "error": str(exc), "completed_at": now_iso()}},
        )
        logger.error(f"Backup {backup_id} FAILED: {exc}")


async def _create_backup(label: str, kind: str, created_by: str) -> dict:
    """Returns a backup record in `in_progress` status IMMEDIATELY and spawns
    the actual streaming work as a background asyncio task. HTTP 202 semantics:
    callers do not block on the snapshot, so Cloudflare cannot time out."""
    rec = {
        "id": new_id(),
        "gridfs_id": None,
        "filename": None,
        "label": label,
        "kind": kind,           # "manual" | "automatic" | "pre-restore-safety"
        "size_bytes": 0,
        "status": "in_progress",
        "manifest": None,
        "error": None,
        "started_at": now_iso(),
        "completed_at": None,
        "created_at": now_iso(),
        "created_by": created_by,
        "version": 3,
    }
    await db.backups.insert_one(dict(rec))
    asyncio.create_task(_run_backup_job(rec["id"]))
    return clean(rec)


async def _restore_from_gz_bytes(blob: bytes) -> dict:
    """Version-aware restore. Supports v2 (single in-memory JSON blob) and v3
    (NDJSON streaming format). v3 spills via a temp file so peak RAM stays
    bounded by one batch + one file. Returns a verification report; the calling
    endpoint converts a mismatched/failed restore into HTTP 409 with details."""
    import base64
    import tempfile
    from bson import json_util

    # Sniff the format. v3's first decompressed line is a JSON header
    # `{"t":"header","version":3,...}`. v2 decompresses to a single big JSON object.
    head = b""
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(blob)) as gz:
            head = gz.read(64)
    except Exception as exc:
        raise HTTPException(400, f"Invalid backup file format: {exc}")
    is_v3 = head.startswith(b'{"t"') or head.startswith(b'{"t":"header"')

    if not is_v3:
        return await _restore_v2_blob(blob)

    # v3 streaming restore via temp file
    with tempfile.NamedTemporaryFile() as tf:
        tf.write(blob)
        tf.flush()
        tf.seek(0)
        return await _restore_v3_stream(tf.name)


async def _restore_v2_blob(blob: bytes) -> dict:
    """Legacy v2 restore — kept for backups created before the streaming rewrite."""
    import base64
    from bson import json_util

    try:
        raw = gzip.decompress(blob)
        payload = json_util.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(400, f"Invalid backup file format: {exc}")
    if not isinstance(payload, dict) or "collections" not in payload:
        raise HTTPException(400, "Invalid backup file format")

    manifest = payload.get("manifest") or {}
    expected_counts = manifest.get("collection_doc_counts") or {}
    expected_files = manifest.get("file_count")

    restored_counts: dict = {}
    for name, docs in (payload.get("collections") or {}).items():
        if name in BACKUP_EXCLUDED_COLLECTIONS or name.startswith("system."):
            continue
        if docs:
            for d in docs:
                d.pop("_id", None)
        await db[name].delete_many({})
        if docs:
            await db[name].insert_many(docs)
        restored_counts[name] = len(docs or [])

    file_errors: list = []
    files_restored = 0
    for f in payload.get("files") or []:
        try:
            data = base64.b64decode(f["data_b64"])
            put_object(f["storage_path"], data, f.get("content_type") or "application/octet-stream")
            files_restored += 1
        except Exception as exc:
            file_errors.append({"storage_path": f.get("storage_path"), "error": str(exc)})

    mismatches: list = []
    if expected_counts:
        for name, expected in expected_counts.items():
            got = restored_counts.get(name)
            if got is None or got != expected:
                mismatches.append({"collection": name, "expected": expected, "restored": got})
    if expected_files is not None and files_restored != expected_files:
        mismatches.append({"files": True, "expected": expected_files, "restored": files_restored})

    return {
        "version": payload.get("version", 1),
        "summary": restored_counts,
        "files_restored": files_restored,
        "file_errors": file_errors,
        "verified": len(mismatches) == 0 and len(file_errors) == 0,
        "mismatches": mismatches,
    }


async def _restore_v3_stream(path: str) -> dict:
    """Streaming v3 restore — reads NDJSON lines from a gzip file on disk,
    inserts collection docs in batches, and uploads files one at a time to
    object storage. Memory bounded by one batch + one file."""
    import base64
    from bson import json_util

    coll_buffers: dict = {}  # name -> list[doc] (flushes at COLLECTION_BATCH)
    cleared: set = set()     # collections whose contents have been delete_many'd
    restored_counts: dict = {}
    files_restored = 0
    file_errors: list = []
    manifest: dict = {}

    async def flush_buffer(name: str) -> None:
        buf = coll_buffers.get(name)
        if not buf:
            return
        await db[name].insert_many(buf)
        restored_counts[name] = restored_counts.get(name, 0) + len(buf)
        coll_buffers[name] = []

    with gzip.open(path, "rb") as gz:
        for raw_line in gz:
            if not raw_line.strip():
                continue
            rec = json_util.loads(raw_line.decode("utf-8"))
            t = rec.get("t")
            if t == "header":
                continue
            if t == "doc":
                name = rec["c"]
                if name in BACKUP_EXCLUDED_COLLECTIONS or name.startswith("system."):
                    continue
                if name not in cleared:
                    await db[name].delete_many({})
                    cleared.add(name)
                    restored_counts[name] = 0
                    coll_buffers[name] = []
                d = rec["d"]
                if isinstance(d, dict):
                    d.pop("_id", None)
                coll_buffers[name].append(d)
                if len(coll_buffers[name]) >= COLLECTION_BATCH:
                    await flush_buffer(name)
            elif t == "file":
                sp = rec.get("p")
                try:
                    data = base64.b64decode(rec["b"])
                    put_object(sp, data, rec.get("ct") or "application/octet-stream")
                    files_restored += 1
                except Exception as exc:
                    file_errors.append({"storage_path": sp, "error": str(exc)})
            elif t == "manifest":
                manifest = {k: v for k, v in rec.items() if k != "t"}

    # Drain any remaining buffered docs
    for name in list(coll_buffers.keys()):
        await flush_buffer(name)

    # Verification — pre-populate restored_counts with 0 for every collection the
    # manifest expects, so a collection that legitimately has 0 documents in the
    # backup (no 'doc' lines emitted) doesn't trigger a false-positive mismatch.
    expected_counts = (manifest or {}).get("collection_doc_counts") or {}
    for name in expected_counts:
        restored_counts.setdefault(name, 0)
        # Also clear any expected-zero collection that we never touched, so the
        # restored state matches the snapshot exactly.
        if expected_counts[name] == 0 and name not in cleared and name not in BACKUP_EXCLUDED_COLLECTIONS and not name.startswith("system."):
            await db[name].delete_many({})
    expected_files = (manifest or {}).get("file_count")
    mismatches: list = []
    for name, expected in expected_counts.items():
        got = restored_counts.get(name)
        if got is None or got != expected:
            mismatches.append({"collection": name, "expected": expected, "restored": got})
    if expected_files is not None and files_restored != expected_files:
        mismatches.append({"files": True, "expected": expected_files, "restored": files_restored})

    return {
        "version": 3,
        "summary": restored_counts,
        "files_restored": files_restored,
        "file_errors": file_errors,
        "verified": len(mismatches) == 0 and len(file_errors) == 0,
        "mismatches": mismatches,
    }


async def _create_backup_sync(label: str, kind: str, created_by: str) -> dict:
    """Synchronous (blocking) full-capture path. Retained for the existing
    safety-backup-before-restore step where we WANT to wait for completion
    before the restore proceeds, and for tests that need a finished backup
    inline. Uses the v2 in-memory dumper so the safety backup is fully
    materialised by the time this function returns."""
    blob = await _dump_db_to_gz_bytes()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    filename = f"makfinpay_backup_{ts}.json.gz"
    gridfs_id = await _gfs().upload_from_stream(filename, blob, metadata={"label": label, "kind": kind})
    doc = {
        "id": new_id(),
        "gridfs_id": str(gridfs_id),
        "filename": filename,
        "label": label,
        "kind": kind,
        "size_bytes": len(blob),
        "status": "completed",
        "manifest": None,
        "error": None,
        "started_at": now_iso(),
        "completed_at": now_iso(),
        "created_at": now_iso(),
        "created_by": created_by,
        "version": 2,
    }
    await db.backups.insert_one(dict(doc))
    return clean(doc)


async def _retention_cleanup() -> int:
    settings = await db.backup_settings.find_one({"id": "config"}, {"_id": 0}) or {}
    days = int(settings.get("retention_days") or DEFAULT_RETENTION_DAYS)
    if days <= 0:
        return 0  # "Forever"
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    deleted = 0
    async for b in db.backups.find({"kind": "automatic", "created_at": {"$lt": cutoff}}):
        try:
            await _gfs().delete(b["gridfs_id"] if isinstance(b["gridfs_id"], (bytes, bytearray)) else __import__("bson").ObjectId(b["gridfs_id"]))
        except Exception:
            pass
        await db.backups.delete_one({"id": b["id"]})
        deleted += 1
    return deleted


# --- scheduler ---
_scheduler: Optional[AsyncIOScheduler] = None


async def _daily_backup_job():
    settings = await db.backup_settings.find_one({"id": "config"}, {"_id": 0}) or {}
    if settings.get("enabled") is False:
        return
    # Daily job runs OUTSIDE the HTTP request — no Cloudflare timeout to worry
    # about. Use the same streaming pipeline, but await it inline so retention
    # cleanup runs only after a successful completion.
    rec = {
        "id": new_id(), "gridfs_id": None, "filename": None,
        "label": "Daily Backup", "kind": "automatic",
        "size_bytes": 0, "status": "in_progress", "manifest": None, "error": None,
        "started_at": now_iso(), "completed_at": None,
        "created_at": now_iso(), "created_by": "system", "version": 3,
    }
    await db.backups.insert_one(dict(rec))
    try:
        await _run_backup_job(rec["id"])
        await _retention_cleanup()
        logger.info("Daily backup created and retention cleanup ran")
    except Exception as exc:
        logger.error(f"Daily backup failed: {exc}")


async def _daily_t1_settlement_job():
    logger.info("Starting daily T+1 wallet settlement job...")
    wallets = await db.wallets.find({"t1_balance": {"$gt": 0}}).to_list(10000)
    logger.info(f"Found {len(wallets)} wallets with pending T+1 balance")
    for w in wallets:
        t1_bal = float(w.get("t1_balance") or 0.0)
        if t1_bal <= 0:
            continue
        try:
            user_id = w["user_id"]
            res = await db.wallets.update_one(
                {"user_id": user_id, "t1_balance": w["t1_balance"]},
                {"$inc": {"balance": t1_bal, "t1_balance": -t1_bal}, "$set": {"updated_at": now_iso()}}
            )
            if res.modified_count > 0:
                w_after = await db.wallets.find_one({"user_id": user_id})
                new_main_balance = float(w_after.get("balance", 0.0))
                await ledger_entry(
                    user_id=user_id,
                    kind="credit",
                    amount=t1_bal,
                    balance_after=new_main_balance,
                    ref_type="t1_settlement",
                    ref_id=w["id"],
                    note=f"T+1 settlement credited to wallet: ₹{t1_bal:,.2f}"
                )
                logger.info(f"Successfully settled T+1 balance of ₹{t1_bal} for user {user_id}")
        except Exception as e:
            logger.error(f"Error settling T+1 balance for wallet {w.get('id')}: {str(e)}")


def _ensure_backup_scheduler():
    global _scheduler
    if _scheduler:
        return
    _scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    _scheduler.add_job(_daily_backup_job, CronTrigger(hour=0, minute=0), id="daily_backup", replace_existing=True)
    _scheduler.add_job(_daily_t1_settlement_job, CronTrigger(hour=11, minute=30), id="daily_t1_settlement", replace_existing=True)
    _scheduler.start()
    logger.info("Backup and T+1 settlement schedulers started (Daily settlement at 11:30 AM Asia/Kolkata)")


async def _ensure_backup_settings():
    if not await db.backup_settings.find_one({"id": "config"}):
        await db.backup_settings.insert_one({
            "id": "config", "enabled": True,
            "retention_days": DEFAULT_RETENTION_DAYS, "updated_at": now_iso(),
        })


def _require_super_admin(user: dict):
    email = user.get("email", "").lower()
    allowed_admins = [ADMIN_EMAIL.lower(), "jigs.vanani@gmail.com"]
    if email not in allowed_admins and user.get("role") != "admin":
        raise HTTPException(403, "Only the Admin can manage backups")


# --- request models ---
class BackupCreateIn(BaseModel):
    label: Optional[str] = None


class BackupSettingsIn(BaseModel):
    enabled: bool
    retention_days: int  # 7, 14, 30, 60, or 0 for "Forever"


class BackupRestoreIn(BaseModel):
    confirm: str


# --- endpoints ---
@api.get("/admin/backups")
async def list_backups(user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    items = await db.backups.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    creator_ids = list({b["created_by"] for b in items if b.get("created_by") and b["created_by"] != "system"})
    name_map = {}
    if creator_ids:
        async for u in db.users.find({"id": {"$in": creator_ids}}, {"_id": 0, "id": 1, "full_name": 1}):
            name_map[u["id"]] = u.get("full_name", "")
    for b in items:
        b["created_by_name"] = "System" if b.get("created_by") == "system" else name_map.get(b.get("created_by"), "Admin")
    return items


@api.get("/admin/backups/settings")
async def get_backup_settings(user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    await _ensure_backup_settings()
    s = await db.backup_settings.find_one({"id": "config"}, {"_id": 0})
    last = await db.backups.find_one({"kind": "automatic"}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
    # Next 00:00 IST after now
    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist)
    next_run = (now_ist.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()
    return {**s, "last_automatic_at": last["created_at"] if last else None, "next_scheduled_at": next_run}


@api.put("/admin/backups/settings")
async def update_backup_settings(body: BackupSettingsIn, request: Request, user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    if body.retention_days not in (0, 7, 14, 30, 60):
        raise HTTPException(400, "retention_days must be 0, 7, 14, 30, or 60")
    await db.backup_settings.update_one(
        {"id": "config"},
        {"$set": {"enabled": body.enabled, "retention_days": body.retention_days, "updated_at": now_iso()}},
        upsert=True,
    )
    await write_audit(user["id"], "backup_settings_updated", meta=body.model_dump(), request=request)
    return {"ok": True}


# ---------- BACKGROUND RESTORE JOB ----------
async def _run_restore_job(backup_id: str, source: str, raw_blob: Optional[bytes],
                            user_id: str, original_filename: Optional[str] = None) -> None:
    """Background coroutine that creates the safety backup, runs the streaming
    restore, then writes the result back to db.backups[{id: backup_id}] under
    restore_status / restore_result / restore_error / restore_safety_backup_id."""
    from bson import ObjectId
    safety_rec = {
        "id": new_id(), "gridfs_id": None, "filename": None,
        "label": f"Pre-restore safety ({source})",
        "kind": "pre-restore-safety",
        "size_bytes": 0, "status": "in_progress", "manifest": None, "error": None,
        "started_at": now_iso(), "completed_at": None,
        "created_at": now_iso(), "created_by": user_id, "version": 3,
    }
    await db.backups.insert_one(dict(safety_rec))
    # 1) Safety backup — same streaming pipeline, awaited inline.
    try:
        await _run_backup_job(safety_rec["id"])
    except Exception as exc:
        await db.backups.update_one({"id": backup_id}, {"$set": {
            "restore_status": "failed",
            "restore_error": f"Safety backup failed: {exc}",
            "restore_completed_at": now_iso(),
            "restore_safety_backup_id": safety_rec["id"],
        }})
        return

    # 2) Run the restore.
    try:
        if raw_blob is None:
            # source == backup_id from history
            b = await db.backups.find_one({"id": backup_id}, {"_id": 0})
            stream = await _gfs().open_download_stream(ObjectId(b["gridfs_id"]))
            raw_blob = await stream.read()
        result = await _restore_from_gz_bytes(raw_blob)
    except Exception as exc:
        await db.backups.update_one({"id": backup_id}, {"$set": {
            "restore_status": "failed",
            "restore_error": str(exc),
            "restore_completed_at": now_iso(),
            "restore_safety_backup_id": safety_rec["id"],
        }})
        return

    await db.backups.update_one({"id": backup_id}, {"$set": {
        "restore_status": "completed" if result.get("verified") else "failed",
        "restore_error": None if result.get("verified") else f"Verification FAILED. "
            f"Mismatches: {result.get('mismatches')}. File errors: {result.get('file_errors')}",
        "restore_completed_at": now_iso(),
        "restore_safety_backup_id": safety_rec["id"],
        "restore_result": result,
    }})


@api.post("/admin/backups")
async def create_manual_backup(body: BackupCreateIn, request: Request, user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    label = (body.label or "").strip() or "Manual Backup"
    doc = await _create_backup(label, "manual", user["id"])  # returns in_progress + spawns task
    await write_audit(user["id"], "backup_created", target=doc["id"], meta={"label": label, "kind": "manual"}, request=request)
    return Response(
        content=_json.dumps(doc),
        status_code=202,
        media_type="application/json",
    )


@api.get("/admin/backups/{bid}/status")
async def get_backup_status(bid: str, user=Depends(require_roles("admin"))):
    """Lightweight status endpoint for frontend polling."""
    _require_super_admin(user)
    b = await db.backups.find_one(
        {"id": bid},
        {"_id": 0, "id": 1, "status": 1, "error": 1, "size_bytes": 1,
         "manifest": 1, "completed_at": 1,
         "restore_status": 1, "restore_error": 1, "restore_safety_backup_id": 1,
         "restore_completed_at": 1, "restore_result": 1},
    )
    if not b:
        raise HTTPException(404, "Backup not found")
    return b


@api.get("/admin/backups/{bid}/download")
async def download_backup(bid: str, user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    b = await db.backups.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Backup not found")
    if b.get("status") != "completed":
        raise HTTPException(409, f"Backup is not ready (status: {b.get('status')})")
    from bson import ObjectId
    stream = await _gfs().open_download_stream(ObjectId(b["gridfs_id"]))
    # Stream the GridFS bytes directly through Starlette's StreamingResponse
    # so we never load the whole backup into Python memory at download time.
    from starlette.responses import StreamingResponse

    async def gridfs_iter():
        async for chunk in stream:
            yield chunk

    await write_audit(user["id"], "backup_downloaded", target=bid)
    return StreamingResponse(
        gridfs_iter(),
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{b["filename"]}"'},
    )


@api.post("/admin/backups/{bid}/restore")
async def restore_backup(bid: str, body: BackupRestoreIn, request: Request, user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    if body.confirm != "RESTORE":
        raise HTTPException(400, "Type RESTORE (uppercase) to confirm")
    b = await db.backups.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Backup not found")
    if b.get("status") != "completed":
        raise HTTPException(409, f"Backup is not ready to restore (status: {b.get('status')})")
    if b.get("restore_status") == "in_progress":
        raise HTTPException(409, "A restore is already in progress for this backup")

    # Mark restore as in_progress and kick off the background job.
    await db.backups.update_one({"id": bid}, {"$set": {
        "restore_status": "in_progress",
        "restore_started_at": now_iso(),
        "restore_completed_at": None,
        "restore_error": None,
        "restore_safety_backup_id": None,
        "restore_result": None,
    }})
    asyncio.create_task(_run_restore_job(bid, b.get("filename") or bid, None, user["id"]))
    await write_audit(user["id"], "backup_restore_started", target=bid, request=request)

    return Response(
        content=_json.dumps({"ok": True, "status": "in_progress", "backup_id": bid}),
        status_code=202,
        media_type="application/json",
    )


@api.post("/admin/backups/restore-upload")
async def restore_from_upload(request: Request, file: UploadFile = File(...),
                              confirm: str = Form(...),
                              user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    if confirm != "RESTORE":
        raise HTTPException(400, "Type RESTORE (uppercase) to confirm")
    blob = await file.read()
    if file.filename.endswith(".json") and not blob[:2] == b"\x1f\x8b":
        blob = gzip.compress(blob)

    # Park the uploaded blob in a synthetic backup record so the same async
    # restore pipeline applies. The record is marked status="completed" with
    # a gridfs_id pointing at the uploaded bundle so subsequent UI polling on
    # `restore_status` works identically to history-based restores.
    from bson import ObjectId  # noqa: F401
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    fname = f"makfinpay_uploaded_{ts}.json.gz"
    gridfs_id = await _gfs().upload_from_stream(fname, blob, metadata={"label": file.filename, "kind": "upload"})
    rec = {
        "id": new_id(),
        "gridfs_id": str(gridfs_id),
        "filename": fname,
        "label": file.filename or "Uploaded restore",
        "kind": "upload",
        "size_bytes": len(blob),
        "status": "completed",
        "manifest": None,
        "error": None,
        "started_at": now_iso(),
        "completed_at": now_iso(),
        "created_at": now_iso(),
        "created_by": user["id"],
        "version": 2,
        "restore_status": "in_progress",
        "restore_started_at": now_iso(),
    }
    await db.backups.insert_one(dict(rec))
    asyncio.create_task(_run_restore_job(rec["id"], file.filename or "upload", blob, user["id"]))
    await write_audit(user["id"], "backup_restore_started", target=rec["id"],
                      meta={"filename": file.filename}, request=request)
    return Response(
        content=_json.dumps({"ok": True, "status": "in_progress", "backup_id": rec["id"]}),
        status_code=202,
        media_type="application/json",
    )


@api.delete("/admin/backups/{bid}")
async def delete_backup(bid: str, request: Request, user=Depends(require_roles("admin"))):
    _require_super_admin(user)
    b = await db.backups.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Backup not found")
    if b.get("status") == "in_progress" or b.get("restore_status") == "in_progress":
        raise HTTPException(409, "Backup is in progress and cannot be deleted")
    # Never delete the only remaining backup
    total = await db.backups.count_documents({})
    if total <= 1:
        raise HTTPException(400, "Cannot delete the only remaining backup")
    from bson import ObjectId
    try:
        await _gfs().delete(ObjectId(b["gridfs_id"]))
    except Exception:
        pass
    await db.backups.delete_one({"id": bid})
    await write_audit(user["id"], "backup_deleted", target=bid, request=request)
    return {"ok": True}


# ---------- HEADLINES / ANNOUNCEMENTS ----------
@api.get("/admin/headlines")
async def admin_get_headlines(user=Depends(require_roles("admin"))):
    return await db.headlines.find({"is_deleted": False}).sort([("position", 1), ("created_at", -1)]).to_list(1000)

@api.post("/admin/headlines")
async def admin_create_headline(body: HeadlineIn, request: Request, user=Depends(require_roles("admin"))):
    # Get current max position to place new headline at the end
    max_h = await db.headlines.find({"is_deleted": False}).sort("position", -1).to_list(1)
    new_pos = (max_h[0].get("position", 0) + 1) if max_h else 0
    h = {
        "id": new_id(),
        "message": body.message.strip(),
        "type": body.type or "text",
        "active": True,
        "position": new_pos,
        "is_deleted": False,
        "created_at": now_iso()
    }
    await db.headlines.insert_one(h)
    await write_audit(user["id"], "headline_created", target=h["id"], meta={"message": h["message"], "type": h["type"]}, request=request)
    return h

@api.put("/admin/headlines/{hid}/toggle")
async def admin_toggle_headline(hid: str, request: Request, user=Depends(require_roles("admin"))):
    h = await db.headlines.find_one({"id": hid, "is_deleted": False})
    if not h:
        raise HTTPException(404, "Headline not found")
    new_active = not h.get("active", True)
    await db.headlines.update_one({"id": hid}, {"$set": {"active": new_active}})
    await write_audit(user["id"], "headline_toggled", target=hid, meta={"active": new_active}, request=request)
    return {"id": hid, "active": new_active}

@api.put("/admin/headlines/reorder")
async def admin_reorder_headlines(body: HeadlineReorderIn, request: Request, user=Depends(require_roles("admin"))):
    for idx, hid in enumerate(body.ids):
        await db.headlines.update_one({"id": hid}, {"$set": {"position": idx}})
    await write_audit(user["id"], "headlines_reordered", target="headlines", meta={"ids": body.ids}, request=request)
    return {"ok": True}

@api.delete("/admin/headlines/{hid}")
async def admin_delete_headline(hid: str, request: Request, user=Depends(require_roles("admin"))):
    h = await db.headlines.find_one({"id": hid, "is_deleted": False})
    if not h:
        raise HTTPException(404, "Headline not found")
    await db.headlines.update_one({"id": hid}, {"$set": {"is_deleted": True}})
    await write_audit(user["id"], "headline_deleted", target=hid, request=request)
    return {"ok": True}

@api.get("/headlines/active")
async def get_active_headlines(user=Depends(get_current_user)):
    items = await db.headlines.find({"is_deleted": False, "active": True}).sort([("position", 1), ("created_at", -1)]).to_list(100)
    return [{"message": i["message"], "type": i.get("type", "text")} for i in items if i.get("message")]

# ---------- REJECTION CATEGORIES & REASONS ----------
@api.get("/admin/rejection-categories")
async def admin_list_rejection_categories(user=Depends(require_roles("admin"))):
    categories = await db.rejection_categories.find({"is_deleted": False}).sort("created_at", -1).to_list(100)
    if not categories:
        return []
    cat_ids = [c["id"] for c in categories]
    all_reasons = await db.rejection_reasons.find({"category_id": {"$in": cat_ids}, "is_deleted": False}).sort("created_at", 1).to_list(1000)
    reasons_by_cat = {}
    for r in all_reasons:
        cid = r.get("category_id")
        if cid:
            reasons_by_cat.setdefault(cid, []).append(r)
    for cat in categories:
        cat["reasons"] = reasons_by_cat.get(cat["id"], [])
    return categories

@api.post("/admin/rejection-categories")
async def admin_create_rejection_category(body: RejectionCategoryIn, user=Depends(require_roles("admin"))):
    doc = {
        "id": new_id(),
        "name": body.name.strip(),
        "show_bill": body.show_bill,
        "show_qr": body.show_qr,
        "show_kyc": body.show_kyc,
        "show_withdrawal": getattr(body, "show_withdrawal", False) or False,
        "is_deleted": False,
        "created_at": now_iso()
    }
    await db.rejection_categories.insert_one(dict(doc))
    doc["reasons"] = []
    return clean(doc)

@api.put("/admin/rejection-categories/{cid}")
async def admin_update_rejection_category(cid: str, body: RejectionCategoryIn, user=Depends(require_roles("admin"))):
    await db.rejection_categories.update_one({"id": cid}, {"$set": {
        "name": body.name.strip(),
        "show_bill": body.show_bill,
        "show_qr": body.show_qr,
        "show_kyc": body.show_kyc,
        "show_withdrawal": getattr(body, "show_withdrawal", False) or False
    }})
    return {"ok": True}

@api.delete("/admin/rejection-categories/{cid}")
async def admin_delete_rejection_category(cid: str, user=Depends(require_roles("admin"))):
    await db.rejection_categories.update_one({"id": cid}, {"$set": {"is_deleted": True}})
    await db.rejection_reasons.update_many({"category_id": cid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@api.post("/admin/rejection-reasons")
async def admin_create_rejection_reason(body: RejectionReasonIn, user=Depends(require_roles("admin"))):
    doc = {
        "id": new_id(),
        "category_id": body.category_id,
        "reason_text": body.reason_text.strip(),
        "active": True,
        "is_deleted": False,
        "created_at": now_iso()
    }
    await db.rejection_reasons.insert_one(dict(doc))
    return clean(doc)

@api.put("/admin/rejection-reasons/{rid}")
async def admin_update_rejection_reason(rid: str, body: RejectionReasonUpdateIn, user=Depends(require_roles("admin"))):
    await db.rejection_reasons.update_one({"id": rid}, {"$set": {
        "reason_text": body.reason_text.strip()
    }})
    return {"ok": True}

@api.put("/admin/rejection-reasons/{rid}/toggle")
async def admin_toggle_rejection_reason(rid: str, user=Depends(require_roles("admin"))):
    r = await db.rejection_reasons.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Reason not found")
    new_active = not r.get("active", True)
    await db.rejection_reasons.update_one({"id": rid}, {"$set": {"active": new_active}})
    return {"active": new_active}

@api.delete("/admin/rejection-reasons/{rid}")
async def admin_delete_rejection_reason(rid: str, user=Depends(require_roles("admin"))):
    await db.rejection_reasons.update_one({"id": rid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@api.get("/rejection-reasons/active")
async def get_active_rejection_reasons(target: str, user=Depends(get_current_user)):
    query = {"is_deleted": False}
    if target == "bill":
        query["show_bill"] = True
    elif target == "qr":
        query["show_qr"] = True
    elif target == "kyc":
        query["show_kyc"] = True
    elif target == "withdrawal":
        query["show_withdrawal"] = True
    else:
        return []
        
    categories = await db.rejection_categories.find(query).to_list(100)
    cat_ids = [c["id"] for c in categories]
    if not cat_ids:
        return []
        
    reasons = await db.rejection_reasons.find({
        "category_id": {"$in": cat_ids},
        "active": True,
        "is_deleted": False
    }).sort("created_at", 1).to_list(500)
    
    return [r["reason_text"] for r in reasons]

# ---------- POLICIES & RULES ----------
@api.get("/admin/policies")
async def admin_list_policies(user=Depends(require_roles("admin"))):
    return await db.policies.find({"is_deleted": False}).sort("created_at", -1).to_list(100)

@api.post("/admin/policies")
async def admin_create_policy(body: PolicyIn, user=Depends(require_roles("admin"))):
    doc = {
        "id": new_id(),
        "title": body.title.strip(),
        "content": body.content.strip(),
        "active": True,
        "is_deleted": False,
        "created_at": now_iso()
    }
    await db.policies.insert_one(dict(doc))
    return clean(doc)

@api.put("/admin/policies/{pid}")
async def admin_update_policy(pid: str, body: PolicyIn, user=Depends(require_roles("admin"))):
    await db.policies.update_one({"id": pid}, {"$set": {
        "title": body.title.strip(),
        "content": body.content.strip()
    }})
    return {"ok": True}

@api.delete("/admin/policies/{pid}")
async def admin_delete_policy(pid: str, user=Depends(require_roles("admin"))):
    await db.policies.update_one({"id": pid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@api.get("/policies/active")
async def get_active_policies(user=Depends(get_current_user)):
    return await db.policies.find({"is_deleted": False, "active": True}).sort("created_at", 1).to_list(100)


app.include_router(api)

_cors_origins_env = os.environ.get("CORS_ORIGINS", "*").strip()
CORS_ORIGINS = ["*"] if _cors_origins_env == "*" else [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
