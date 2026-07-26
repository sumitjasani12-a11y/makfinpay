"""
Backend tests for MASTER DISTRIBUTOR (MD) — 4-tier hierarchy feature.

Covers:
- Admin creates MD via /api/admin/users (role=master_distributor)
- MD login + /auth/me role
- MD creates distributor + direct agent via /api/master-distributor/users
- Distributor-under-MD creates agent — inherits MD chain
- 3-way commission split invariant on approved recharge (admin+md+dist == total)
- MD stats, listings, downline, PDF export
- MD withdrawal flow (create/approve/reject; earnings decreases only on approve)
- MD access control: /api/admin/* -> 403 with MD token
- Cascade: default-commission update propagates to MD + downline
- Admin custom PATCH commission on MD cascades downline
- /admin/stats/financial: 3-way invariant, MD fields present
- /admin/stats: total_master_distributors present
- /admin/users?role=master_distributor listing enrichment
- /admin/master-distributors/{uid}/downline tri-section
- Historical recharge snapshots unchanged after default rate change
- Non-MD admin-created distributors/agents unchanged (regression)
"""

import io
import os
import uuid
import pytest
import requests
from pathlib import Path

# Load frontend .env to get REACT_APP_BACKEND_URL (public preview URL)
_env = Path("/app/frontend/.env")
if _env.exists():
    for line in _env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("makfinpay@gmail.com", "Riyaz@1212")
MD = ("mdtest@x.com", "TestPass@123")
DIST = ("disty@x.com", "TestPass@123")
AGENT = ("agentz@x.com", "TestPass@123")

TEST_PREFIX = "TEST_MD_"


# ------------------------------------------------------------------ helpers
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _short():
    return uuid.uuid4().hex[:8]


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="session")
def admin_ctx():
    tok, u = _login(*ADMIN)
    return {"token": tok, "user": u}


@pytest.fixture(scope="session")
def md_ctx():
    tok, u = _login(*MD)
    return {"token": tok, "user": u}


@pytest.fixture(scope="session")
def dist_ctx():
    tok, u = _login(*DIST)
    return {"token": tok, "user": u}


@pytest.fixture(scope="session")
def agent_ctx():
    tok, u = _login(*AGENT)
    return {"token": tok, "user": u}


# ---------------------------------------------------------- Auth / Role check
class TestAuth:
    def test_md_login_returns_role(self, md_ctx):
        assert md_ctx["user"]["role"] == "master_distributor"
        assert md_ctx["user"]["email"] == MD[0]

    def test_md_me_endpoint(self, md_ctx):
        r = requests.get(f"{API}/auth/me", headers=_h(md_ctx["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "master_distributor"
        assert data["email"] == MD[0]


# ---------------------------------------------------------- Admin creates MD
class TestAdminCreatesMD:
    def test_create_md_with_custom_commission(self, admin_ctx):
        payload = {
            "role": "master_distributor",
            "full_name": f"{TEST_PREFIX}NewMD",
            "email": f"{TEST_PREFIX.lower()}newmd_{_short()}@x.com",
            "password": "TestPass@123",
            "phone": "9000000000",
            "address": "MD Addr",
            "commission_percent": 1.5,
        }
        r = requests.post(f"{API}/admin/users", headers=_h(admin_ctx["token"]), json=payload)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "master_distributor"
        assert u["commission_percent"] == 1.5
        assert u["admin_pct"] == 1.5
        assert u["md_pct"] == 0.0
        assert u["dist_pct"] == 0.0
        assert u.get("md_id") in (None, "")
        assert u["commission_type"] == "custom"

    def test_create_md_default_commission(self, admin_ctx):
        payload = {
            "role": "master_distributor",
            "full_name": f"{TEST_PREFIX}DefMD",
            "email": f"{TEST_PREFIX.lower()}defmd_{_short()}@x.com",
            "password": "TestPass@123",
            "phone": "9000000001",
            "address": "MD Addr",
        }
        r = requests.post(f"{API}/admin/users", headers=_h(admin_ctx["token"]), json=payload)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "master_distributor"
        assert u["commission_type"] == "default"
        assert u["admin_pct"] == u["commission_percent"]
        assert u["md_pct"] == 0.0
        assert u["dist_pct"] == 0.0


# ---------------------------------------------------------- MD creates users
class TestMDCreatesUsers:
    def test_md_creates_distributor(self, md_ctx):
        payload = {
            "role": "distributor",
            "full_name": f"{TEST_PREFIX}Dist",
            "email": f"{TEST_PREFIX.lower()}dist_{_short()}@x.com",
            "password": "TestPass@123",
            "phone": "9111111111",
            "address": "Addr",
            "commission_percent": 0.3,
        }
        r = requests.post(f"{API}/master-distributor/users",
                          headers=_h(md_ctx["token"]), json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        md_rate = float(md_ctx["user"]["commission_percent"])
        assert d["role"] == "distributor"
        assert d["admin_pct"] == md_rate
        assert d["md_pct"] == 0.3
        assert d["dist_pct"] == 0.0
        assert d["md_id"] == md_ctx["user"]["id"]
        assert d["parent_id"] == md_ctx["user"]["id"]
        assert d["created_by_role"] == "master_distributor"
        assert round(d["commission_percent"], 4) == round(md_rate + 0.3, 4)

    def test_md_creates_direct_agent(self, md_ctx):
        payload = {
            "role": "agent",
            "full_name": f"{TEST_PREFIX}DirectAgent",
            "email": f"{TEST_PREFIX.lower()}dagt_{_short()}@x.com",
            "password": "TestPass@123",
            "phone": "9222222222",
            "address": "Addr",
            "commission_percent": 0.5,
            "aadhaar_path": "/uploads/fake_aadhaar.png",
            "pan_path": "/uploads/fake_pan.png",
        }
        r = requests.post(f"{API}/master-distributor/users",
                          headers=_h(md_ctx["token"]), json=payload)
        assert r.status_code == 200, r.text
        a = r.json()
        md_rate = float(md_ctx["user"]["commission_percent"])
        assert a["role"] == "agent"
        assert a["admin_pct"] == md_rate
        assert a["md_pct"] == 0.5
        assert a["dist_pct"] == 0.0
        assert a["md_id"] == md_ctx["user"]["id"]
        assert a["parent_id"] == md_ctx["user"]["id"]
        assert a["created_by_role"] == "master_distributor"
        assert a["kyc_status"] == "pending"

    def test_distributor_under_md_creates_agent_inherits_md_chain(self, dist_ctx, md_ctx):
        payload = {
            "role": "agent",
            "full_name": f"{TEST_PREFIX}InhAgent",
            "email": f"{TEST_PREFIX.lower()}inhagt_{_short()}@x.com",
            "password": "TestPass@123",
            "phone": "9333333333",
            "address": "Addr",
            "commission_percent": 0.2,
            "aadhaar_path": "/uploads/fake_aadhaar.png",
            "pan_path": "/uploads/fake_pan.png",
        }
        r = requests.post(f"{API}/distributor/agents",
                          headers=_h(dist_ctx["token"]), json=payload)
        assert r.status_code == 200, r.text
        a = r.json()
        md_rate = float(md_ctx["user"]["commission_percent"])
        d_md_pct = float(dist_ctx["user"].get("md_pct", 0.0))
        assert a["admin_pct"] == md_rate
        assert a["md_pct"] == d_md_pct
        assert a["dist_pct"] == 0.2
        assert a["md_id"] == md_ctx["user"]["id"]
        assert a["parent_id"] == dist_ctx["user"]["id"]
        assert a["created_by_role"] == "distributor"


# ---------------------------------------------------------- MD listings/stats
class TestMDPanel:
    def test_md_stats_shape(self, md_ctx):
        r = requests.get(f"{API}/master-distributor/stats",
                         headers=_h(md_ctx["token"]))
        assert r.status_code == 200
        s = r.json()
        for k in ("distributors", "agents", "pending_recharges",
                  "approved_recharges", "earnings", "available_for_withdrawal"):
            assert k in s, f"missing key {k}"

    def test_md_lists_only_own_distributors(self, md_ctx):
        r = requests.get(f"{API}/master-distributor/distributors",
                         headers=_h(md_ctx["token"]))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for it in items:
            assert it["md_id"] == md_ctx["user"]["id"]
            assert it["role"] == "distributor"
            assert "earnings" in it

    def test_md_lists_all_downline_agents(self, md_ctx):
        r = requests.get(f"{API}/master-distributor/agents",
                         headers=_h(md_ctx["token"]))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for it in items:
            assert it["md_id"] == md_ctx["user"]["id"]
            assert it["role"] == "agent"
            assert "creator_name" in it
            if it.get("created_by_role") == "master_distributor":
                assert it["creator_name"] == "Direct"

    def test_md_recharges_readonly(self, md_ctx):
        r = requests.get(f"{API}/master-distributor/recharges",
                         headers=_h(md_ctx["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------------------------------------------------- Access control
class TestMDAccessControl:
    """MD token MUST be rejected on /api/admin/* endpoints."""

    @pytest.mark.parametrize("method,path", [
        ("GET", "/admin/stats"),
        ("GET", "/admin/stats/financial"),
        ("GET", "/admin/users?role=distributor"),
        ("GET", "/admin/master-distributors/x/downline"),
        ("GET", "/admin/withdrawals"),
        ("GET", "/admin/recharges"),
    ])
    def test_md_cannot_hit_admin_endpoints(self, md_ctx, method, path):
        r = requests.request(method, f"{API}{path}", headers=_h(md_ctx["token"]))
        assert r.status_code == 403, f"{method} {path} expected 403, got {r.status_code}: {r.text[:200]}"


# ---------------------------------------------------------- 3-way commission split
class TestCommissionSplitInvariant:
    def test_existing_agentz_approved_recharge_snapshot(self, admin_ctx, agent_ctx):
        """Verify the pre-seeded approved recharge on agentz@x.com has correct 3-way split.
        Spec math: Admin MD 1.0%, MD→Dist markup 0.3%, Dist→Agent markup 0.2%.
        On a ₹1,00,000 recharge: admin=1000, md=300, dist=200, total=1500, net_credit=98500."""
        r = requests.get(f"{API}/agent/recharges", headers=_h(agent_ctx["token"]))
        assert r.status_code == 200, r.text
        recharges = r.json()
        approved = [x for x in recharges if x.get("status") == "approved"]
        assert approved, "expected pre-seeded approved recharge for agentz@x.com"
        # Take any approved recharge with MD snapshot
        candidates = [x for x in approved if x.get("md_id") and x.get("amount") == 100000]
        assert candidates, f"expected an approved 100000 recharge with md_id snapshot; got {approved}"
        rec = candidates[0]
        # Invariant: admin + md + dist == total
        admin_rev = float(rec["admin_revenue_amount"])
        md_earn = float(rec["md_earnings_amount"])
        dist_earn = float(rec["distributor_earnings_amount"])
        total = float(rec["total_commission_amount"])
        assert round(admin_rev + md_earn + dist_earn, 2) == round(total, 2), \
            f"invariant broken: {admin_rev}+{md_earn}+{dist_earn} != {total}"
        # Spec values
        assert admin_rev == 1000.0, f"admin_revenue expected 1000, got {admin_rev}"
        assert md_earn == 300.0, f"md_earnings expected 300, got {md_earn}"
        assert dist_earn == 200.0, f"distributor_earnings expected 200, got {dist_earn}"
        assert total == 1500.0
        assert float(rec["net_credit_amount"]) == 98500.0

    def test_financial_stats_invariant_lifetime(self, admin_ctx):
        r = requests.get(f"{API}/admin/stats/financial?range=lifetime",
                         headers=_h(admin_ctx["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert round(d["admin_revenue"] + d["md_earnings"] + d["distributor_earnings"], 2) \
            == round(d["total_revenue"], 2), f"3-way sum invariant broken: {d}"
        # New MD fields present
        for k in ("total_md_earnings", "md_withdrawals_approved"):
            assert k in d, f"missing key {k}"

    def test_admin_stats_has_total_master_distributors(self, admin_ctx):
        r = requests.get(f"{API}/admin/stats", headers=_h(admin_ctx["token"]))
        assert r.status_code == 200
        assert "total_master_distributors" in r.json()


# ---------------------------------------------------------- Admin listings
class TestAdminListings:
    def test_admin_lists_mds(self, admin_ctx):
        r = requests.get(f"{API}/admin/users?role=master_distributor",
                         headers=_h(admin_ctx["token"]))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) > 0
        for it in items:
            assert it["role"] == "master_distributor"
            # Enrichment
            assert "earnings" in it
            assert "distributors_count" in it
            assert "agents_count" in it

    def test_admin_lists_mds_paginated(self, admin_ctx):
        r = requests.get(f"{API}/admin/users?role=master_distributor&paginated=true&page=1&page_size=5",
                         headers=_h(admin_ctx["token"]))
        assert r.status_code == 200
        d = r.json()
        for k in ("items", "total", "page", "page_size"):
            assert k in d
        assert d["page_size"] == 5

    def test_admin_lists_distributors_created_by(self, admin_ctx):
        r = requests.get(f"{API}/admin/users?role=distributor",
                         headers=_h(admin_ctx["token"]))
        assert r.status_code == 200
        items = r.json()
        # Look for a distributor with md_id (should have creator_name == MD name)
        with_md = [x for x in items if x.get("md_id")]
        without_md = [x for x in items if not x.get("md_id")]
        for it in with_md:
            assert it.get("creator_name") not in (None, "", "Admin"), \
                f"expected MD name, got {it.get('creator_name')} on {it['email']}"
        for it in without_md:
            assert it.get("creator_name") == "Admin", \
                f"expected 'Admin', got {it.get('creator_name')} on {it['email']}"

    def test_admin_md_downline(self, admin_ctx, md_ctx):
        r = requests.get(f"{API}/admin/master-distributors/{md_ctx['user']['id']}/downline",
                         headers=_h(admin_ctx["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("master_distributor", "distributors", "direct_agents", "distributor_agents"):
            assert k in d
        assert d["master_distributor"]["id"] == md_ctx["user"]["id"]
        for x in d["distributors"]:
            assert x["md_id"] == md_ctx["user"]["id"]
            assert x["role"] == "distributor"
        for x in d["direct_agents"]:
            assert x["md_id"] == md_ctx["user"]["id"]
            assert x["created_by_role"] == "master_distributor"
        for x in d["distributor_agents"]:
            assert x["md_id"] == md_ctx["user"]["id"]

    def test_admin_md_downline_404_for_bad_uid(self, admin_ctx):
        r = requests.get(f"{API}/admin/master-distributors/doesnotexist/downline",
                         headers=_h(admin_ctx["token"]))
        assert r.status_code == 404


# ---------------------------------------------------------- PDF export
class TestPDFExport:
    def test_master_distributor_pdf_export(self, admin_ctx):
        r = requests.get(f"{API}/admin/exports/master_distributor.pdf",
                         headers={"Authorization": f"Bearer {admin_ctx['token']}"})
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", "expected PDF magic bytes"
        assert len(r.content) > 500

    def test_distributor_pdf_export_still_works(self, admin_ctx):
        r = requests.get(f"{API}/admin/exports/distributor.pdf",
                         headers={"Authorization": f"Bearer {admin_ctx['token']}"})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_agent_pdf_export_still_works(self, admin_ctx):
        r = requests.get(f"{API}/admin/exports/agent.pdf",
                         headers={"Authorization": f"Bearer {admin_ctx['token']}"})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# ---------------------------------------------------------- MD withdrawal flow
class TestMDWithdrawal:
    def test_md_withdrawal_full_cycle(self, admin_ctx, md_ctx):
        # First ensure bank details exist
        bank_payload = {
            "account_holder": "MD Test",
            "account_number": "1234567890",
            "ifsc": "HDFC0000123",
            "bank_name": "HDFC Bank",
            "phone_number": "9999999999",
        }
        rb = requests.post(f"{API}/bank", headers=_h(md_ctx["token"]), json=bank_payload)
        assert rb.status_code == 200, rb.text

        # Check current earnings
        s = requests.get(f"{API}/master-distributor/stats", headers=_h(md_ctx["token"])).json()
        earnings_before = float(s["earnings"])
        available_before = float(s["available_for_withdrawal"])
        if available_before < 1:
            pytest.skip("MD has no available balance to withdraw; skipping cycle")

        # Create withdrawal for ₹1 (safe small amount)
        amt = 1.0
        wr = requests.post(f"{API}/withdrawals",
                           headers=_h(md_ctx["token"]),
                           json={"amount": amt})
        assert wr.status_code == 200, wr.text
        wid = wr.json()["id"]

        # After creating, earnings should still be the same (only paid_out on approved deducts)
        s2 = requests.get(f"{API}/master-distributor/stats", headers=_h(md_ctx["token"])).json()
        assert float(s2["earnings"]) == earnings_before
        # available_for_withdrawal excludes pending
        assert float(s2["available_for_withdrawal"]) == round(available_before - amt, 2)

        # Admin approves
        ar = requests.post(f"{API}/admin/withdrawals/{wid}/approve",
                           headers=_h(admin_ctx["token"]),
                           json={"note": "test"})
        assert ar.status_code == 200, ar.text

        # After approve, earnings decreases
        s3 = requests.get(f"{API}/master-distributor/stats", headers=_h(md_ctx["token"])).json()
        assert float(s3["earnings"]) == round(earnings_before - amt, 2), \
            f"earnings did not decrease: before={earnings_before} after={s3['earnings']}"

    def test_md_withdrawal_rejected_earnings_unchanged(self, admin_ctx, md_ctx):
        s = requests.get(f"{API}/master-distributor/stats", headers=_h(md_ctx["token"])).json()
        earnings_before = float(s["earnings"])
        available_before = float(s["available_for_withdrawal"])
        if available_before < 1:
            pytest.skip("MD has no available balance to withdraw; skipping reject test")

        wr = requests.post(f"{API}/withdrawals",
                           headers=_h(md_ctx["token"]),
                           json={"amount": 1.0})
        assert wr.status_code == 200, wr.text
        wid = wr.json()["id"]
        rr = requests.post(f"{API}/admin/withdrawals/{wid}/reject",
                           headers=_h(admin_ctx["token"]),
                           json={"note": "test-reject"})
        assert rr.status_code == 200, rr.text

        s2 = requests.get(f"{API}/master-distributor/stats", headers=_h(md_ctx["token"])).json()
        assert float(s2["earnings"]) == earnings_before, \
            f"earnings changed on reject: before={earnings_before} after={s2['earnings']}"

    def test_md_withdrawal_over_available_rejected(self, md_ctx):
        s = requests.get(f"{API}/master-distributor/stats", headers=_h(md_ctx["token"])).json()
        available = float(s["available_for_withdrawal"])
        r = requests.post(f"{API}/withdrawals",
                          headers=_h(md_ctx["token"]),
                          json={"amount": available + 10000})
        assert r.status_code == 400
        assert "insufficient" in r.text.lower() or "available" in r.text.lower()


# ---------------------------------------------------------- Cascade tests
class TestCommissionCascade:
    def test_admin_patch_md_commission_cascades_downline(self, admin_ctx, md_ctx):
        """PATCH /api/admin/users/{md.id}/commission with new pct cascades downline."""
        md_id = md_ctx["user"]["id"]
        original = float(md_ctx["user"]["commission_percent"])
        new_pct = round(original + 0.1, 4)
        try:
            r = requests.patch(f"{API}/admin/users/{md_id}/commission",
                               headers=_h(admin_ctx["token"]),
                               json={"commission_percent": new_pct})
            assert r.status_code == 200, r.text

            # Check MD.commission_percent updated
            r2 = requests.get(f"{API}/admin/users/{md_id}",
                              headers=_h(admin_ctx["token"]))
            assert r2.status_code == 200
            md_after = r2.json()["user"]
            assert float(md_after["commission_percent"]) == new_pct
            assert float(md_after["admin_pct"]) == new_pct

            # Check every distributor + agent under this MD has admin_pct=new_pct
            dl = requests.get(f"{API}/admin/master-distributors/{md_id}/downline",
                              headers=_h(admin_ctx["token"])).json()
            for d in dl["distributors"]:
                assert float(d["admin_pct"]) == new_pct, \
                    f"distributor {d['email']} admin_pct not cascaded: {d['admin_pct']}"
            for a in dl["direct_agents"] + dl["distributor_agents"]:
                assert float(a["admin_pct"]) == new_pct, \
                    f"agent {a['email']} admin_pct not cascaded: {a['admin_pct']}"
        finally:
            # Restore original
            requests.patch(f"{API}/admin/users/{md_id}/commission",
                           headers=_h(admin_ctx["token"]),
                           json={"commission_percent": original})

    def test_historical_recharges_unchanged_after_cascade(self, admin_ctx, agent_ctx, md_ctx):
        """Existing snapshot must NOT be recomputed after commission change."""
        r = requests.get(f"{API}/agent/recharges", headers=_h(agent_ctx["token"]))
        approved = [x for x in r.json() if x.get("status") == "approved" and x.get("amount") == 100000]
        if not approved:
            pytest.skip("no historical recharge to check")
        rec = approved[0]
        # After all the cascade tests above ran, this snapshot must still equal spec values.
        assert rec["admin_revenue_amount"] == 1000.0
        assert rec["md_earnings_amount"] == 300.0
        assert rec["distributor_earnings_amount"] == 200.0


# ---------------------------------------------------------- MD markup PATCH
class TestMDMarkupPatch:
    def test_md_updates_own_distributor_markup(self, md_ctx):
        # Find a distributor to patch
        r = requests.get(f"{API}/master-distributor/distributors",
                         headers=_h(md_ctx["token"]))
        dists = r.json()
        if not dists:
            pytest.skip("no distributor under MD to patch")
        d = dists[0]
        original = float(d.get("md_pct", 0.0))
        new_markup = round(original + 0.05, 4)
        try:
            pr = requests.patch(
                f"{API}/master-distributor/users/{d['id']}/markup",
                headers=_h(md_ctx["token"]),
                json={"markup_percent": new_markup},
            )
            assert pr.status_code == 200, pr.text
            # Re-fetch and confirm
            r2 = requests.get(f"{API}/master-distributor/distributors",
                              headers=_h(md_ctx["token"]))
            after = [x for x in r2.json() if x["id"] == d["id"]][0]
            assert round(float(after["md_pct"]), 4) == new_markup
        finally:
            requests.patch(
                f"{API}/master-distributor/users/{d['id']}/markup",
                headers=_h(md_ctx["token"]),
                json={"markup_percent": original},
            )

    def test_md_cannot_patch_non_downline_user(self, md_ctx, admin_ctx):
        # find a distributor NOT under this MD
        all_dists = requests.get(f"{API}/admin/users?role=distributor",
                                 headers=_h(admin_ctx["token"])).json()
        others = [x for x in all_dists if x.get("md_id") != md_ctx["user"]["id"]]
        if not others:
            pytest.skip("no distributor outside MD downline")
        target = others[0]
        r = requests.patch(
            f"{API}/master-distributor/users/{target['id']}/markup",
            headers=_h(md_ctx["token"]),
            json={"markup_percent": 0.1},
        )
        assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}"


# ---------------------------------------------------------- Regression sanity
class TestRegression:
    def test_admin_created_distributor_has_no_md_chain(self, admin_ctx):
        payload = {
            "role": "distributor",
            "full_name": f"{TEST_PREFIX}RegDist",
            "email": f"{TEST_PREFIX.lower()}regdist_{_short()}@x.com",
            "password": "TestPass@123",
            "phone": "9444444444",
            "address": "Addr",
        }
        r = requests.post(f"{API}/admin/users", headers=_h(admin_ctx["token"]), json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("md_id") in (None, "")
        assert d["md_pct"] == 0.0
        assert d["dist_pct"] == 0.0
        # admin_pct should equal default commission
        assert d["admin_pct"] > 0

    def test_distributor_stats_unaffected(self, dist_ctx):
        # sanity: distributor's /distributor/stats still works
        r = requests.get(f"{API}/distributor/stats", headers=_h(dist_ctx["token"]))
        assert r.status_code == 200
        for k in ("agents", "pending_recharges", "approved_recharges", "earnings"):
            assert k in r.json()
