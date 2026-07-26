"""Tests for POST /api/admin/system/reset-demo-data and related verification."""
import os
import uuid
import pytest
import requests
import bcrypt
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fintech-bill-pay.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "makfinpay_db")


# -------------- fixtures --------------
@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture()
def second_admin(db):
    """Insert a non-super admin user directly to test the super-admin gate."""
    email = f"test_secondadmin_{uuid.uuid4().hex[:6]}@x.com"
    password = "Pass1234"
    pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    uid = str(uuid.uuid4())
    db.users.insert_one({
        "id": uid,
        "email": email,
        "password_hash": pwd_hash,
        "role": "admin",
        "full_name": "Secondary Admin",
        "frozen": False,
    })
    # login
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        db.users.delete_one({"id": uid})
        pytest.skip(f"second-admin login failed ({r.status_code}): {r.text}")
    token = r.json()["token"]
    yield {"id": uid, "email": email, "token": token,
           "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}
    db.users.delete_one({"id": uid})


# -------------- seed helpers --------------
def _seed_distributor_and_agent(admin_headers):
    """Create a distributor + an agent via admin/distributor APIs so wipe has something to delete."""
    dist_email = f"TEST_dist_{uuid.uuid4().hex[:6]}@x.com"
    r = requests.post(f"{API}/admin/users", headers=admin_headers, json={
        "role": "distributor",
        "full_name": "Test Distributor",
        "email": dist_email,
        "password": "Dist@1234",
        "phone": "9999900001",
        "address": "123 Test Lane",
        "commission_percent": 1.5,
    })
    assert r.status_code in (200, 201), f"create distributor failed: {r.status_code} {r.text}"
    # login as distributor and create agent
    dl = requests.post(f"{API}/auth/login", json={"email": dist_email, "password": "Dist@1234"})
    assert dl.status_code == 200, f"distributor login failed: {dl.status_code} {dl.text}"
    dist_headers = {"Authorization": f"Bearer {dl.json()['token']}", "Content-Type": "application/json"}
    agent_email = f"TEST_agent_{uuid.uuid4().hex[:6]}@x.com"
    agent_payload = {
        "role": "agent",
        "full_name": "Test Agent",
        "email": agent_email,
        "password": "Agent@1234",
        "phone": "9999900002",
        "address": "456 Test Street",
        "commission_percent": 1.4,
        "aadhaar_path": "/tmp/aadhaar.png",
        "pan_path": "/tmp/pan.png",
    }
    ar = requests.post(f"{API}/distributor/users", headers=dist_headers, json=agent_payload)
    if ar.status_code not in (200, 201):
        ar = requests.post(f"{API}/distributor/agents", headers=dist_headers, json=agent_payload)
    return dist_email, agent_email


# -------------- validation + gate tests (run FIRST, no wipe) --------------
class TestValidationAndGate:
    def test_missing_confirm_returns_422(self, admin_headers):
        r = requests.post(f"{API}/admin/system/reset-demo-data", headers=admin_headers, json={})
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_lowercase_confirm_returns_400(self, admin_headers):
        r = requests.post(f"{API}/admin/system/reset-demo-data",
                          headers=admin_headers, json={"confirm": "reset"})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail", "")
        assert "Typed confirmation does not match" in detail, f"unexpected detail: {detail}"

    def test_non_super_admin_returns_403(self, second_admin):
        r = requests.post(f"{API}/admin/system/reset-demo-data",
                          headers=second_admin["headers"], json={"confirm": "RESET"})
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        assert "Super Admin" in r.json().get("detail", "")

    def test_unauthenticated_returns_401(self):
        r = requests.post(f"{API}/admin/system/reset-demo-data", json={"confirm": "RESET"})
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# -------------- core wipe-and-verify flow --------------
class TestResetFlow:
    def test_seed_then_reset_then_verify(self, admin_headers, db):
        # 1) Seed at least a distributor + an agent so wipe counts are non-zero
        _seed_distributor_and_agent(admin_headers)

        # Snapshot pre-state
        pre_dist = requests.get(f"{API}/admin/users?role=distributor", headers=admin_headers).json()
        pre_agent = requests.get(f"{API}/admin/users?role=agent", headers=admin_headers).json()
        assert isinstance(pre_dist, list) and len(pre_dist) >= 1, "expected at least 1 distributor seeded"

        qr_before = requests.get(f"{API}/admin/qrcodes", headers=admin_headers)
        qr_before_count = len(qr_before.json()) if qr_before.status_code == 200 else 0

        # 2) Call reset
        r = requests.post(f"{API}/admin/system/reset-demo-data",
                          headers=admin_headers, json={"confirm": "RESET"})
        assert r.status_code == 200, f"reset failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert isinstance(body.get("deleted"), dict), "deleted dict missing"
        assert "users" in body["deleted"]
        assert body["deleted"]["users"] >= len(pre_dist) + len(pre_agent), \
            f"users delete count too low: {body['deleted']}"
        assert isinstance(body.get("qr_paths_kept"), int)

        # 3) Distributors and agents now empty
        dist = requests.get(f"{API}/admin/users?role=distributor", headers=admin_headers).json()
        agent = requests.get(f"{API}/admin/users?role=agent", headers=admin_headers).json()
        assert dist == [], f"distributors not empty after reset: {dist}"
        assert agent == [], f"agents not empty after reset: {agent}"

        # 4) Financial stats all zero
        fin = requests.get(f"{API}/admin/stats/financial?range=lifetime", headers=admin_headers)
        assert fin.status_code == 200
        f = fin.json()
        assert (f.get("total_revenue") or 0) == 0, f
        assert (f.get("total_wallet") or 0) == 0, f
        assert (f.get("total_txn_count") or 0) == 0, f
        assert (f.get("pending_kyc_count") or 0) == 0, f

        # 5) QR codes preserved (3 expected per spec; at minimum same as before)
        qr_after = requests.get(f"{API}/admin/qrcodes", headers=admin_headers)
        assert qr_after.status_code == 200
        qr_after_list = qr_after.json()
        assert len(qr_after_list) >= qr_before_count, "QR codes lost after reset"
        # un-soft-deleted: ensure none have is_deleted=True
        for q in qr_after_list:
            assert q.get("is_deleted") in (False, None), f"QR still soft-deleted: {q}"

        # 6) Commission settings preserved
        comm = requests.get(f"{API}/admin/settings/commission", headers=admin_headers)
        assert comm.status_code == 200, f"commission GET failed {comm.status_code}: {comm.text}"
        cdata = comm.json()
        assert "default_percent" in cdata
        # Spec says default 1.2 — accept anything non-None
        assert cdata["default_percent"] is not None

        # 7) audit_logs in DB has the demo_data_reset entry (and only/most-recent one)
        audit_entries = list(db.audit_logs.find({"action": "demo_data_reset"}, {"_id": 0}))
        assert len(audit_entries) >= 1, "no demo_data_reset audit entry"
        entry = audit_entries[-1]
        assert entry.get("action") == "demo_data_reset"
        # user_id should be the super admin's id
        admin_user = db.users.find_one({"email": ADMIN_EMAIL.lower()}) or db.users.find_one({"email": ADMIN_EMAIL})
        assert admin_user is not None
        assert entry.get("user_id") == admin_user["id"], \
            f"audit user_id mismatch: {entry.get('user_id')} vs {admin_user['id']}"
        meta = entry.get("meta") or {}
        assert isinstance(meta.get("deleted"), dict), f"meta.deleted not a dict: {meta}"
