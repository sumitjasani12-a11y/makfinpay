"""
Regression test for the Distributor Withdrawal Blocked bug fix.

Source of truth:
    distributor earnings        = SUM(approved_recharge.distributor_earnings_amount)
                                  - SUM(approved_withdrawal.amount)
    available_for_withdrawal    = lifetime - (approved + pending) withdrawals

Agents continue using wallet_balance (regression).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env so the suite still resolves when env var is not exported
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"
DIST_EMAIL = "test_dist_2a03f52a@x.com"
DIST_PASSWORD = "TestPass@123"
AGENT_EMAIL = "test_agent_46a8e0d6@x.com"
AGENT_PASSWORD = "TestPass@123"


def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    data = _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.user = data["user"]
    return s


@pytest.fixture(scope="module")
def distributor_session():
    s = requests.Session()
    data = _login(s, DIST_EMAIL, DIST_PASSWORD)
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.user = data["user"]
    return s


@pytest.fixture(scope="module")
def agent_session():
    s = requests.Session()
    data = _login(s, AGENT_EMAIL, AGENT_PASSWORD)
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    s.user = data["user"]
    return s


# ----------- Helpers -----------
def _get_distributor_stats(sess):
    r = sess.get(f"{BASE_URL}/api/distributor/stats", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _admin_users(sess):
    r = sess.get(f"{BASE_URL}/api/admin/users", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _admin_get_user(sess, uid):
    r = sess.get(f"{BASE_URL}/api/admin/users/{uid}", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _ensure_bank(sess):
    bank = sess.get(f"{BASE_URL}/api/bank", timeout=20).json() or {}
    if not bank.get("account_number"):
        r = sess.post(
            f"{BASE_URL}/api/bank",
            json={
                "account_holder": "Test User",
                "account_number": "1234567890",
                "ifsc": "HDFC0000001",
                "bank_name": "HDFC",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text


# ============= TESTS =============
# Backend smoke: auth + base balance baseline ---------------------------------

class TestBaseline:
    def test_admin_login(self, admin_session):
        assert admin_session.user["role"] == "admin"

    def test_distributor_has_positive_earnings(self, distributor_session):
        stats = _get_distributor_stats(distributor_session)
        assert stats["earnings"] > 0, (
            f"Test distributor has no earnings, cannot exercise the flow. stats={stats}"
        )
        assert "available_for_withdrawal" in stats, "new field missing from /distributor/stats"
        assert stats["available_for_withdrawal"] <= stats["earnings"], (
            "available_for_withdrawal must never exceed earnings"
        )

    def test_admin_users_earnings_matches_dist_stats(self, admin_session, distributor_session):
        stats = _get_distributor_stats(distributor_session)
        users = _admin_users(admin_session)
        row = next(u for u in users if u["email"] == DIST_EMAIL)
        # admin table 'earnings' col must equal distributor /stats.earnings
        assert round(row["earnings"], 2) == round(stats["earnings"], 2), (
            f"admin /users.earnings={row['earnings']} != /distributor/stats.earnings={stats['earnings']}"
        )

    def test_admin_view_modal_earnings_matches(self, admin_session, distributor_session):
        """Frontend `_UserList.jsx` line 87 reads `distributor.earnings` from the
        row passed in as a prop, which itself comes from `/admin/users` row.
        So we re-assert the same source still aligns to /distributor/stats."""
        stats = _get_distributor_stats(distributor_session)
        users = _admin_users(admin_session)
        row = next(u for u in users if u["email"] == DIST_EMAIL)
        # this is the exact value the modal renders via `distributor.earnings ?? 0`
        assert round(row.get("earnings", -1), 2) == round(stats["earnings"], 2)


# Distributor withdraw happy path --------------------------------------------

@pytest.fixture(scope="module")
def baseline(admin_session, distributor_session):
    """Snapshot baseline numbers before mutating any state."""
    stats = _get_distributor_stats(distributor_session)
    return {
        "earnings_before": stats["earnings"],
        "available_before": stats["available_for_withdrawal"],
    }


class TestDistributorWithdrawalFlow:
    AMOUNT = 50.0  # small enough for the seeded ₹170

    def test_a_bank_details_present(self, distributor_session):
        _ensure_bank(distributor_session)
        bank = distributor_session.get(f"{BASE_URL}/api/bank", timeout=20).json()
        assert bank.get("account_number")

    def test_b_create_withdrawal_succeeds(self, distributor_session, baseline):
        assert baseline["available_before"] >= self.AMOUNT, (
            f"Not enough available ({baseline['available_before']}) to test ₹{self.AMOUNT} withdrawal"
        )
        r = distributor_session.post(
            f"{BASE_URL}/api/withdrawals",
            json={"amount": self.AMOUNT},
            timeout=20,
        )
        assert r.status_code == 200, (
            f"Distributor withdrawal MUST succeed (bug fix). Got {r.status_code}: {r.text}"
        )
        body = r.json()
        assert body["status"] == "pending"
        assert body["role"] == "distributor"
        assert body["amount"] == self.AMOUNT
        # remember for the next steps
        pytest.dist_withdraw_id = body["id"]

    def test_c_no_insufficient_wallet_error(self, distributor_session):
        # explicit guard: the exact string that was the bug
        r = distributor_session.post(
            f"{BASE_URL}/api/withdrawals", json={"amount": 1.0}, timeout=20
        )
        assert "Insufficient wallet balance" not in r.text, (
            f"Distributor still sees the old wallet-based error: {r.text}"
        )
        # cleanup this tiny test withdrawal: reject it via admin
        if r.status_code == 200:
            pytest.dist_extra_wid = r.json()["id"]

    def test_d_pending_decreases_available_not_earnings(
        self, distributor_session, baseline
    ):
        stats = _get_distributor_stats(distributor_session)
        # earnings (live balance) unchanged because nothing approved yet
        assert round(stats["earnings"], 2) == round(baseline["earnings_before"], 2), (
            "Earnings KPI must NOT decrease for pending withdrawals"
        )
        # available decreases by the pending amount(s) created in steps b + c
        pending_total = self.AMOUNT + (1.0 if hasattr(pytest, "dist_extra_wid") else 0.0)
        expected_available = round(baseline["available_before"] - pending_total, 2)
        assert round(stats["available_for_withdrawal"], 2) == expected_available, (
            f"Available {stats['available_for_withdrawal']} != expected {expected_available}"
        )

    def test_e_insufficient_earnings_rejected(self, distributor_session, baseline):
        # try to withdraw more than available
        too_much = baseline["earnings_before"] + 1000
        r = distributor_session.post(
            f"{BASE_URL}/api/withdrawals", json={"amount": too_much}, timeout=20
        )
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or "").lower()
        assert "insufficient earnings" in msg, f"Wrong error message: {msg}"
        # The OLD bug message must never resurface here
        assert "wallet" not in msg, f"Distributor error must not mention wallet: {msg}"

    def test_f_admin_reject_extra_withdrawal_releases_reservation(
        self, admin_session, distributor_session, baseline
    ):
        """Reject the small ₹1 one to validate reject branch for distributor.
        Available must go back up; earnings must not change.
        """
        if not hasattr(pytest, "dist_extra_wid"):
            pytest.skip("extra withdrawal was not created")
        wid = pytest.dist_extra_wid
        pre = _get_distributor_stats(distributor_session)
        r = admin_session.post(
            f"{BASE_URL}/api/admin/withdrawals/{wid}/reject",
            json={"note": "test reject"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        post = _get_distributor_stats(distributor_session)
        assert round(post["earnings"], 2) == round(pre["earnings"], 2), (
            "Earnings must not change on reject"
        )
        assert round(post["available_for_withdrawal"], 2) == round(
            pre["available_for_withdrawal"] + 1.0, 2
        ), "Reservation must be released on reject"

    def test_g_admin_approve_drops_earnings_everywhere(
        self, admin_session, distributor_session, baseline
    ):
        wid = pytest.dist_withdraw_id
        r = admin_session.post(
            f"{BASE_URL}/api/admin/withdrawals/{wid}/approve",
            json={"note": "approved"},
            timeout=20,
        )
        assert r.status_code == 200, r.text

        expected_earnings = round(baseline["earnings_before"] - self.AMOUNT, 2)

        # 1) Distributor /stats earnings
        stats = _get_distributor_stats(distributor_session)
        assert round(stats["earnings"], 2) == expected_earnings, (
            f"Dist /stats.earnings={stats['earnings']} expected {expected_earnings}"
        )
        # available also drops accordingly
        assert round(stats["available_for_withdrawal"], 2) == expected_earnings

        # 2 & 3) Admin Distributors table + 'View' modal (modal reuses table row)
        users = _admin_users(admin_session)
        row = next(u for u in users if u["email"] == DIST_EMAIL)
        assert round(row["earnings"], 2) == expected_earnings, (
            f"admin table earnings out of sync: {row['earnings']} != {expected_earnings}"
        )
        # modal earnings = same row.earnings prop (verified in baseline test)


# Agent withdrawal regression -------------------------------------------------

class TestAgentWithdrawalRegression:
    AMOUNT = 25.0

    def test_a_agent_wallet_positive(self, agent_session):
        w = agent_session.get(f"{BASE_URL}/api/wallet", timeout=20).json()
        assert w["balance"] > self.AMOUNT, f"Agent wallet too low to test: {w}"
        pytest.agent_wallet_before = w["balance"]

    def test_b_agent_can_withdraw_and_wallet_debits_immediately(self, agent_session):
        _ensure_bank(agent_session)
        r = agent_session.post(
            f"{BASE_URL}/api/withdrawals",
            json={"amount": self.AMOUNT},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["role"] == "agent"
        pytest.agent_wid = body["id"]

        # wallet should have been debited at request time (existing behavior)
        w = agent_session.get(f"{BASE_URL}/api/wallet", timeout=20).json()
        assert round(w["balance"], 2) == round(
            pytest.agent_wallet_before - self.AMOUNT, 2
        ), f"Agent wallet did not debit on withdraw create: {w}"

    def test_c_admin_approves_agent_withdrawal(self, admin_session, agent_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/withdrawals/{pytest.agent_wid}/approve",
            json={"note": "ok"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        # wallet unchanged on approve (it was already debited)
        w = agent_session.get(f"{BASE_URL}/api/wallet", timeout=20).json()
        assert round(w["balance"], 2) == round(
            pytest.agent_wallet_before - self.AMOUNT, 2
        ), "Wallet should be unchanged after approve (already debited)"
