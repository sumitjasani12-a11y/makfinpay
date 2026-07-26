"""
Iteration 18 — Backend tests for the new `total_distributor_earnings`
field in GET /api/admin/stats/financial.

Behaviour under test:
  1. Field is present, numeric, non-null in the response.
  2. Value equals SUM(per-distributor live earnings), where each per-distributor
     value = SUM(approved recharges' distributor_earnings_amount)
             − SUM(approved withdrawals for that distributor).
     Cross-checked against /api/admin/users?role=distributor per-row `earnings`.
  3. Value is INVARIANT across every date-range toggle (today, yesterday, last7,
     last30, lifetime, custom-far-past).
  4. Frozen and rejected distributors still contribute — the aggregation must
     not filter by status.
  5. Existing fields from iterations 17 and earlier remain present.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
assert MONGO_URL and DB_NAME, "MONGO_URL / DB_NAME must be set"

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"

TEST_PREFIX = "IT18TDE_"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    # Cleanup: only test data
    db.users.delete_many({"email": {"$regex": f"^{TEST_PREFIX}"}})
    db.recharges.delete_many({"agent_name": {"$regex": f"^{TEST_PREFIX}"}})
    db.withdrawals.delete_many({"user_name": {"$regex": f"^{TEST_PREFIX}"}})
    client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _get_financial(headers, params=None):
    r = requests.get(
        f"{BASE_URL}/api/admin/stats/financial",
        headers=headers,
        params=params or {"range": "lifetime"},
        timeout=20,
    )
    assert r.status_code == 200, f"financial GET failed: {r.status_code} {r.text}"
    return r.json()


def _get_admin_distributors(headers):
    r = requests.get(
        f"{BASE_URL}/api/admin/users?role=distributor",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200
    return r.json()


# ============================================================
# TestShape — field presence & type
# ============================================================
class TestShape:
    def test_field_present_and_numeric(self, admin_headers):
        data = _get_financial(admin_headers, {"range": "lifetime"})
        assert "total_distributor_earnings" in data, (
            "total_distributor_earnings missing from response"
        )
        val = data["total_distributor_earnings"]
        assert val is not None
        assert isinstance(val, (int, float))

    def test_field_non_negative_on_healthy_db(self, admin_headers):
        # In this env the live baseline is 4308.06 — should never be negative
        data = _get_financial(admin_headers, {"range": "lifetime"})
        assert data["total_distributor_earnings"] >= 0


# ============================================================
# TestSingleSourceOfTruth — cross-check with /admin/users
# ============================================================
class TestSingleSourceOfTruth:
    def test_matches_sum_of_admin_users_earnings(self, admin_headers):
        fin = _get_financial(admin_headers, {"range": "lifetime"})
        dists = _get_admin_distributors(admin_headers)
        # Sum per-row `earnings` from admin/users?role=distributor
        per_row_sum = round(
            sum(float(d.get("earnings") or 0) for d in dists), 2
        )
        endpoint = round(float(fin["total_distributor_earnings"]), 2)
        # `is_deleted:False` is applied by /admin/users but not by the financial
        # aggregation — allow a tiny drift only if soft-deleted distributors have
        # earnings; verify equality on THIS db (no soft-deleted distributors).
        assert abs(endpoint - per_row_sum) < 0.01, (
            f"total_distributor_earnings ({endpoint}) != sum of "
            f"admin/users earnings ({per_row_sum}). Diff = "
            f"{endpoint - per_row_sum:.4f}"
        )

    def test_matches_direct_mongo_computation(self, admin_headers, mongo_db):
        fin = _get_financial(admin_headers, {"range": "lifetime"})
        # Direct mongo computation via same formula as _distributor_earnings_batch
        dist_ids = [u["id"] for u in mongo_db.users.find({"role": "distributor"}, {"id": 1, "_id": 0})]
        # Lifetime approved recharge earnings per distributor
        pipeline_rech = [
            {"$match": {"status": "approved", "distributor_id": {"$in": dist_ids}}},
            {"$group": {"_id": "$distributor_id", "total": {"$sum": "$distributor_earnings_amount"}}},
        ]
        lifetime = {row["_id"]: round(row.get("total") or 0, 2)
                    for row in mongo_db.recharges.aggregate(pipeline_rech)}
        # Approved withdrawals (distributor role) — must subtract
        pipeline_wd = [
            {"$match": {"status": "approved", "user_id": {"$in": dist_ids}, "role": "distributor"}},
            {"$group": {"_id": "$user_id", "total": {"$sum": "$amount"}}},
        ]
        paid = {row["_id"]: round(row.get("total") or 0, 2)
                for row in mongo_db.withdrawals.aggregate(pipeline_wd)}
        expected = round(
            sum(lifetime.get(d, 0.0) - paid.get(d, 0.0) for d in dist_ids), 2
        )
        endpoint = round(float(fin["total_distributor_earnings"]), 2)
        assert abs(endpoint - expected) < 0.01, (
            f"total_distributor_earnings ({endpoint}) != direct-mongo expected "
            f"({expected}). Diff={endpoint - expected:.4f}"
        )


# ============================================================
# TestDateFilterInvariant — key behavioural test
# ============================================================
class TestDateFilterInvariant:
    def test_same_value_across_all_ranges(self, admin_headers):
        baseline = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]
        for r in ["today", "yesterday", "last7", "last30", "lifetime"]:
            data = _get_financial(admin_headers, {"range": r})
            assert data["total_distributor_earnings"] == baseline, (
                f"range={r} produced {data['total_distributor_earnings']} "
                f"expected invariant {baseline}"
            )

    def test_custom_far_past_range_still_returns_lifetime(self, admin_headers):
        baseline = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]
        data = _get_financial(admin_headers, {
            "range": "custom", "from": "1900-01-01", "to": "1900-12-31"
        })
        assert data["total_distributor_earnings"] == baseline, (
            "custom 1900 range altered total_distributor_earnings — "
            "field must be invariant to date filter"
        )

    def test_custom_far_future_range_still_returns_lifetime(self, admin_headers):
        baseline = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]
        data = _get_financial(admin_headers, {
            "range": "custom", "from": "2999-01-01", "to": "2999-12-31"
        })
        assert data["total_distributor_earnings"] == baseline


# ============================================================
# TestFrozenAndRejectedIncluded
# ============================================================
class TestFrozenAndRejectedIncluded:
    def test_frozen_distributor_earnings_still_counted(self, admin_headers, mongo_db):
        """Insert a distributor + approved recharge earning ₹500, then freeze
        the distributor via mongo. Verify total goes up by exactly 500."""
        baseline = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]

        dist_id = str(uuid.uuid4())
        agent_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        mongo_db.users.insert_one({
            "id": dist_id,
            "email": f"{TEST_PREFIX}frozen_dist_{dist_id[:6]}@x.com",
            "full_name": f"{TEST_PREFIX}FrozenDist",
            "role": "distributor",
            "frozen": True,   # <-- frozen
            "is_deleted": False,
            "created_at": now,
        })
        mongo_db.users.insert_one({
            "id": agent_id,
            "email": f"{TEST_PREFIX}frozen_ag_{agent_id[:6]}@x.com",
            "full_name": f"{TEST_PREFIX}FrozenAgent",
            "role": "agent",
            "parent_id": dist_id,
            "is_deleted": False,
            "kyc_status": "approved",
            "created_at": now,
        })
        mongo_db.recharges.insert_one({
            "id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "agent_name": f"{TEST_PREFIX}FrozenAgent",
            "distributor_id": dist_id,
            "amount": 10000.0,
            "distributor_earnings_amount": 500.0,
            "commission_amount": 700.0,
            "status": "approved",
            "created_at": now,
            "reviewed_at": now,
        })
        try:
            after = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]
            assert round(after - baseline, 2) == 500.0, (
                f"Frozen distributor's ₹500 earnings not included. "
                f"baseline={baseline} after={after} delta={after - baseline}"
            )
        finally:
            mongo_db.recharges.delete_many({"distributor_id": dist_id})
            mongo_db.users.delete_many({"id": {"$in": [dist_id, agent_id]}})

    def test_rejected_kyc_distributor_earnings_still_counted(self, admin_headers, mongo_db):
        """Same as above but with kyc_status=rejected."""
        baseline = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]

        dist_id = str(uuid.uuid4())
        agent_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        mongo_db.users.insert_one({
            "id": dist_id,
            "email": f"{TEST_PREFIX}rej_dist_{dist_id[:6]}@x.com",
            "full_name": f"{TEST_PREFIX}RejDist",
            "role": "distributor",
            "kyc_status": "rejected",
            "is_deleted": False,
            "created_at": now,
        })
        mongo_db.users.insert_one({
            "id": agent_id,
            "email": f"{TEST_PREFIX}rej_ag_{agent_id[:6]}@x.com",
            "full_name": f"{TEST_PREFIX}RejAgent",
            "role": "agent",
            "parent_id": dist_id,
            "is_deleted": False,
            "kyc_status": "approved",
            "created_at": now,
        })
        mongo_db.recharges.insert_one({
            "id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "agent_name": f"{TEST_PREFIX}RejAgent",
            "distributor_id": dist_id,
            "amount": 5000.0,
            "distributor_earnings_amount": 250.0,
            "commission_amount": 350.0,
            "status": "approved",
            "created_at": now,
            "reviewed_at": now,
        })
        try:
            after = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]
            assert round(after - baseline, 2) == 250.0
        finally:
            mongo_db.recharges.delete_many({"distributor_id": dist_id})
            mongo_db.users.delete_many({"id": {"$in": [dist_id, agent_id]}})


# ============================================================
# TestApprovedWithdrawalReducesEarnings
# ============================================================
class TestApprovedWithdrawalReducesEarnings:
    def test_approved_distributor_withdrawal_subtracts(self, admin_headers, mongo_db):
        """Seed a distributor with 1000 lifetime earnings + 300 approved
        withdrawal. Live earnings for this distributor = 700. Delta on
        total_distributor_earnings must be +700."""
        baseline = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]

        dist_id = str(uuid.uuid4())
        agent_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        mongo_db.users.insert_one({
            "id": dist_id,
            "email": f"{TEST_PREFIX}wd_dist_{dist_id[:6]}@x.com",
            "full_name": f"{TEST_PREFIX}WdDist",
            "role": "distributor",
            "is_deleted": False,
            "created_at": now,
        })
        mongo_db.users.insert_one({
            "id": agent_id,
            "email": f"{TEST_PREFIX}wd_ag_{agent_id[:6]}@x.com",
            "full_name": f"{TEST_PREFIX}WdAgent",
            "role": "agent",
            "parent_id": dist_id,
            "is_deleted": False,
            "created_at": now,
        })
        mongo_db.recharges.insert_one({
            "id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "agent_name": f"{TEST_PREFIX}WdAgent",
            "distributor_id": dist_id,
            "amount": 20000.0,
            "distributor_earnings_amount": 1000.0,
            "commission_amount": 1500.0,
            "status": "approved",
            "created_at": now,
            "reviewed_at": now,
        })
        mongo_db.withdrawals.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": dist_id,
            "user_name": f"{TEST_PREFIX}WdDist",
            "role": "distributor",
            "amount": 300.0,
            "status": "approved",
            "created_at": now,
            "reviewed_at": now,
        })
        try:
            after = _get_financial(admin_headers, {"range": "lifetime"})["total_distributor_earnings"]
            assert round(after - baseline, 2) == 700.0, (
                f"Withdrawal subtraction wrong. baseline={baseline} "
                f"after={after} delta={after - baseline} expected 700"
            )
        finally:
            mongo_db.recharges.delete_many({"distributor_id": dist_id})
            mongo_db.withdrawals.delete_many({"user_id": dist_id})
            mongo_db.users.delete_many({"id": {"$in": [dist_id, agent_id]}})


# ============================================================
# TestExistingFieldsUntouched — regression from iteration 17 & earlier
# ============================================================
class TestExistingFieldsUntouched:
    REQUIRED_FIELDS = [
        "total_revenue", "admin_revenue", "distributor_earnings",
        "recharge_approved", "total_wallet", "total_txn_amount",
        "total_txn_count", "transaction_revenue", "pending_kyc_count",
        "total_withdrawals_approved", "agent_withdrawals_approved",
        "distributor_withdrawals_approved",
    ]

    def test_all_existing_fields_present(self, admin_headers):
        data = _get_financial(admin_headers, {"range": "lifetime"})
        for f in self.REQUIRED_FIELDS:
            assert f in data, f"regressed: {f} missing"

    def test_iteration_17_withdrawal_math_still_holds(self, admin_headers):
        data = _get_financial(admin_headers, {"range": "lifetime"})
        assert abs(
            data["total_withdrawals_approved"]
            - data["agent_withdrawals_approved"]
            - data["distributor_withdrawals_approved"]
        ) < 0.01

    def test_total_wallet_still_ignores_range(self, admin_headers):
        life = _get_financial(admin_headers, {"range": "lifetime"})["total_wallet"]
        today = _get_financial(admin_headers, {"range": "today"})["total_wallet"]
        assert life == today


# ============================================================
# TestAuth — unauthorized request
# ============================================================
class TestAuth:
    def test_no_auth_rejected(self):
        r = requests.get(f"{BASE_URL}/api/admin/stats/financial?range=lifetime", timeout=10)
        assert r.status_code in (401, 403)
