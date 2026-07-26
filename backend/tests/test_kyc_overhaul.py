"""Backend regression for the MAK FIN PAY KYC overhaul.

Covers (in order):
- Admin login.
- POST /admin/users role=agent without aadhaar_path/pan_path -> 400.
- POST /admin/users role=agent WITH aadhaar+pan -> 201, kyc_status='pending', db.kyc record auto-created.
- POST /distributor/agents missing aadhaar/pan -> 400; with both -> 201.
- POST /auth/login for an agent with kyc_status='pending' -> 403 with pending message.
- POST /admin/kyc/{uid}/approve sets kyc_status='approved' on both collections + audit log; agent can then login.
- POST /admin/kyc/{uid}/reject with note -> rejected on both collections + reason persisted + audit; agent login -> 403 rejected message.
- GET /admin/kyc returns enriched list with required fields & only agents.
- GET /admin/stats/financial includes pending_kyc_count.
- Pre-existing agents (older than this release) keep kyc_status='approved' and can login.
- Agent self-KYC endpoints POST /api/kyc and GET /api/kyc/mine return 404/405 (no longer routed).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fintech-bill-pay.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "makfinpay@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Riyaz@1212")


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture()
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _suffix():
    return uuid.uuid4().hex[:8]


@pytest.fixture()
def distributor(admin_headers):
    """Create a fresh distributor and yield {token, id, email}.

    Distributors don't need KYC docs so they can login immediately.
    """
    sfx = _suffix()
    email = f"TEST_kyc_dist_{sfx}@example.com"
    payload = {
        "role": "distributor",
        "full_name": f"Test Dist {sfx}",
        "email": email,
        "password": "Pass@1234",
        "phone": "9999999999",
        "address": "Test address",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code in (200, 201), f"create distributor failed: {r.status_code} {r.text}"
    dist = r.json()
    login = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@1234"}, timeout=20)
    assert login.status_code == 200, f"distributor login failed: {login.status_code} {login.text}"
    yield {"id": dist["id"], "email": email, "token": login.json()["token"], "headers": {"Authorization": f"Bearer {login.json()['token']}"}}


# ---------- Tests ----------

# Admin agent creation: missing docs
def test_admin_create_agent_missing_kyc_returns_400(admin_headers):
    payload = {
        "role": "agent",
        "full_name": "TEST_no_docs",
        "email": f"TEST_no_docs_{_suffix()}@example.com",
        "password": "Pass@1234",
        "phone": "9000000001",
        "address": "Addr",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
    detail = (r.json().get("detail") or "").lower()
    assert "aadhaar" in detail and "pan" in detail


# Admin agent creation: with docs -> pending kyc
def test_admin_create_agent_with_kyc_creates_pending(admin_headers):
    sfx = _suffix()
    email = f"TEST_kyc_admin_agent_{sfx}@example.com"
    payload = {
        "role": "agent",
        "full_name": f"Test Agent {sfx}",
        "email": email,
        "password": "Pass@1234",
        "phone": "9000000002",
        "address": "Test addr",
        "aadhaar_path": "/uploads/test_aadhaar.pdf",
        "pan_path": "/uploads/test_pan.pdf",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code in (200, 201), f"create agent failed: {r.status_code} {r.text}"
    user = r.json()
    assert user["kyc_status"] == "pending"
    assert user["aadhaar_path"] == payload["aadhaar_path"]
    assert user["pan_path"] == payload["pan_path"]

    # The agent must appear in /admin/kyc as pending
    kyc_list = requests.get(f"{API}/admin/kyc", headers=admin_headers, timeout=20)
    assert kyc_list.status_code == 200
    matches = [k for k in kyc_list.json() if k["user_id"] == user["id"]]
    assert len(matches) == 1, "kyc record was not auto-created for admin-made agent"
    rec = matches[0]
    assert rec["status"] == "pending"
    assert rec["aadhaar_path"] == payload["aadhaar_path"]
    assert rec["pan_path"] == payload["pan_path"]
    assert rec.get("distributor_name") == "Admin"
    assert rec.get("user", {}).get("full_name") == payload["full_name"]
    assert rec.get("user", {}).get("phone") == payload["phone"]
    assert rec.get("user", {}).get("address") == payload["address"]
    assert "submitted_at" in rec


# Distributor agent creation: missing docs
def test_distributor_create_agent_missing_kyc_returns_400(distributor):
    payload = {
        "role": "agent",
        "full_name": "TEST_dist_no_docs",
        "email": f"TEST_dist_no_docs_{_suffix()}@example.com",
        "password": "Pass@1234",
        "phone": "9000000010",
        "address": "Addr",
    }
    r = requests.post(f"{API}/distributor/agents", json=payload, headers=distributor["headers"], timeout=20)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
    detail = (r.json().get("detail") or "").lower()
    assert "aadhaar" in detail and "pan" in detail


# Pending KYC blocks login
def test_pending_agent_cannot_login(admin_headers):
    sfx = _suffix()
    email = f"TEST_pending_agent_{sfx}@example.com"
    payload = {
        "role": "agent",
        "full_name": f"Pending Agent {sfx}",
        "email": email,
        "password": "Pass@1234",
        "phone": "9000000003",
        "address": "Test addr",
        "aadhaar_path": "/uploads/a.pdf",
        "pan_path": "/uploads/p.pdf",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code in (200, 201)
    login = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@1234"}, timeout=20)
    assert login.status_code == 403, f"expected 403 for pending KYC, got {login.status_code} {login.text}"
    assert "pending kyc verification" in (login.json().get("detail") or "").lower()


# Approve flow: kyc + users both updated + agent can login
def test_approve_kyc_and_agent_can_login(admin_headers):
    sfx = _suffix()
    email = f"TEST_approve_agent_{sfx}@example.com"
    payload = {
        "role": "agent",
        "full_name": f"Approve Agent {sfx}",
        "email": email,
        "password": "Pass@1234",
        "phone": "9000000004",
        "address": "Test addr",
        "aadhaar_path": "/uploads/a.pdf",
        "pan_path": "/uploads/p.pdf",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=20)
    uid = r.json()["id"]
    # blocked before approval
    pre = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@1234"}, timeout=20)
    assert pre.status_code == 403

    # approve
    ap = requests.post(f"{API}/admin/kyc/{uid}/approve", json={"note": ""}, headers=admin_headers, timeout=20)
    assert ap.status_code == 200, ap.text
    assert ap.json().get("kyc_status") == "approved"

    # both collections reflect approved
    kyc_list = requests.get(f"{API}/admin/kyc", headers=admin_headers, timeout=20).json()
    rec = next(k for k in kyc_list if k["user_id"] == uid)
    assert rec["status"] == "approved"
    assert rec["user"]["full_name"] == payload["full_name"]

    # audit log should contain 'kyc_approved' for this target
    audit = requests.get(f"{API}/admin/audit-logs", headers=admin_headers, timeout=20)
    assert audit.status_code == 200
    assert any(a.get("action") == "kyc_approved" and a.get("target") == uid for a in audit.json()), \
        "kyc_approved audit log missing"

    # agent can now login
    post = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@1234"}, timeout=20)
    assert post.status_code == 200, f"approved agent could not login: {post.status_code} {post.text}"
    assert post.json()["user"]["kyc_status"] == "approved"


# Reject flow + reason + audit + login still blocked
def test_reject_kyc_blocks_login_with_reason(admin_headers):
    sfx = _suffix()
    email = f"TEST_reject_agent_{sfx}@example.com"
    payload = {
        "role": "agent",
        "full_name": f"Reject Agent {sfx}",
        "email": email,
        "password": "Pass@1234",
        "phone": "9000000005",
        "address": "Test addr",
        "aadhaar_path": "/uploads/a.pdf",
        "pan_path": "/uploads/p.pdf",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=20)
    uid = r.json()["id"]
    reason = "Aadhaar image is blurry"
    rj = requests.post(f"{API}/admin/kyc/{uid}/reject", json={"note": reason}, headers=admin_headers, timeout=20)
    assert rj.status_code == 200, rj.text
    assert rj.json().get("kyc_status") == "rejected"

    # both collections reflect rejected & reason
    kyc_list = requests.get(f"{API}/admin/kyc", headers=admin_headers, timeout=20).json()
    rec = next(k for k in kyc_list if k["user_id"] == uid)
    assert rec["status"] == "rejected"
    # Reason should be present on either kyc record or user
    assert (rec.get("rejection_reason") == reason) or (rec.get("user", {}).get("kyc_rejection_reason") == reason)

    # audit log 'kyc_rejected'
    audit = requests.get(f"{API}/admin/audit-logs", headers=admin_headers, timeout=20).json()
    assert any(a.get("action") == "kyc_rejected" and a.get("target") == uid for a in audit), \
        "kyc_rejected audit log missing"

    # blocked login with rejected message
    login = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@1234"}, timeout=20)
    assert login.status_code == 403, f"rejected agent should not login: {login.status_code} {login.text}"
    assert "rejected" in (login.json().get("detail") or "").lower()


# /admin/kyc shape contract
def test_admin_kyc_list_shape(admin_headers):
    r = requests.get(f"{API}/admin/kyc", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    # if anything exists, validate the contract on first row
    if rows:
        row = rows[0]
        for key in ("user_id", "aadhaar_path", "pan_path", "status", "user", "distributor_name", "submitted_at"):
            assert key in row, f"missing key {key} in /admin/kyc row"
        assert isinstance(row["user"], dict)
        for ukey in ("full_name", "phone", "address"):
            assert ukey in row["user"], f"missing user.{ukey} in /admin/kyc row"
    # No distributor's KYC should leak in
    for row in rows:
        assert row["user"].get("role", "agent") == "agent", "non-agent KYC leaked into /admin/kyc"


# pending_kyc_count present and matches actual count
def test_financial_stats_has_pending_kyc_count(admin_headers):
    r = requests.get(f"{API}/admin/stats/financial", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert "pending_kyc_count" in j
    assert isinstance(j["pending_kyc_count"], int)
    assert j["pending_kyc_count"] >= 0

    # Cross-check vs /admin/kyc rows in pending state
    kyc_list = requests.get(f"{API}/admin/kyc", headers=admin_headers, timeout=20).json()
    pending_rows = [k for k in kyc_list if (k.get("status") or "pending") == "pending"]
    assert j["pending_kyc_count"] == len(pending_rows), \
        f"pending_kyc_count {j['pending_kyc_count']} != len(pending_rows) {len(pending_rows)}"


# Pre-existing agents (created without aadhaar/pan) should be auto-approved & able to login
def test_pre_existing_agents_are_approved(admin_headers):
    # Find any agent whose kyc_status is approved AND whose aadhaar_path is empty -> these are migrated
    r = requests.get(f"{API}/admin/users?role=agent", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    agents = r.json()
    migrated = [a for a in agents if a.get("kyc_status") == "approved" and not a.get("aadhaar_path")]
    # We don't fail if no migrated agents exist (clean env); just assert all approved agents are not 'pending'/'rejected'
    for a in agents:
        if not a.get("aadhaar_path"):
            assert a.get("kyc_status") == "approved", \
                f"pre-existing agent {a.get('email')} expected approved, got {a.get('kyc_status')}"
    # Document the count to test report
    print(f"Pre-existing migrated approved agents: {len(migrated)} / total agents: {len(agents)}")


# Agent self-KYC endpoints should no longer exist
def test_agent_self_kyc_endpoints_removed(admin_headers):
    # GET /api/kyc/mine — should be 404 / 405 / not_found-style
    g = requests.get(f"{API}/kyc/mine", headers=admin_headers, timeout=20)
    assert g.status_code in (404, 405), f"GET /api/kyc/mine still exists: {g.status_code} {g.text[:200]}"
    p = requests.post(f"{API}/kyc", json={"aadhaar_no": "x", "pan_no": "y"}, headers=admin_headers, timeout=20)
    assert p.status_code in (404, 405), f"POST /api/kyc still exists: {p.status_code} {p.text[:200]}"


# Distributor-created agent appears in /admin/kyc with distributor_name set
def test_distributor_created_agent_kyc_distributor_name(distributor, admin_headers):
    sfx = _suffix()
    email = f"TEST_kyc_dist_agent_{sfx}@example.com"
    payload = {
        "role": "agent",
        "full_name": f"Dist Agent {sfx}",
        "email": email,
        "password": "Pass@1234",
        "phone": "9000000020",
        "address": "Test addr",
        "aadhaar_path": "/uploads/a.pdf",
        "pan_path": "/uploads/p.pdf",
    }
    r = requests.post(f"{API}/distributor/agents", json=payload, headers=distributor["headers"], timeout=20)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    kyc_list = requests.get(f"{API}/admin/kyc", headers=admin_headers, timeout=20).json()
    rec = next(k for k in kyc_list if k["user_id"] == uid)
    assert rec["status"] == "pending"
    # distributor_name should be the distributor's full_name (NOT 'Admin')
    assert rec["distributor_name"] and rec["distributor_name"] != "Admin", \
        f"expected distributor name, got {rec['distributor_name']!r}"
