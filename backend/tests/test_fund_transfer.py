import pytest
from fastapi.testclient import TestClient
import uuid
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
from server import app

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    data = r.json()
    if data.get("status") == "setup_mpin_required":
        pre_auth_token = data["pre_auth_token"]
        r_mpin = client.post("/api/auth/setup-mpin", json={"pre_auth_token": pre_auth_token, "mpin": "123456"})
        assert r_mpin.status_code == 200, f"Setup MPIN failed: {r_mpin.text}"
        return r_mpin.json()["token"]
    elif data.get("status") == "mpin_required":
        pre_auth_token = data["pre_auth_token"]
        r_mpin = client.post("/api/auth/verify-mpin", json={"pre_auth_token": pre_auth_token, "mpin": "123456"})
        assert r_mpin.status_code == 200, f"Verify MPIN failed: {r_mpin.text}"
        return r_mpin.json()["token"]
    return data["token"]

def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

@pytest.fixture(scope="module")
def super_admin_token(client):
    return _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)

def test_fund_transfer_full_flow(client, super_admin_token):
    # 1. Admin configures Fund Transfer Settings
    r_limits = client.put(
        "/api/admin/settings/recharge-limits",
        headers=_h(super_admin_token),
        json={"min_recharge_limit": 100, "max_recharge_limit": 300000, "min_fund_transfer_limit": 150.0}
    )
    assert r_limits.status_code == 200, r_limits.text
    print("PUT limits response:", r_limits.json())

    r_toggles = client.put(
        "/api/admin/settings/recharge-toggles",
        headers=_h(super_admin_token),
        json={"fund_transfer_enabled": True}
    )
    assert r_toggles.status_code == 200, r_toggles.text

    # Verify settings retrieved
    r_get_limits = client.get("/api/admin/settings/recharge-limits", headers=_h(super_admin_token))
    assert r_get_limits.status_code == 200
    lim_data = r_get_limits.json()
    print("GET limits response:", lim_data)
    assert lim_data["min_fund_transfer_limit"] == 150.0
    assert lim_data["fund_transfer_enabled"] is True

    # 2. Create Hierarchy: MD -> Distributor -> Agent
    uid_suffix = uuid.uuid4().hex[:6]
    
    # Create MD
    md_email = f"ft_md_{uid_suffix}@example.com"
    r_md = client.post(
        "/api/admin/users",
        headers=_h(super_admin_token),
        json={
            "role": "master_distributor",
            "full_name": f"FT Master Distributor {uid_suffix}",
            "email": md_email,
            "password": "TestPass@123",
            "phone": f"98{uid_suffix[:8]}",
            "address": "123 MD St",
            "commission_percent": 1.0
        }
    )
    assert r_md.status_code == 200, r_md.text
    md_id = r_md.json()["id"]

    # Approve KYC for test MD
    r_app_md = client.post(f"/api/admin/kyc/{md_id}/approve", headers=_h(super_admin_token))
    print("Approve MD KYC:", r_app_md.status_code, r_app_md.text)

    # Login as MD
    md_token = _login(client, md_email, "TestPass@123")

    # MD Creates Distributor
    dist_email = f"ft_dist_{uid_suffix}@example.com"
    r_dist = client.post(
        "/api/master-distributor/users",
        headers=_h(md_token),
        json={
            "role": "distributor",
            "full_name": f"FT Distributor {uid_suffix}",
            "email": dist_email,
            "password": "TestPass@123",
            "phone": f"97{uid_suffix[:8]}",
            "address": "456 Dist St",
            "commission_percent": 0.5
        }
    )
    assert r_dist.status_code == 200, r_dist.text
    dist_id = r_dist.json()["id"]

    # Approve KYC for test Distributor
    r_app_dist = client.post(f"/api/admin/kyc/{dist_id}/approve", headers=_h(super_admin_token))
    print("Approve Dist KYC:", r_app_dist.status_code, r_app_dist.text)

    # Login as Distributor
    dist_token = _login(client, dist_email, "TestPass@123")

    # Distributor Creates Agent
    agent_email = f"ft_agent_{uid_suffix}@example.com"
    r_agent = client.post(
        "/api/distributor/agents",
        headers=_h(dist_token),
        json={
            "role": "agent",
            "full_name": f"FT Agent {uid_suffix}",
            "email": agent_email,
            "password": "TestPass@123",
            "phone": f"96{uid_suffix[:8]}",
            "address": "789 Agent St",
            "commission_percent": 0.2
        }
    )
    assert r_agent.status_code == 200, r_agent.text
    agent_id = r_agent.json()["id"]

    # Approve KYC for test Agent
    client.post(f"/api/admin/kyc/{agent_id}/approve", headers=_h(super_admin_token))

    # Login as Agent
    agent_token = _login(client, agent_email, "TestPass@123")

    # 3. Adjust MD Balance (Super Admin credits ₹10,000 to MD)
    r_adj = client.post(
        f"/api/admin/users/{md_id}/adjust-balance",
        headers=_h(super_admin_token),
        json={"amount": 10000.0, "type": "credit", "note": "Initial wallet balance for testing"}
    )
    assert r_adj.status_code == 200, r_adj.text

    # 4. Check Recipients API for MD
    r_recip_md = client.get("/api/fund-transfer/recipients", headers=_h(md_token))
    assert r_recip_md.status_code == 200
    recip_md_list = r_recip_md.json()
    assert any(u["id"] == dist_id for u in recip_md_list), "Distributor should be in MD's recipients list"
    assert not any(u["id"] == agent_id for u in recip_md_list), "Agent should NOT be in MD's recipients list"

    # 5. Validation Test: Below Minimum Limit (Minimum is ₹150)
    r_below_min = client.post(
        "/api/fund-transfer/execute",
        headers=_h(md_token),
        json={"recipient_id": dist_id, "amount": 100.0}
    )
    assert r_below_min.status_code == 400
    assert "Minimum fund transfer limit is ₹150.00" in r_below_min.json()["detail"]

    # 6. Validation Test: Invalid Recipient Role for MD (MD -> Agent direct transfer blocked)
    r_invalid_role = client.post(
        "/api/fund-transfer/execute",
        headers=_h(md_token),
        json={"recipient_id": agent_id, "amount": 500.0}
    )
    assert r_invalid_role.status_code == 403
    assert "Invalid recipient" in r_invalid_role.json()["detail"]

    # 7. Valid Transfer: MD -> Distributor (₹2,000)
    r_transfer_1 = client.post(
        "/api/fund-transfer/execute",
        headers=_h(md_token),
        json={"recipient_id": dist_id, "amount": 2000.0, "note": "Weekly distribution load"}
    )
    assert r_transfer_1.status_code == 200, r_transfer_1.text
    t1_data = r_transfer_1.json()
    assert t1_data["ok"] is True
    assert t1_data["sender_balance"] == 8000.0

    # Verify Distributor Wallet Balance updated
    r_dist_me = client.get("/api/wallet", headers=_h(dist_token))
    assert r_dist_me.json()["balance"] == 2000.0

    # 8. Check Recipients API for Distributor
    r_recip_dist = client.get("/api/fund-transfer/recipients", headers=_h(dist_token))
    assert r_recip_dist.status_code == 200
    recip_dist_list = r_recip_dist.json()
    assert any(u["id"] == agent_id for u in recip_dist_list), "Agent should be in Distributor's recipients list"

    # 9. Valid Transfer: Distributor -> Agent (₹800)
    r_transfer_2 = client.post(
        "/api/fund-transfer/execute",
        headers=_h(dist_token),
        json={"recipient_id": agent_id, "amount": 800.0, "note": "Top-up for agent"}
    )
    assert r_transfer_2.status_code == 200, r_transfer_2.text

    # Verify Distributor & Agent Wallet Balances
    r_dist_me2 = client.get("/api/wallet", headers=_h(dist_token))
    assert r_dist_me2.json()["balance"] == 1200.0

    r_agent_me = client.get("/api/wallet", headers=_h(agent_token))
    assert r_agent_me.json()["balance"] == 800.0

    # Verify Ledger / Statement Entry
    r_ledger = client.get("/api/wallet/ledger", headers=_h(dist_token))
    assert r_ledger.status_code == 200
    ledger_items = r_ledger.json()
    assert any(item.get("ref_type") == "fund_transfer" for item in ledger_items), "Fund transfer entry should be present in ledger statement"

    # 10. Agent Attempt to Transfer (Agent to Agent disabled)
    r_agent_ft = client.post(
        "/api/fund-transfer/execute",
        headers=_h(agent_token),
        json={"recipient_id": dist_id, "amount": 200.0}
    )
    assert r_agent_ft.status_code == 403

    # 11. Admin Disables Fund Transfer
    r_disable = client.put(
        "/api/admin/settings/recharge-toggles",
        headers=_h(super_admin_token),
        json={"fund_transfer_enabled": False}
    )
    assert r_disable.status_code == 200

    r_disabled_transfer = client.post(
        "/api/fund-transfer/execute",
        headers=_h(md_token),
        json={"recipient_id": dist_id, "amount": 500.0}
    )
    assert r_disabled_transfer.status_code == 400
    assert "disabled by Admin" in r_disabled_transfer.json()["detail"]

    # Restore settings
    client.put(
        "/api/admin/settings/recharge-toggles",
        headers=_h(super_admin_token),
        json={"fund_transfer_enabled": True}
    )
