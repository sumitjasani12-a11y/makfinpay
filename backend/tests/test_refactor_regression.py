"""
Refactor regression tests for MAK FIN PAY.
Verifies behaviors after extraction of helpers, dataclass, and module splits.
Focus: admin_stats/financial across ranges, commission_type/creator_name in user APIs,
distributor markup math, commission cascade.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fintech-bill-pay.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "makfinpay@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD env var is required")

SUFFIX = uuid.uuid4().hex[:8]
DIST_EMAIL = f"TEST_rf_dist_{SUFFIX}@example.com"
DIST_PASS = "Distributor@123"
AGENT_BY_ADMIN_EMAIL = f"TEST_rf_agent_admin_{SUFFIX}@example.com"
AGENT_BY_DIST_EMAIL = f"TEST_rf_agent_dist_{SUFFIX}@example.com"
AGENT_PASS = "Agent@123"

s = {}


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def setup_admin_and_cleanup():
    # admin login
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    s["admin_token"] = r.json()["token"]

    # capture original default commission to restore at teardown
    rcs = requests.get(f"{API}/admin/settings/commission", headers=H(s["admin_token"]), timeout=30)
    s["original_default_pct"] = float(rcs.json().get("default_percent", 1.2))

    yield

    # restore default commission
    try:
        requests.put(f"{API}/admin/settings/commission",
                     json={"default_percent": s["original_default_pct"]},
                     headers=H(s["admin_token"]), timeout=30)
    except Exception:
        pass

    # delete TEST_rf_ users
    try:
        from pymongo import MongoClient
        mu = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip('"').strip("'")
        dn = os.environ.get("DB_NAME", "makfinpay_db").strip('"').strip("'")
        c = MongoClient(mu)
        c[dn].users.delete_many({"email": {"$regex": "^TEST_rf_"}})
        c.close()
    except Exception:
        pass


# ---------- Admin Stats Financial across ranges ----------
class TestAdminStatsFinancial:
    RANGES = ["today", "yesterday", "7d", "30d", "lifetime"]

    @pytest.mark.parametrize("rng", RANGES)
    def test_range_returns_200_and_keys(self, rng):
        r = requests.get(f"{API}/admin/stats/financial", params={"range": rng},
                         headers=H(s["admin_token"]), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["range", "total_revenue", "admin_revenue", "distributor_earnings",
                  "recharge_approved", "total_wallet", "total_txn_amount",
                  "total_txn_count", "transaction_revenue"]:
            assert k in data, f"missing key {k} in {rng}: {data}"
        # invariant: total_revenue == admin_revenue + distributor_earnings (within rounding)
        diff = abs(data["total_revenue"] - (data["admin_revenue"] + data["distributor_earnings"]))
        assert diff < 0.05, f"{rng}: total_revenue {data['total_revenue']} != admin {data['admin_revenue']} + dist {data['distributor_earnings']}"

    def test_custom_range(self):
        r = requests.get(f"{API}/admin/stats/financial",
                         params={"range": "custom", "from": "2024-01-01", "to": "2026-12-31"},
                         headers=H(s["admin_token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        diff = abs(d["total_revenue"] - (d["admin_revenue"] + d["distributor_earnings"]))
        assert diff < 0.05


# ---------- Commission type & creator_name ----------
class TestCommissionTypeAndCreatorName:
    def test_admin_creates_distributor_default(self):
        # get current default
        rcs = requests.get(f"{API}/admin/settings/commission", headers=H(s["admin_token"]), timeout=30)
        default_pct = float(rcs.json()["default_percent"])
        s["default_pct"] = default_pct
        body = {"role": "distributor", "full_name": "RF Dist", "email": DIST_EMAIL,
                "password": DIST_PASS, "phone": "9999999999", "address": "x"}
        r = requests.post(f"{API}/admin/users", json=body, headers=H(s["admin_token"]), timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        s["dist_id"] = u["id"]
        assert u["role"] == "distributor"
        assert abs(float(u["commission_percent"]) - default_pct) < 1e-6, u
        assert u.get("commission_type") == "default", u

    def test_admin_creates_agent_creator_admin(self):
        body = {"role": "agent", "full_name": "RF AgentA", "email": AGENT_BY_ADMIN_EMAIL,
                "password": AGENT_PASS, "phone": "9777777777", "address": "x",
                "commission_percent": s["default_pct"],
                "aadhaar_path": "/uploads/rf_aadhaar.pdf", "pan_path": "/uploads/rf_pan.pdf"}
        r = requests.post(f"{API}/admin/users", json=body, headers=H(s["admin_token"]), timeout=30)
        assert r.status_code == 200, r.text
        s["agent_admin_id"] = r.json()["id"]
        # listing should report creator_name == 'Admin'
        rl = requests.get(f"{API}/admin/users?role=agent", headers=H(s["admin_token"]), timeout=30)
        assert rl.status_code == 200
        found = next((x for x in rl.json() if x["id"] == s["agent_admin_id"]), None)
        assert found is not None, "agent missing in listing"
        assert found.get("creator_name") == "Admin", found

    def test_distributor_login_and_create_agent_with_markup(self):
        rl = requests.post(f"{API}/auth/login", json={"email": DIST_EMAIL, "password": DIST_PASS}, timeout=30)
        assert rl.status_code == 200, rl.text
        s["dist_token"] = rl.json()["token"]
        base = s["default_pct"]
        markup = 0.3
        # Distributor sends commission_percent as MARKUP (post-refactor contract)
        body = {"role": "agent", "full_name": "RF AgentD", "email": AGENT_BY_DIST_EMAIL,
                "password": AGENT_PASS, "phone": "9666666666", "address": "x",
                "commission_percent": markup,
                "aadhaar_path": "/uploads/rf_aadhaar.pdf", "pan_path": "/uploads/rf_pan.pdf"}
        r = requests.post(f"{API}/distributor/agents", json=body, headers=H(s["dist_token"]), timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        s["agent_dist_id"] = u["id"]
        expected_total = round(base + markup, 4)
        assert abs(float(u["commission_percent"]) - expected_total) < 1e-3, u
        # base + markup math
        assert abs(float(u.get("base_commission", 0)) - base) < 1e-3, u
        assert abs(float(u.get("markup_commission", 0)) - markup) < 1e-3, u
        assert u.get("commission_type") == "custom", u

    def test_distributor_listing_has_earnings_field(self):
        rl = requests.get(f"{API}/admin/users?role=distributor", headers=H(s["admin_token"]), timeout=30)
        assert rl.status_code == 200
        d = next((x for x in rl.json() if x["id"] == s["dist_id"]), None)
        assert d is not None
        assert "earnings" in d, d
        assert isinstance(d["earnings"], (int, float))

    def test_admin_distributor_agents_endpoint(self):
        # Admin should be able to view agents of a distributor (used by View modal)
        r = requests.get(f"{API}/admin/distributors/{s['dist_id']}/agents",
                         headers=H(s["admin_token"]), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict) and "agents" in data, data
        agents = data["agents"]
        assert any(x["id"] == s["agent_dist_id"] for x in agents), agents


# ---------- Commission cascade ----------
class TestCommissionCascade:
    def test_change_default_cascades_to_default_distributors_and_admin_agents(self):
        new_default = round(s["default_pct"] + 0.1, 4)
        r = requests.put(f"{API}/admin/settings/commission",
                         json={"default_percent": new_default},
                         headers=H(s["admin_token"]), timeout=30)
        assert r.status_code == 200, r.text
        # distributor on default mode should now reflect new pct
        rl = requests.get(f"{API}/admin/users?role=distributor", headers=H(s["admin_token"]), timeout=30)
        d = next((x for x in rl.json() if x["id"] == s["dist_id"]), None)
        assert d is not None
        assert abs(float(d["commission_percent"]) - new_default) < 1e-6, d
        assert d.get("commission_type") == "default", d
        # admin-created default-mode agent should also cascade
        rl = requests.get(f"{API}/admin/users?role=agent", headers=H(s["admin_token"]), timeout=30)
        a = next((x for x in rl.json() if x["id"] == s["agent_admin_id"]), None)
        assert a is not None
        assert abs(float(a["commission_percent"]) - new_default) < 1e-6, a
