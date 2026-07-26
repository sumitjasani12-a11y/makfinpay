"""
Iteration 16 backend regression tests.

Bug: Withdrawal must require ALL bank fields complete (incl. Phone Number) — even
for LEGACY users. Previously the withdrawal endpoint only checked for a bank_details
record's existence, letting legacy users (saved before phone_number was added in
iter 15) withdraw with an incomplete record.

Covers:
  1. GET /api/bank returns is_complete + missing_fields
  2. POST /api/bank rejects empty fields (per-field 400 messages)
  3. POST /api/withdrawals rejects when legacy record missing phone_number
  4. POST /api/withdrawals succeeds when all 5 fields present
  5. Legacy data safety — untouched raw fields preserved on GET /api/bank
"""
import os
import time
import uuid
import base64
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "makfinpay_db")


# ---------- Direct DB helper (only for creating legacy bank docs) ----------
@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ---------- Auth helpers ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _upload_dummy(token):
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )
    files = {"file": ("dummy.png", png, "image/png")}
    r = requests.post(f"{API}/uploads", files=files, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return r.json()["path"]


@pytest.fixture(scope="session")
def distributor(admin_token):
    """Fresh distributor for these tests (auto-KYC-approved)."""
    email = f"TEST_distv16_{uuid.uuid4().hex[:8]}@x.com"
    body = {
        "role": "distributor", "full_name": "V16 Dist",
        "email": email, "password": "TestPass@123",
        "phone": "9000000101", "address": "Addr",
    }
    r = requests.post(f"{API}/admin/users", json=body, headers=_hdr(admin_token))
    assert r.status_code == 200, r.text
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"})
    assert l.status_code == 200, l.text
    return {"token": l.json()["token"], "id": l.json()["user"]["id"], "email": email}


@pytest.fixture(scope="session")
def distributor2(admin_token):
    """Second distributor for legacy-doc simulation (isolated from other tests)."""
    email = f"TEST_distv16_legacy_{uuid.uuid4().hex[:8]}@x.com"
    body = {
        "role": "distributor", "full_name": "V16 Legacy Dist",
        "email": email, "password": "TestPass@123",
        "phone": "9000000102", "address": "Addr",
    }
    r = requests.post(f"{API}/admin/users", json=body, headers=_hdr(admin_token))
    assert r.status_code == 200, r.text
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"})
    assert l.status_code == 200, l.text
    return {"token": l.json()["token"], "id": l.json()["user"]["id"], "email": email}


# =========================================================
# 1. GET /api/bank shape — no bank yet
# =========================================================
class TestGetBankShape:
    def test_no_bank_returns_all_missing(self, distributor):
        # Ensure no bank record — use a completely fresh user
        r = requests.get(f"{API}/bank", headers=_hdr(distributor["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["is_complete"] is False
        # All 5 keys should be present in missing_fields
        expected = {"account_holder", "account_number", "ifsc", "bank_name", "phone_number"}
        assert set(data["missing_fields"]) == expected, f"Got: {data['missing_fields']}"

    def test_complete_record_returns_is_complete_true(self, distributor):
        # Save all 5 fields
        payload = {
            "account_holder": "Full User", "account_number": "12345",
            "ifsc": "HDFC0001", "bank_name": "HDFC", "phone_number": "9876543210",
        }
        s = requests.post(f"{API}/bank", json=payload, headers=_hdr(distributor["token"]))
        assert s.status_code == 200, s.text
        g = requests.get(f"{API}/bank", headers=_hdr(distributor["token"]))
        assert g.status_code == 200
        data = g.json()
        assert data["is_complete"] is True
        assert data["missing_fields"] == []
        # Also verify raw fields are echoed
        for k in ("account_holder", "account_number", "ifsc", "bank_name", "phone_number"):
            assert data[k] == payload[k]


# =========================================================
# 2. POST /api/bank — per-field validation
# =========================================================
class TestBankSavePerFieldValidation:
    """POST /api/bank must reject empty fields (after trimming) with specific messages."""

    @pytest.mark.parametrize("field,expected_msg", [
        ("account_holder", "Account Holder is required"),
        ("account_number", "Account Number is required"),
        ("ifsc", "Ifsc is required"),  # server does .replace('_',' ').title() -> "Ifsc"
        ("bank_name", "Bank Name is required"),
    ])
    def test_empty_string_rejected(self, distributor, field, expected_msg):
        payload = {
            "account_holder": "X", "account_number": "1", "ifsc": "IF",
            "bank_name": "B", "phone_number": "9876543210",
        }
        payload[field] = ""
        r = requests.post(f"{API}/bank", json=payload, headers=_hdr(distributor["token"]))
        assert r.status_code == 400, f"Expected 400 for empty {field}, got {r.status_code}: {r.text}"
        assert expected_msg in r.text, f"Expected '{expected_msg}' in response, got: {r.text}"

    @pytest.mark.parametrize("field", ["account_holder", "account_number", "ifsc", "bank_name"])
    def test_whitespace_only_rejected(self, distributor, field):
        payload = {
            "account_holder": "X", "account_number": "1", "ifsc": "IF",
            "bank_name": "B", "phone_number": "9876543210",
        }
        payload[field] = "   "
        r = requests.post(f"{API}/bank", json=payload, headers=_hdr(distributor["token"]))
        assert r.status_code == 400, f"Expected 400 for whitespace {field}, got {r.status_code}"
        assert "is required" in r.text

    def test_empty_phone_returns_400(self, distributor):
        payload = {
            "account_holder": "X", "account_number": "1", "ifsc": "IF",
            "bank_name": "B", "phone_number": "",
        }
        r = requests.post(f"{API}/bank", json=payload, headers=_hdr(distributor["token"]))
        assert r.status_code == 400, r.text
        assert "Phone Number must be exactly 10 digits" in r.text

    def test_missing_phone_key_returns_422(self, distributor):
        """Omitting phone_number entirely triggers Pydantic validation (422)."""
        payload = {
            "account_holder": "X", "account_number": "1", "ifsc": "IF",
            "bank_name": "B",
        }
        r = requests.post(f"{API}/bank", json=payload, headers=_hdr(distributor["token"]))
        assert r.status_code == 422, f"Expected 422 pydantic, got {r.status_code}: {r.text}"


# =========================================================
# 3. LEGACY BANK RECORD — the reported bug
# =========================================================
class TestLegacyBankBlocksWithdrawal:
    """This is the actual reported bug: a legacy record (missing phone_number)
    must block withdrawal with the specific new error message."""

    def test_legacy_record_missing_phone_blocks_withdrawal(self, distributor2, mongo_db):
        # Step 1: Save a full record via API to create the doc
        full = {
            "account_holder": "Legacy H", "account_number": "8888",
            "ifsc": "LEGY0001", "bank_name": "Legacy Bank", "phone_number": "9876543210",
        }
        s = requests.post(f"{API}/bank", json=full, headers=_hdr(distributor2["token"]))
        assert s.status_code == 200, s.text

        # Step 2: SIMULATE LEGACY: directly unset phone_number in MongoDB
        result = mongo_db.bank_details.update_one(
            {"user_id": distributor2["id"]},
            {"$unset": {"phone_number": ""}}
        )
        assert result.modified_count == 1, "Failed to unset phone_number in DB"

        # Step 3: GET /api/bank must report incomplete with only phone_number missing
        g = requests.get(f"{API}/bank", headers=_hdr(distributor2["token"]))
        assert g.status_code == 200
        data = g.json()
        assert data["is_complete"] is False
        assert data["missing_fields"] == ["phone_number"], f"Got missing: {data['missing_fields']}"

        # Legacy data safety: raw fields untouched
        for k in ("account_holder", "account_number", "ifsc", "bank_name"):
            assert data[k] == full[k], f"Legacy field {k} was mutated"

        # Step 4: THE BUG — withdrawal must be blocked with new spec message
        wr = requests.post(f"{API}/withdrawals", json={"amount": 10}, headers=_hdr(distributor2["token"]))
        assert wr.status_code == 400, f"Expected 400, got {wr.status_code}: {wr.text}"
        expected_msg = "Please complete all your bank details (including phone number) before requesting a withdrawal."
        assert expected_msg in wr.text, f"Expected new spec message, got: {wr.text}"

    def test_legacy_record_with_all_empty_fields_blocks(self, admin_token, mongo_db):
        # Create a fresh distributor
        email = f"TEST_distv16_empty_{uuid.uuid4().hex[:8]}@x.com"
        body = {
            "role": "distributor", "full_name": "Empty Dist",
            "email": email, "password": "TestPass@123",
            "phone": "9000000110", "address": "A",
        }
        r = requests.post(f"{API}/admin/users", json=body, headers=_hdr(admin_token))
        assert r.status_code == 200
        u = r.json()
        user_id = u["id"] if "id" in u else u.get("user", {}).get("id")
        # Also login to get token
        l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"})
        tok = l.json()["token"]
        user_id = l.json()["user"]["id"]

        # Directly insert an incomplete doc — mimics legacy save-before-validation
        mongo_db.bank_details.delete_many({"user_id": user_id})  # in case
        mongo_db.bank_details.insert_one({
            "user_id": user_id,
            "account_holder": "  ",  # whitespace-only
            "account_number": "",
            "ifsc": "",
            "bank_name": "",
            # phone_number: missing entirely
            "updated_at": "2024-01-01T00:00:00Z",
        })

        g = requests.get(f"{API}/bank", headers=_hdr(tok))
        assert g.status_code == 200
        data = g.json()
        assert data["is_complete"] is False
        # All 5 should be reported missing
        missing = set(data["missing_fields"])
        assert missing == {"account_holder", "account_number", "ifsc", "bank_name", "phone_number"}, \
            f"Got: {missing}"

        wr = requests.post(f"{API}/withdrawals", json={"amount": 5}, headers=_hdr(tok))
        assert wr.status_code == 400
        assert "Please complete all your bank details" in wr.text

    def test_legacy_record_invalid_phone_format_blocks(self, admin_token, mongo_db):
        """Legacy record where phone_number exists but is invalid (e.g. 5 digits)."""
        email = f"TEST_distv16_badphone_{uuid.uuid4().hex[:8]}@x.com"
        r = requests.post(f"{API}/admin/users", json={
            "role": "distributor", "full_name": "BadPhone",
            "email": email, "password": "TestPass@123",
            "phone": "9000000111", "address": "A",
        }, headers=_hdr(admin_token))
        assert r.status_code == 200
        l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"})
        tok = l.json()["token"]
        user_id = l.json()["user"]["id"]

        mongo_db.bank_details.delete_many({"user_id": user_id})
        mongo_db.bank_details.insert_one({
            "user_id": user_id,
            "account_holder": "H", "account_number": "1",
            "ifsc": "IF", "bank_name": "B",
            "phone_number": "12345",  # invalid — only 5 digits
            "updated_at": "2024-01-01T00:00:00Z",
        })

        g = requests.get(f"{API}/bank", headers=_hdr(tok))
        data = g.json()
        assert data["is_complete"] is False
        assert "phone_number" in data["missing_fields"]

        wr = requests.post(f"{API}/withdrawals", json={"amount": 5}, headers=_hdr(tok))
        assert wr.status_code == 400
        assert "Please complete all your bank details" in wr.text


# =========================================================
# 4. Withdrawal PROCEEDS when all 5 fields present
# =========================================================
class TestWithdrawalSucceedsWhenComplete:
    def test_full_bank_allows_withdrawal_with_phone_snapshot(self, admin_token):
        # Fresh distributor + agent + recharge -> earnings > 0 -> withdraw
        d_email = f"TEST_distv16_ok_{uuid.uuid4().hex[:8]}@x.com"
        r = requests.post(f"{API}/admin/users", json={
            "role": "distributor", "full_name": "OK Dist",
            "email": d_email, "password": "TestPass@123",
            "phone": "9000000120", "address": "A",
        }, headers=_hdr(admin_token))
        assert r.status_code == 200
        d_tok = requests.post(f"{API}/auth/login", json={"email": d_email, "password": "TestPass@123"}).json()["token"]

        payload = {
            "account_holder": "OK Holder", "account_number": "5555",
            "ifsc": "OK0001", "bank_name": "OK Bank", "phone_number": "9123456789",
        }
        s = requests.post(f"{API}/bank", json=payload, headers=_hdr(d_tok))
        assert s.status_code == 200

        # Ensure an active QR exists for recharge
        qrs = requests.get(f"{API}/admin/qrcodes", headers=_hdr(admin_token)).json()
        if not any(q.get("active") for q in qrs):
            path = _upload_dummy(admin_token)
            qr = requests.post(f"{API}/admin/qrcodes", json={"label": "test-qr", "image_path": path}, headers=_hdr(admin_token))
            requests.patch(f"{API}/admin/qrcodes/{qr.json()['id']}/activate", headers=_hdr(admin_token))

        # Create agent, KYC approve, agent recharges -> distributor earns commission
        aadhaar = _upload_dummy(d_tok)
        pan = _upload_dummy(d_tok)
        a_email = f"TEST_agentv16_ok_{uuid.uuid4().hex[:8]}@x.com"
        ac = requests.post(f"{API}/distributor/agents", json={
            "role": "agent", "full_name": "OK Agent",
            "email": a_email, "password": "TestPass@123",
            "phone": "9000000121", "address": "A",
            "aadhaar_path": aadhaar, "pan_path": pan, "commission_percent": 2.0,
        }, headers=_hdr(d_tok))
        assert ac.status_code == 200, ac.text
        aid = ac.json()["id"]
        requests.post(f"{API}/admin/kyc/{aid}/approve", headers=_hdr(admin_token))
        a_tok = requests.post(f"{API}/auth/login", json={"email": a_email, "password": "TestPass@123"}).json()["token"]
        utr = str(int(time.time() * 1000))[-12:].zfill(12)
        rc = requests.post(f"{API}/agent/recharges", json={
            "amount": 10000, "utr": utr, "card_last4": "1111", "screenshot_path": "d.png",
        }, headers=_hdr(a_tok))
        assert rc.status_code == 200, rc.text
        ap = requests.post(f"{API}/admin/recharges/{rc.json()['id']}/approve", json={"note": ""}, headers=_hdr(admin_token))
        assert ap.status_code == 200

        wr = requests.post(f"{API}/withdrawals", json={"amount": 1}, headers=_hdr(d_tok))
        assert wr.status_code == 200, wr.text
        w = wr.json()
        assert w["bank"]["phone_number"] == "9123456789"
        assert w["bank"]["account_holder"] == "OK Holder"

        # Admin sees phone_number in snapshot
        adm = requests.get(f"{API}/admin/withdrawals", headers=_hdr(admin_token))
        row = next(x for x in adm.json() if x["id"] == w["id"])
        assert row["bank"]["phone_number"] == "9123456789"
