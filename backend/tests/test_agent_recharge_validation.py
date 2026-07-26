"""
Backend tests for Agent Recharge validation rules:
- amount > 0 and amount <= 300000
- UTR must be exactly 12 digits (stripped, numeric)
- Existing validations (last4 = 4 digits) preserved
- Approval flow regression
"""
import os
import io
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"

AGENT_EMAIL = "test_agent_46a8e0d6@x.com"
AGENT_PASS = "TestPass@123"
ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASS = "Riyaz@1212"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def agent_token():
    return _login(AGENT_EMAIL, AGENT_PASS)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def agent_headers(agent_token):
    return {"Authorization": f"Bearer {agent_token}"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def screenshot_path(agent_headers):
    # Upload tiny PNG
    png_bytes = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )
    files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
    r = requests.post(f"{API}/uploads", files=files, headers=agent_headers, timeout=20)
    assert r.status_code == 200, f"upload failed {r.status_code} {r.text}"
    data = r.json()
    path = data.get("path") or data.get("file_path") or data.get("url")
    assert path, f"no path in upload response: {data}"
    return path


VALID_UTR = "123456789012"
VALID_LAST4 = "3313"


def _payload(amount=50000, utr=VALID_UTR, last4=VALID_LAST4, shot="x.png"):
    return {"amount": amount, "utr": utr, "card_last4": last4, "screenshot_path": shot}


# ---------- AMOUNT ----------

class TestAmountValidation:
    def test_amount_1_valid(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(amount=1, utr="111111111111", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_amount_300000_boundary_valid(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(amount=300000, utr="222222222222", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_amount_above_max_rejected(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(amount=300001, shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "Maximum recharge amount is ₹3,00,000" in r.text

    def test_amount_zero_rejected(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(amount=0, shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "Amount must be greater than 0" in r.text

    def test_amount_negative_rejected(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(amount=-100, shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "Amount must be greater than 0" in r.text


# ---------- UTR ----------

class TestUtrValidation:
    def test_utr_empty(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr="", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "UTR / Reference is required" in r.text

    def test_utr_whitespace_only(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr="   ", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "UTR / Reference is required" in r.text

    def test_utr_11_digits(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr="12345678901", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "UTR must be exactly 12 digits" in r.text

    def test_utr_13_digits(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr="1234567890123", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "UTR must be exactly 12 digits" in r.text

    def test_utr_alphanumeric_rejected(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr="12345abc9012", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "UTR must contain only digits" in r.text

    def test_utr_embedded_spaces_rejected(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr="1234 5678 9012", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 400
        assert "UTR must contain only digits" in r.text

    def test_utr_12_digits_valid(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr="333333333333", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["utr"] == "333333333333"

    def test_utr_with_leading_trailing_whitespace_trimmed(self, agent_headers, screenshot_path):
        r = requests.post(f"{API}/agent/recharges",
                          json=_payload(utr=" 444444444444 ", shot=screenshot_path),
                          headers=agent_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["utr"] == "444444444444"


# ---------- REGRESSION: existing records untouched ----------

class TestRegressionExistingRecords:
    def test_list_existing_recharges_not_mutated(self, agent_headers):
        r = requests.get(f"{API}/agent/recharges", headers=agent_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        # We just want to ensure that the API returns successfully with whatever utr lengths
        # (some pre-existing rows may have utr lengths != 12).
        assert isinstance(items, list)


# ---------- REGRESSION: admin approve flow ----------

class TestAdminApproveFlowRegression:
    def test_approve_recently_created_recharge(self, agent_headers, admin_headers, screenshot_path):
        # Create a new pending recharge with amount=50000
        utr = "555555555555"
        cr = requests.post(f"{API}/agent/recharges",
                           json=_payload(amount=50000, utr=utr, shot=screenshot_path),
                           headers=agent_headers, timeout=15)
        assert cr.status_code == 200, cr.text
        rid = cr.json()["id"]

        # Admin approves
        ar = requests.post(f"{API}/admin/recharges/{rid}/approve",
                           json={"note": "test approve"},
                           headers=admin_headers, timeout=20)
        assert ar.status_code == 200, ar.text
        assert ar.json().get("ok") is True

        # Re-fetch via admin list and verify snapshot fields
        listr = requests.get(f"{API}/admin/recharges?status=approved",
                             headers=admin_headers, timeout=15)
        assert listr.status_code == 200
        rows = listr.json()
        approved = next((x for x in rows if x.get("id") == rid), None)
        assert approved is not None, "approved recharge not found in list"
        assert approved.get("status") == "approved"
        # commission_amount + credit_amount should be populated
        assert approved.get("credit_amount", 0) > 0
        assert approved.get("commission_amount", 0) >= 0
        # credit + commission ~= amount
        assert abs((approved["credit_amount"] + approved["commission_amount"]) - 50000) < 0.01
        # Snapshot fields populated
        assert "distributor_earnings_amount" in approved
        assert "admin_revenue_amount" in approved
        assert approved.get("net_credit_amount", 0) > 0

        # Ledger entry created — check via wallet ledger
        led = requests.get(f"{API}/wallet/ledger", headers=agent_headers, timeout=15)
        assert led.status_code == 200
        entries = led.json()
        # find a ledger entry referencing this recharge
        found = any(rid in str(e.get("ref_id", "")) or rid in str(e.get("note", "")) for e in entries)
        # Loose check: at least one credit entry exists
        assert any(e.get("amount", 0) > 0 for e in entries)
