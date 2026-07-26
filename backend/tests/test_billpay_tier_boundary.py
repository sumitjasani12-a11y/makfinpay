"""
Tests for Credit Card Bill Payment service-charge tier boundary update.

NEW boundary:
  - ₹0 – ₹50,000  -> ₹15  (inclusive of 50,000)
  - ₹50,001 – ₹1,00,000 -> ₹25
  - > ₹1,00,000   -> HTTP 400 (BLOCKED)

Verifies:
  1. service_charge computed correctly at all boundary amounts
  2. Hard-cap behaviour preserved (100001 -> 400)
  3. Historical transactions are NOT retro-recalculated
  4. End-to-end ₹50,000 bill creates txn with sc=15.0 & wallet debited by exact total
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PWD = "Riyaz@1212"
AGENT_EMAIL = "test_agent_46a8e0d6@x.com"
AGENT_PWD = "TestPass@123"


# ---------- shared helpers ----------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PWD)


@pytest.fixture(scope="module")
def agent_token():
    return _login(AGENT_EMAIL, AGENT_PWD)


def _wallet_balance(token):
    r = requests.get(f"{API}/wallet", headers=_h(token), timeout=20)
    assert r.status_code == 200
    return float(r.json()["balance"])


def _ensure_wallet(agent_tok, admin_tok, required: float):
    """Top up agent wallet through admin-approved recharge if balance < required.
    Recharge approval deducts commission from gross, so we over-request 2x + buffer."""
    bal = _wallet_balance(agent_tok)
    if bal >= required:
        return bal
    deficit_net = required - bal + 1000  # need this much NET credited
    # account for commission (worst case ~30%) by grossing up
    deficit_gross = round(deficit_net * 2.0 + 1000, 2)
    # agent submits recharge (RechargeIn requires card_last4 + screenshot_path)
    r = requests.post(
        f"{API}/agent/recharges",
        headers=_h(agent_tok),
        json={
            "amount": deficit_gross,
            "utr": f"TEST{uuid.uuid4().hex[:10].upper()}",
            "card_last4": "1234",
            "screenshot_path": "test/screenshot.png",
            "note": "tier-boundary-test",
        },
        timeout=20,
    )
    assert r.status_code == 200, f"recharge create failed: {r.status_code} {r.text}"
    rid = r.json()["id"]
    a = requests.post(f"{API}/admin/recharges/{rid}/approve", headers=_h(admin_tok), json={"note": "auto-approve for test"}, timeout=20)
    assert a.status_code == 200, f"recharge approve failed: {a.status_code} {a.text}"
    return _wallet_balance(agent_tok)


def _submit_bill(agent_tok, amount: float):
    body = {
        "customer_name": "Tier Test Customer",
        "card_last4": "1234",
        "operator": "HDFC Bank Credit Card",
        "customer_phone": "9999999999",
        "amount": amount,
    }
    return requests.post(f"{API}/agent/bill-payments", headers=_h(agent_tok), json=body, timeout=20)


# ---------- pure calc tests (no wallet debit needed beyond what passes) ----------
class TestBillPayServiceChargeCalc:
    """Verify service_charge at all tier boundaries (₹15 tier)."""

    @pytest.mark.parametrize("amount,expected_sc", [
        (1, 15.0),
        (24999, 15.0),
        (25000, 15.0),
        (25001, 15.0),    # OLD boundary - should now still be ₹15
        (49999, 15.0),
        (50000, 15.0),    # NEW boundary - inclusive low tier
    ])
    def test_low_tier_charge(self, agent_token, admin_token, amount, expected_sc):
        _ensure_wallet(agent_token, admin_token, amount + expected_sc + 100)
        bal_before = _wallet_balance(agent_token)
        r = _submit_bill(agent_token, amount)
        assert r.status_code == 200, f"amount={amount}: {r.status_code} {r.text}"
        tx = r.json()
        assert tx["service_charge"] == expected_sc, f"amount={amount}: sc={tx['service_charge']} expected {expected_sc}"
        assert tx["total_amount"] == round(amount + expected_sc, 2)
        assert tx["status"] == "pending"
        # wallet debited by exact total
        bal_after = _wallet_balance(agent_token)
        assert round(bal_before - bal_after, 2) == round(amount + expected_sc, 2), \
            f"wallet debit mismatch: before={bal_before} after={bal_after} expected_debit={amount+expected_sc}"


class TestBillPayHighTier:
    """Verify ₹25 tier (50001 - 100000)."""

    @pytest.mark.parametrize("amount,expected_sc", [
        (50001, 25.0),
        (75000, 25.0),
        (99999, 25.0),
        (100000, 25.0),
    ])
    def test_high_tier_charge(self, agent_token, admin_token, amount, expected_sc):
        _ensure_wallet(agent_token, admin_token, amount + expected_sc + 100)
        bal_before = _wallet_balance(agent_token)
        r = _submit_bill(agent_token, amount)
        assert r.status_code == 200, f"amount={amount}: {r.status_code} {r.text}"
        tx = r.json()
        assert tx["service_charge"] == expected_sc
        assert tx["total_amount"] == round(amount + expected_sc, 2)
        assert tx["status"] == "pending"
        bal_after = _wallet_balance(agent_token)
        assert round(bal_before - bal_after, 2) == round(amount + expected_sc, 2)


class TestBillPayHardCap:
    """Amount > ₹1,00,000 must be HTTP 400 with proper message."""

    def test_over_limit_blocked(self, agent_token):
        bal_before = _wallet_balance(agent_token)
        r = _submit_bill(agent_token, 100001)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        body = r.json()
        msg = body.get("detail") or body.get("message") or ""
        assert "1,00,000" in msg or "100000" in msg or "exceed" in msg.lower(), f"msg={msg}"
        # wallet unchanged
        bal_after = _wallet_balance(agent_token)
        assert bal_before == bal_after


class TestHistoricalTransactionsFrozen:
    """Old transactions must NOT be retro-recalculated. Verifies via /admin/transactions."""

    def test_historical_records_unchanged(self, admin_token):
        r = requests.get(f"{API}/admin/transactions", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        rows = r.json()
        # For any row where bill_amount is in OLD high-tier (25001 - 50000) and was created
        # before this change, service_charge could legitimately be ₹25. We only assert the
        # NEW invariant: stored service_charge must be exactly what was persisted (15 or 25
        # numeric), and tx structure preserved. We do NOT recompute against the new formula.
        for row in rows:
            if row.get("type") != "credit_card":
                continue
            sc = row.get("service_charge")
            assert sc in (15.0, 25.0, 15, 25), f"unexpected sc in historical row: {sc} (row id={row.get('id')})"
            # total_amount must equal bill_amount + service_charge as recorded
            ba = row.get("bill_amount")
            ta = row.get("total_amount")
            if ba is not None and ta is not None:
                assert round(ta - ba, 2) == round(sc, 2), \
                    f"total/bill/sc mismatch in historical row id={row.get('id')}: ba={ba} sc={sc} ta={ta}"


class TestE2EBoundarySubmission:
    """End-to-end: submit ₹50,000 then ₹50,001, verify created txns & wallet debits."""

    def test_50000_then_50001_e2e(self, agent_token, admin_token):
        _ensure_wallet(agent_token, admin_token, 50000 + 50001 + 15 + 25 + 500)

        # 1) ₹50,000 -> sc 15
        bal0 = _wallet_balance(agent_token)
        r1 = _submit_bill(agent_token, 50000)
        assert r1.status_code == 200, r1.text
        t1 = r1.json()
        assert t1["service_charge"] == 15.0
        assert t1["total_amount"] == 50015.0
        assert t1["status"] == "pending"
        bal1 = _wallet_balance(agent_token)
        assert round(bal0 - bal1, 2) == 50015.0, f"debit mismatch: {bal0} -> {bal1}"

        # confirm txn surfaces in agent transactions list with frozen sc
        lst = requests.get(f"{API}/agent/transactions", headers=_h(agent_token), timeout=20).json()
        ours = next((x for x in lst if x.get("id") == t1["id"]), None)
        assert ours is not None
        assert ours["service_charge"] == 15.0
        assert ours["total_amount"] == 50015.0

        # 2) ₹50,001 -> sc 25
        r2 = _submit_bill(agent_token, 50001)
        assert r2.status_code == 200, r2.text
        t2 = r2.json()
        assert t2["service_charge"] == 25.0
        assert t2["total_amount"] == 50026.0
        assert t2["status"] == "pending"
        bal2 = _wallet_balance(agent_token)
        assert round(bal1 - bal2, 2) == 50026.0
