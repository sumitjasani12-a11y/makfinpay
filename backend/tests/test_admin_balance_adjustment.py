import pytest
from fastapi.testclient import TestClient
import uuid
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
from server import app

SUPER_ADMIN_EMAIL = "jigs.vanani@gmail.com"
SUPER_ADMIN_PASS = "Jigscse@3521"

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["token"]

def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

@pytest.fixture(scope="session")
def super_admin_token(client):
    return _login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASS)

@pytest.fixture(scope="session")
def normal_admin_token(client):
    return _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)

@pytest.fixture
def test_agent(client, super_admin_token):
    uid_suffix = uuid.uuid4().hex[:8]
    agent_email = f"test_adj_agent_{uid_suffix}@example.com"
    payload = {
        "role": "agent",
        "full_name": f"Test Adjust Agent {uid_suffix}",
        "email": agent_email,
        "password": "TestPass@123",
        "phone": "9998887776",
        "address": "123 Test Street",
        "commission_percent": 1.0,
        "t1_commission_percent": 1.5,
        "aadhaar_path": "uploads/test_aadhaar.png",
        "pan_path": "uploads/test_pan.png"
    }
    r = client.post("/api/admin/users", headers=_h(super_admin_token), json=payload)
    assert r.status_code == 200, f"Failed to create test agent: {r.text}"
    user_data = r.json()
    yield user_data
    
    # Clean up (delete user)
    client.post(f"/api/admin/users/{user_data['id']}/delete", headers=_h(super_admin_token))

def test_super_admin_credit_balance(client, super_admin_token, test_agent):
    uid = test_agent["id"]
    
    # 1. Fetch user detail to verify starting balance
    r_detail = client.get(f"/api/admin/users/{uid}", headers=_h(super_admin_token))
    assert r_detail.status_code == 200
    starting_balance = float(r_detail.json()["wallet"]["balance"])
    
    # 2. Perform credit (add money)
    credit_payload = {
        "amount": 1500.50,
        "type": "credit",
        "note": "Initial test deposit by Super Admin"
    }
    r_adj = client.post(f"/api/admin/users/{uid}/adjust-balance", headers=_h(super_admin_token), json=credit_payload)
    assert r_adj.status_code == 200, r_adj.text
    assert r_adj.json()["ok"] is True
    assert float(r_adj.json()["new_balance"]) == starting_balance + 1500.50
    
    # 3. Verify user details update
    r_detail2 = client.get(f"/api/admin/users/{uid}", headers=_h(super_admin_token))
    assert float(r_detail2.json()["wallet"]["balance"]) == starting_balance + 1500.50

def test_super_admin_debit_balance(client, super_admin_token, test_agent):
    uid = test_agent["id"]
    
    # 1. Add some initial balance
    client.post(
        f"/api/admin/users/{uid}/adjust-balance",
        headers=_h(super_admin_token),
        json={"amount": 500.0, "type": "credit", "note": "Pre-debit credit"}
    )
    
    # 2. Deduct money
    debit_payload = {
        "amount": 200.0,
        "type": "debit",
        "note": "Test debit"
    }
    r_adj = client.post(f"/api/admin/users/{uid}/adjust-balance", headers=_h(super_admin_token), json=debit_payload)
    assert r_adj.status_code == 200, r_adj.text
    assert float(r_adj.json()["new_balance"]) == 300.0

def test_insufficient_balance_debit_fails(client, super_admin_token, test_agent):
    uid = test_agent["id"]
    
    # Debit more than available (starts at 0)
    debit_payload = {
        "amount": 100.0,
        "type": "debit",
        "note": "Should fail due to insufficient balance"
    }
    r_adj = client.post(f"/api/admin/users/{uid}/adjust-balance", headers=_h(super_admin_token), json=debit_payload)
    assert r_adj.status_code == 400
    assert "Insufficient wallet balance" in r_adj.text

def test_normal_admin_cannot_adjust_balance(client, normal_admin_token, super_admin_token, test_agent):
    uid = test_agent["id"]
    
    # Regular admin tries to adjust balance
    payload = {
        "amount": 100.0,
        "type": "credit",
        "note": "Hacker admin trying to add balance"
    }
    r_adj = client.post(f"/api/admin/users/{uid}/adjust-balance", headers=_h(normal_admin_token), json=payload)
    assert r_adj.status_code == 403
    assert "Only the Super Admin" in r_adj.text
