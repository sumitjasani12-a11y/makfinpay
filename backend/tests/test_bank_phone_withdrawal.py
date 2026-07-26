"""
Iteration 15 backend regression tests.

Covers:
  1. Bank Save with phone_number validation (10-digit + prefix normalisation)
  2. Withdrawal snapshotting new bank dict (with phone_number)
  3. Withdrawal reject without bank details
  4. Distributor withdrawal + bank flow (earnings-balance regression intact)
"""
import os
import time
import uuid
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _upload_dummy(token):
    """Upload a tiny 1-pixel PNG as fake Aadhaar/PAN, return storage path."""
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )
    files = {"file": ("dummy.png", png, "image/png")}
    r = requests.post(f"{API}/uploads", files=files, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return r.json()["path"]


@pytest.fixture(scope="session")
def distributor(admin_token):
    """Provision fresh distributor + return login token."""
    email = f"TEST_dist_{uuid.uuid4().hex[:8]}@x.com"
    body = {
        "role": "distributor", "full_name": "Test Dist",
        "email": email, "password": "TestPass@123",
        "phone": "9000000001", "address": "Addr",
    }
    r = requests.post(f"{API}/admin/users", json=body, headers=_hdr(admin_token))
    assert r.status_code == 200, r.text
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"})
    assert l.status_code == 200, l.text
    return {"token": l.json()["token"], "id": l.json()["user"]["id"], "email": email}


@pytest.fixture(scope="session")
def agent(admin_token, distributor):
    """Provision fresh agent under distributor (KYC approved) + login token."""
    email = f"TEST_agent_{uuid.uuid4().hex[:8]}@x.com"
    aadhaar = _upload_dummy(distributor["token"])
    pan = _upload_dummy(distributor["token"])
    body = {
        "role": "agent", "full_name": "Test Agent",
        "email": email, "password": "TestPass@123",
        "phone": "9000000002", "address": "Addr",
        "aadhaar_path": aadhaar, "pan_path": pan,
        "commission_percent": 0.5,
    }
    r = requests.post(f"{API}/distributor/agents", json=body, headers=_hdr(distributor["token"]))
    assert r.status_code == 200, r.text
    agent_id = r.json()["id"]
    # Admin approves KYC (agents can't login until approved)
    ap = requests.post(f"{API}/admin/kyc/{agent_id}/approve", headers=_hdr(admin_token))
    assert ap.status_code == 200, ap.text
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"})
    assert l.status_code == 200, l.text
    return {"token": l.json()["token"], "id": agent_id, "email": email}


# ---------- Bank save: valid phone ----------
class TestBankPhoneValidation:
    def test_valid_10_digit(self, agent):
        r = requests.post(f"{API}/bank", json={
            "account_holder": "A", "account_number": "123", "ifsc": "IF01",
            "bank_name": "B", "phone_number": "9876543210",
        }, headers=_hdr(agent["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["phone_number"] == "9876543210"
        # GET verifies persistence
        g = requests.get(f"{API}/bank", headers=_hdr(agent["token"]))
        assert g.status_code == 200
        assert g.json()["phone_number"] == "9876543210"

    def test_plus91_prefix_stripped(self, agent):
        r = requests.post(f"{API}/bank", json={
            "account_holder": "A", "account_number": "123", "ifsc": "IF01",
            "bank_name": "B", "phone_number": "+919876543210",
        }, headers=_hdr(agent["token"]))
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/bank", headers=_hdr(agent["token"]))
        assert g.json()["phone_number"] == "9876543210"

    def test_91_prefix_no_plus_stripped(self, agent):
        r = requests.post(f"{API}/bank", json={
            "account_holder": "A", "account_number": "123", "ifsc": "IF01",
            "bank_name": "B", "phone_number": "919876543210",
        }, headers=_hdr(agent["token"]))
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/bank", headers=_hdr(agent["token"]))
        assert g.json()["phone_number"] == "9876543210"

    @pytest.mark.parametrize("bad", ["12345", "123456789012345", "", "abc1234567", "   "])
    def test_invalid_phone_rejects_400(self, agent, bad):
        r = requests.post(f"{API}/bank", json={
            "account_holder": "A", "account_number": "123", "ifsc": "IF01",
            "bank_name": "B", "phone_number": bad,
        }, headers=_hdr(agent["token"]))
        assert r.status_code == 400, f"expected 400 got {r.status_code} for {bad!r}: {r.text}"
        assert "Phone Number must be exactly 10 digits" in r.text


# ---------- Withdrawal bank snapshot ----------
class TestWithdrawalBankSnapshot:
    def test_snapshot_frozen_after_bank_edit(self, agent, admin_token):
        # Save bank w/ phone A
        r = requests.post(f"{API}/bank", json={
            "account_holder": "Holder1", "account_number": "111", "ifsc": "IF11",
            "bank_name": "Bank11", "phone_number": "9876543210",
        }, headers=_hdr(agent["token"]))
        assert r.status_code == 200

        # Credit agent wallet so withdrawal succeeds → approve a dummy recharge as admin
        # Use adjust via a small recharge flow: create + approve to fund the wallet.
        # Simpler: just create a recharge with the active QR (if any). Fall back to raw insert path — but no admin adjust API exists, so use recharge flow.
        # Create QR + activate
        # (skip if QR active already)
        qrs = requests.get(f"{API}/admin/qrcodes", headers=_hdr(admin_token)).json()
        if not any(q.get("active") for q in qrs):
            # create + activate one
            path = _upload_dummy(admin_token)
            qr = requests.post(f"{API}/admin/qrcodes", json={"label": "test-qr", "image_path": path}, headers=_hdr(admin_token))
            assert qr.status_code == 200
            requests.patch(f"{API}/admin/qrcodes/{qr.json()['id']}/activate", headers=_hdr(admin_token))
        # Agent submits recharge
        utr = str(int(time.time() * 1000))[-12:].zfill(12)
        rc = requests.post(f"{API}/agent/recharges", json={
            "amount": 500, "utr": utr, "card_last4": "1234", "screenshot_path": "dummy.png",
        }, headers=_hdr(agent["token"]))
        assert rc.status_code == 200, rc.text
        rid = rc.json()["id"]
        ap = requests.post(f"{API}/admin/recharges/{rid}/approve", json={"note": ""}, headers=_hdr(admin_token))
        assert ap.status_code == 200, ap.text

        # Now request withdrawal
        wr = requests.post(f"{API}/withdrawals", json={"amount": 100}, headers=_hdr(agent["token"]))
        assert wr.status_code == 200, wr.text
        bank = wr.json()["bank"]
        assert bank["phone_number"] == "9876543210"
        assert bank["account_holder"] == "Holder1"
        assert bank["bank_name"] == "Bank11"
        wid = wr.json()["id"]

        # Edit bank details — phone changed
        r2 = requests.post(f"{API}/bank", json={
            "account_holder": "Holder2", "account_number": "222", "ifsc": "IF22",
            "bank_name": "Bank22", "phone_number": "8888888888",
        }, headers=_hdr(agent["token"]))
        assert r2.status_code == 200

        # Original withdrawal record still shows the OLD bank snapshot
        adm = requests.get(f"{API}/admin/withdrawals", headers=_hdr(admin_token))
        assert adm.status_code == 200
        row = next(w for w in adm.json() if w["id"] == wid)
        assert row["bank"]["phone_number"] == "9876543210"
        assert row["bank"]["account_holder"] == "Holder1"


# ---------- Withdrawal without bank ----------
class TestWithdrawalWithoutBank:
    def test_400_when_no_bank(self, admin_token):
        # Fresh agent — but agents need KYC + can only login if approved. Instead
        # use a fresh distributor (they auto-approve) with no bank_details doc.
        email = f"TEST_nobank_{uuid.uuid4().hex[:8]}@x.com"
        body = {
            "role": "distributor", "full_name": "NoBank Dist",
            "email": email, "password": "TestPass@123",
            "phone": "9000000010", "address": "Addr",
        }
        r = requests.post(f"{API}/admin/users", json=body, headers=_hdr(admin_token))
        assert r.status_code == 200
        l = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"})
        tok = l.json()["token"]
        wr = requests.post(f"{API}/withdrawals", json={"amount": 10}, headers=_hdr(tok))
        assert wr.status_code == 400
        # Iter 16 changed the message — now unified 'complete bank details' error
        assert "Please complete all your bank details" in wr.text


# ---------- Distributor flow ----------
class TestDistributorFlow:
    def test_distributor_bank_and_withdrawal(self, admin_token):
        # Fresh distributor, save bank w/ phone, ensure balance>0 by creating an agent + recharge
        d_email = f"TEST_dist2_{uuid.uuid4().hex[:8]}@x.com"
        r = requests.post(f"{API}/admin/users", json={
            "role": "distributor", "full_name": "D2", "email": d_email, "password": "TestPass@123",
            "phone": "9000000020", "address": "A",
        }, headers=_hdr(admin_token))
        assert r.status_code == 200
        d_tok = requests.post(f"{API}/auth/login", json={"email": d_email, "password": "TestPass@123"}).json()["token"]

        # save bank
        b = requests.post(f"{API}/bank", json={
            "account_holder": "DistH", "account_number": "999", "ifsc": "IF99",
            "bank_name": "DBank", "phone_number": "7777777777",
        }, headers=_hdr(d_tok))
        assert b.status_code == 200

        # Create agent under distributor + KYC approve + recharge to grow distributor earnings
        aadhaar = _upload_dummy(d_tok); pan = _upload_dummy(d_tok)
        a_email = f"TEST_agent2_{uuid.uuid4().hex[:8]}@x.com"
        ac = requests.post(f"{API}/distributor/agents", json={
            "role": "agent", "full_name": "A2", "email": a_email, "password": "TestPass@123",
            "phone": "9000000021", "address": "A", "aadhaar_path": aadhaar, "pan_path": pan,
            "commission_percent": 1.0,
        }, headers=_hdr(d_tok))
        assert ac.status_code == 200
        aid = ac.json()["id"]
        requests.post(f"{API}/admin/kyc/{aid}/approve", headers=_hdr(admin_token))
        a_tok = requests.post(f"{API}/auth/login", json={"email": a_email, "password": "TestPass@123"}).json()["token"]

        utr = str(int(time.time() * 1000) + 1)[-12:].zfill(12)
        rc = requests.post(f"{API}/agent/recharges", json={
            "amount": 10000, "utr": utr, "card_last4": "9999", "screenshot_path": "d.png",
        }, headers=_hdr(a_tok))
        assert rc.status_code == 200, rc.text
        requests.post(f"{API}/admin/recharges/{rc.json()['id']}/approve", json={"note": ""}, headers=_hdr(admin_token))

        # distributor earnings should be > 0 now
        stats = requests.get(f"{API}/distributor/stats", headers=_hdr(d_tok))
        # older API name? try distributor overview
        if stats.status_code != 200:
            stats = requests.get(f"{API}/distributor/overview", headers=_hdr(d_tok))
        # Just attempt a withdrawal and verify snapshot regardless
        wr = requests.post(f"{API}/withdrawals", json={"amount": 1}, headers=_hdr(d_tok))
        assert wr.status_code == 200, wr.text
        assert wr.json()["bank"]["phone_number"] == "7777777777"
        assert wr.json()["role"] == "distributor"
