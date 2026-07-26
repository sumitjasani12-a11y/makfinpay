"""
Backend regression tests for MAK FIN PAY after the complete removal of the agent_code system.

Covers:
 - Auth (email+password only)
 - User creation (admin/distributor without agent_code)
 - Recharge approve flow (wallet credit, ledger)
 - Bill payment (wallet debit, reject -> refund)
 - Withdrawals (create + admin reject refund)
 - Audit logs, admin stats
 - Mongo users index check (no agent_code index)
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fintech-bill-pay.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "makfinpay@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD env var is required to run the regression suite")

# unique suffix per run
SUFFIX = uuid.uuid4().hex[:8]
DIST_EMAIL = f"TEST_dist_{SUFFIX}@example.com"
DIST_PASS = "Distributor@123"
AGENT_EMAIL_BY_ADMIN = f"TEST_agent_admin_{SUFFIX}@example.com"
AGENT_EMAIL_BY_DIST = f"TEST_agent_dist_{SUFFIX}@example.com"
AGENT_PASS = "Agent@123"

state = {}


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- AUTH ----------
class TestAuth:
    def test_login_admin_email_password_only(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
        assert "user" in data
        user = data["user"]
        assert user["email"] == ADMIN_EMAIL
        assert user["role"] == "admin"
        assert "agent_code" not in user, f"agent_code should not be present in user: {user}"
        assert "password_hash" not in user
        state["admin_token"] = data["token"]

    def test_login_body_without_agent_code_field(self):
        # Already covered above implicitly (no agent_code in body). Re-assert explicit body.
        body = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        assert "agent_code" not in body
        r = requests.post(f"{API}/auth/login", json=body, timeout=30)
        assert r.status_code == 200

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG_PASS"}, timeout=30)
        assert r.status_code == 401

    def test_auth_me_admin_no_agent_code(self):
        token = state.get("admin_token")
        assert token, "admin login must have run first"
        r = requests.get(f"{API}/auth/me", headers=auth_headers(token), timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert "agent_code" not in u


# ---------- USERS ----------
class TestUserCreation:
    def test_admin_create_distributor_without_agent_code(self):
        token = state["admin_token"]
        body = {
            "role": "distributor",
            "full_name": "Test Distributor",
            "email": DIST_EMAIL,
            "password": DIST_PASS,
            "phone": "9999999999",
            "address": "Test addr",
        }
        assert "agent_code" not in body
        r = requests.post(f"{API}/admin/users", json=body, headers=auth_headers(token), timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["email"].lower() == DIST_EMAIL.lower()
        assert u["role"] == "distributor"
        assert "agent_code" not in u
        assert "password_hash" not in u
        state["dist_id"] = u["id"]

    def test_admin_create_agent_without_agent_code(self):
        token = state["admin_token"]
        body = {
            "role": "agent",
            "full_name": "Test Agent (Admin-Created)",
            "email": AGENT_EMAIL_BY_ADMIN,
            "password": AGENT_PASS,
            "phone": "9888888888",
            "address": "Test addr",
            "commission_percent": 1.2,
            "aadhaar_path": "/uploads/test_aadhaar.pdf",
            "pan_path": "/uploads/test_pan.pdf",
        }
        r = requests.post(f"{API}/admin/users", json=body, headers=auth_headers(token), timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "agent"
        assert "agent_code" not in u

    def test_admin_list_distributors_no_agent_code(self):
        token = state["admin_token"]
        r = requests.get(f"{API}/admin/users?role=distributor", headers=auth_headers(token), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        for it in items:
            assert "agent_code" not in it, f"agent_code leaked in admin list: {it}"
            assert "wallet_balance" in it

    def test_distributor_can_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": DIST_EMAIL, "password": DIST_PASS}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "distributor"
        assert "agent_code" not in data["user"]
        state["dist_token"] = data["token"]

    def test_distributor_creates_agent_without_agent_code(self):
        # ensure commission within admin range (default 1.0 - 3.0)
        token = state["dist_token"]
        body = {
            "role": "agent",
            "full_name": "Agent of Distributor",
            "email": AGENT_EMAIL_BY_DIST,
            "password": AGENT_PASS,
            "phone": "9777777777",
            "address": "Addr",
            "commission_percent": 1.5,
            "aadhaar_path": "/uploads/test_aadhaar.pdf",
            "pan_path": "/uploads/test_pan.pdf",
        }
        r = requests.post(f"{API}/distributor/agents", json=body, headers=auth_headers(token), timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "agent"
        assert "agent_code" not in u
        state["agent_id"] = u["id"]

    def test_agent_login(self):
        # Admin must approve KYC before the freshly-created agent can login
        admin_token = state["admin_token"]
        ap = requests.post(
            f"{API}/admin/kyc/{state['agent_id']}/approve",
            json={"note": ""},
            headers=auth_headers(admin_token),
            timeout=30,
        )
        assert ap.status_code == 200, ap.text
        r = requests.post(f"{API}/auth/login", json={"email": AGENT_EMAIL_BY_DIST, "password": AGENT_PASS}, timeout=30)
        assert r.status_code == 200, r.text
        state["agent_token"] = r.json()["token"]


# ---------- RECHARGE / WALLET / BILL / WITHDRAWAL ----------
class TestRechargeAndWalletFlow:
    def test_agent_create_recharge_pending(self):
        token = state["agent_token"]
        body = {"amount": 1000.0, "utr": f"UTR{SUFFIX}", "card_last4": "1234", "screenshot_path": "dummy/path/screenshot.png"}
        r = requests.post(f"{API}/agent/recharges", json=body, headers=auth_headers(token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending"
        assert d["amount"] == 1000.0
        state["recharge_id"] = d["id"]

    def test_admin_approve_recharge_credits_wallet(self):
        token = state["admin_token"]
        rid = state["recharge_id"]
        r = requests.post(f"{API}/admin/recharges/{rid}/approve", json={"note": "ok"}, headers=auth_headers(token), timeout=30)
        assert r.status_code == 200, r.text

    def test_agent_wallet_reflects_credit(self):
        token = state["agent_token"]
        r = requests.get(f"{API}/wallet", headers=auth_headers(token), timeout=30)
        assert r.status_code == 200
        w = r.json()
        # 1000 * (distributor_base + 1.5)% commission => credit = 1000 - commission
        # Distributor base = current platform default; markup = 1.5
        rcs = requests.get(f"{API}/admin/settings/commission", headers=auth_headers(state["admin_token"]), timeout=30)
        base = float(rcs.json()["default_percent"])
        expected_credit = round(1000 - (1000 * (base + 1.5) / 100.0), 2)
        assert round(w["balance"], 2) == expected_credit, (w, expected_credit)
        state["wallet_balance"] = w["balance"]

    def test_ledger_entry_created(self):
        token = state["agent_token"]
        r = requests.get(f"{API}/wallet/ledger", headers=auth_headers(token), timeout=30)
        assert r.status_code == 200
        entries = r.json()
        assert any(e.get("ref_type") == "recharge" and e.get("kind") == "credit" for e in entries)

    def test_insufficient_balance_bill_payment_400(self):
        token = state["agent_token"]
        body = {
            "customer_name": "Big Spender",
            "card_last4": "1234",
            "operator": "HDFC",
            "customer_phone": "9000000000",
            "amount": 100000.0,
        }
        r = requests.post(f"{API}/agent/bill-payments", json=body, headers=auth_headers(token), timeout=30)
        assert r.status_code == 400

    def test_bill_payment_deducts_wallet(self):
        token = state["agent_token"]
        body = {
            "customer_name": "John",
            "card_last4": "4321",
            "operator": "HDFC",
            "customer_phone": "9000000000",
            "amount": 200.0,
        }
        r = requests.post(f"{API}/agent/bill-payments", json=body, headers=auth_headers(token), timeout=30)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["status"] == "pending"  # bill payments require admin approval to mark success
        state["tx_id"] = tx["id"]
        state["tx_total"] = tx["total_amount"]
        # Verify wallet decreased by total_amount (bill + service_charge)
        rw = requests.get(f"{API}/wallet", headers=auth_headers(token), timeout=30)
        assert rw.status_code == 200
        assert round(rw.json()["balance"], 2) == round(state["wallet_balance"] - tx["total_amount"], 2)

    def test_admin_reject_transaction_refunds(self):
        token = state["admin_token"]
        tid = state["tx_id"]
        r = requests.post(f"{API}/admin/transactions/{tid}/reject", json={"note": "test"}, headers=auth_headers(token), timeout=30)
        assert r.status_code == 200
        # Wallet should be back to 985
        atoken = state["agent_token"]
        rw = requests.get(f"{API}/wallet", headers=auth_headers(atoken), timeout=30)
        assert round(rw.json()["balance"], 2) == round(state["wallet_balance"], 2)
        # ledger should have reversal
        rl = requests.get(f"{API}/wallet/ledger", headers=auth_headers(atoken), timeout=30)
        assert any(e.get("ref_type") == "bill_payment_reversal" for e in rl.json())


class TestWithdrawals:
    def test_add_bank_then_withdraw(self):
        token = state["agent_token"]
        bank = {"account_holder": "Agent", "account_number": "12345678", "ifsc": "HDFC0001", "bank_name": "HDFC"}
        rb = requests.post(f"{API}/bank", json=bank, headers=auth_headers(token), timeout=30)
        assert rb.status_code == 200, rb.text
        rw_before = requests.get(f"{API}/wallet", headers=auth_headers(token), timeout=30).json()["balance"]
        rwd = requests.post(f"{API}/withdrawals", json={"amount": 100.0}, headers=auth_headers(token), timeout=30)
        assert rwd.status_code == 200, rwd.text
        state["withdrawal_id"] = rwd.json()["id"]
        rw_after = requests.get(f"{API}/wallet", headers=auth_headers(token), timeout=30).json()["balance"]
        assert round(rw_after, 2) == round(rw_before - 100.0, 2)

    def test_admin_reject_withdrawal_refunds(self):
        atoken = state["admin_token"]
        wid = state["withdrawal_id"]
        r = requests.post(f"{API}/admin/withdrawals/{wid}/reject", json={"note": "test"}, headers=auth_headers(atoken), timeout=30)
        assert r.status_code == 200, r.text
        # Confirm refund
        atoken_agent = state["agent_token"]
        bal = requests.get(f"{API}/wallet", headers=auth_headers(atoken_agent), timeout=30).json()["balance"]
        assert round(bal, 2) == round(state["wallet_balance"], 2)


# ---------- AUDIT / STATS ----------
class TestAuditAndStats:
    def test_admin_audit_logs_no_agent_code(self):
        token = state["admin_token"]
        r = requests.get(f"{API}/admin/audit-logs", headers=auth_headers(token), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for it in items:
            meta = it.get("meta") or {}
            assert "agent_code" not in meta, f"agent_code in audit meta: {it}"
            # also check entire serialized item
            assert "agent_code" not in str(it).lower().replace("agent_codes", "")

    def test_admin_stats_numeric_kpis(self):
        token = state["admin_token"]
        r = requests.get(f"{API}/admin/stats", headers=auth_headers(token), timeout=30)
        assert r.status_code == 200
        s = r.json()
        for k in ["total_agents", "total_distributors", "pending_recharges", "pending_withdrawals",
                  "total_wallet", "total_revenue", "total_txn_amount", "total_txn_count"]:
            assert k in s
            assert isinstance(s[k], (int, float))


# ---------- DB INDEX CHECK ----------
class TestMongoIndexes:
    def test_users_indexes_no_agent_code(self):
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip('"').strip("'")
        db_name = os.environ.get("DB_NAME", "makfinpay_db").strip('"').strip("'")
        c = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        try:
            info = c[db_name].users.index_information()
        finally:
            c.close()
        names = list(info.keys())
        assert "_id_" in names
        assert "email_1" in names
        for n in names:
            assert "agent_code" not in n, f"Legacy index leaked: {n}"


# ---------- CLEANUP ----------
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_users():
    yield
    try:
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip('"').strip("'")
        db_name = os.environ.get("DB_NAME", "makfinpay_db").strip('"').strip("'")
        c = MongoClient(mongo_url)
        db = c[db_name]
        db.users.delete_many({"email": {"$regex": "^TEST_"}})
        c.close()
    except Exception:
        pass
