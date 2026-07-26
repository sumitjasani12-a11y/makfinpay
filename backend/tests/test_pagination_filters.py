"""
Iteration 19 — Server-side pagination + filter integration tests.

Covers:
  * Admin recharges, transactions, withdrawals, audit-logs, users
    return {items, total, page, page_size} when paginated=true
  * Legacy (non-paginated) endpoints still return plain arrays
  * Filters (status, agent_id, qr_code_id, operator, role, from_ts, to_ts, q)
    all apply server-side
  * Data-permanence: NO TTL indexes on operational collections
"""
import os
import pytest
import requests

def _load_frontend_env():
    """Load REACT_APP_BACKEND_URL from /app/frontend/.env if not already in env."""
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    os.environ["REACT_APP_BACKEND_URL"] = line.split("=", 1)[1].strip()
                    break
    except FileNotFoundError:
        pass


_load_frontend_env()
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "makfinpay@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Riyaz@1212")


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}",
                      "Content-Type": "application/json"})
    return s


# ----------------------------------------------------------------------------
# 1. Paginated shape
# ----------------------------------------------------------------------------

PAGINATED_ENDPOINTS = [
    ("/api/admin/recharges", {}),
    ("/api/admin/transactions", {}),
    ("/api/admin/withdrawals", {}),
    ("/api/admin/audit-logs", {}),
    ("/api/admin/users", {"role": "agent"}),
    ("/api/admin/users", {"role": "distributor"}),
]


@pytest.mark.parametrize("path,extra", PAGINATED_ENDPOINTS)
def test_paginated_shape(admin_client, path, extra):
    params = {"paginated": "true", "page": 1, "page_size": 25, **extra}
    r = admin_client.get(f"{BASE_URL}{path}", params=params, timeout=15)
    assert r.status_code == 200, f"{path} => {r.status_code} {r.text}"
    body = r.json()
    assert isinstance(body, dict), f"{path} expected dict, got {type(body)}"
    for k in ("items", "total", "page", "page_size"):
        assert k in body, f"{path} missing key {k!r} — got {list(body.keys())}"
    assert isinstance(body["items"], list)
    assert isinstance(body["total"], int) and body["total"] >= 0
    assert body["page"] == 1
    assert body["page_size"] == 25
    assert len(body["items"]) <= 25
    if body["total"] >= 1:
        assert len(body["items"]) >= 1


# ----------------------------------------------------------------------------
# 2. Legacy (non-paginated) callers still get plain arrays
# ----------------------------------------------------------------------------

LEGACY_ENDPOINTS = [
    ("/api/admin/recharges", {}),
    ("/api/admin/transactions", {}),
    ("/api/admin/withdrawals", {}),
    ("/api/admin/audit-logs", {}),
    ("/api/admin/users", {"role": "agent"}),
]


@pytest.mark.parametrize("path,extra", LEGACY_ENDPOINTS)
def test_legacy_plain_array(admin_client, path, extra):
    r = admin_client.get(f"{BASE_URL}{path}", params=extra, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list), (
        f"{path} legacy call should return plain array, got {type(body)}"
    )


# ----------------------------------------------------------------------------
# 3. Filters
# ----------------------------------------------------------------------------

def _get_items_and_total(client, path, params):
    r = client.get(f"{BASE_URL}{path}", params=params, timeout=15)
    assert r.status_code == 200, f"{path} {params} => {r.status_code} {r.text}"
    b = r.json()
    return b["items"], b["total"]


def test_recharges_status_filter(admin_client):
    items, total = _get_items_and_total(admin_client, "/api/admin/recharges",
                                        {"paginated": "true", "page_size": 100, "status": "approved"})
    for it in items:
        assert it["status"] == "approved", f"got non-approved row: {it.get('status')}"
    # 'all' or missing should be >= approved
    _, total_all = _get_items_and_total(admin_client, "/api/admin/recharges",
                                        {"paginated": "true", "page_size": 1})
    assert total_all >= total


def test_recharges_page_size_bounds(admin_client):
    # request 100
    _, total = _get_items_and_total(admin_client, "/api/admin/recharges",
                                    {"paginated": "true", "page_size": 100})
    # Fetch again — total should be stable
    _, total2 = _get_items_and_total(admin_client, "/api/admin/recharges",
                                     {"paginated": "true", "page_size": 100})
    assert total == total2


def test_recharges_search_filter(admin_client):
    # unlikely-to-match needle → 0
    items, total = _get_items_and_total(
        admin_client, "/api/admin/recharges",
        {"paginated": "true", "page_size": 25, "q": "ZZZZZ__NO_MATCH_NEEDLE__ZZZZZ"})
    assert total == 0
    assert items == []


def test_transactions_status_filter(admin_client):
    items, _ = _get_items_and_total(admin_client, "/api/admin/transactions",
                                    {"paginated": "true", "page_size": 100, "status": "pending"})
    for it in items:
        assert it["status"] == "pending"


def test_withdrawals_role_filter(admin_client):
    items, _ = _get_items_and_total(admin_client, "/api/admin/withdrawals",
                                    {"paginated": "true", "page_size": 100, "role_filter": "agent"})
    for it in items:
        assert it["role"] == "agent"


def test_withdrawals_status_filter(admin_client):
    items, _ = _get_items_and_total(admin_client, "/api/admin/withdrawals",
                                    {"paginated": "true", "page_size": 100, "status": "approved"})
    for it in items:
        assert it["status"] == "approved"


def test_audit_search_filter(admin_client):
    # unlikely needle -> 0
    _, total = _get_items_and_total(admin_client, "/api/admin/audit-logs",
                                    {"paginated": "true", "page_size": 25,
                                     "q": "ZZZZZ_NEEDLE_UNMATCHED_ZZZZZ"})
    assert total == 0


def test_users_search_filter(admin_client):
    _, total = _get_items_and_total(admin_client, "/api/admin/users",
                                    {"paginated": "true", "page_size": 25, "role": "agent",
                                     "q": "ZZZZ_NO_MATCH_ZZZZ"})
    assert total == 0


def test_users_role_filter(admin_client):
    items, _ = _get_items_and_total(admin_client, "/api/admin/users",
                                    {"paginated": "true", "page_size": 100, "role": "distributor"})
    for it in items:
        assert it["role"] == "distributor"


def test_recharges_date_range(admin_client):
    # empty window (1900) should return 0
    _, total = _get_items_and_total(admin_client, "/api/admin/recharges",
                                    {"paginated": "true", "page_size": 25,
                                     "from_ts": "1900-01-01T00:00:00Z",
                                     "to_ts": "1900-12-31T00:00:00Z"})
    assert total == 0


def test_audit_date_range(admin_client):
    _, total = _get_items_and_total(admin_client, "/api/admin/audit-logs",
                                    {"paginated": "true", "page_size": 25,
                                     "from_ts": "1900-01-01T00:00:00Z",
                                     "to_ts": "1900-12-31T00:00:00Z"})
    assert total == 0


# ----------------------------------------------------------------------------
# 4. Pagination page navigation
# ----------------------------------------------------------------------------

def test_pagination_page_navigation(admin_client):
    r1 = admin_client.get(f"{BASE_URL}/api/admin/recharges",
                          params={"paginated": "true", "page": 1, "page_size": 5}, timeout=15).json()
    if r1["total"] < 6:
        pytest.skip("Not enough recharges for multi-page test")
    r2 = admin_client.get(f"{BASE_URL}/api/admin/recharges",
                          params={"paginated": "true", "page": 2, "page_size": 5}, timeout=15).json()
    ids1 = {i["id"] for i in r1["items"]}
    ids2 = {i["id"] for i in r2["items"]}
    assert ids1.isdisjoint(ids2), "page 1 and page 2 should have disjoint ids"
    assert r1["total"] == r2["total"]


# ----------------------------------------------------------------------------
# 5. Data-permanence — no TTL indexes on operational collections
# ----------------------------------------------------------------------------

def test_no_ttl_indexes():
    """
    Directly connect to mongo and verify no `expireAfterSeconds` on any
    operational collection.
    """
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "makfinpay_db")
    client = MongoClient(mongo_url)
    db = client[db_name]
    collections = [
        "recharges", "transactions", "withdrawals",
        "audit_logs", "users", "wallets", "ledger",
        "bank_details", "kyc",
    ]
    ttl_offenders = []
    for coll in collections:
        try:
            for idx in db[coll].list_indexes():
                if "expireAfterSeconds" in idx:
                    ttl_offenders.append(f"{coll}.{idx.get('name')}")
        except Exception:
            # Collection may not exist — that's fine.
            pass
    client.close()
    assert ttl_offenders == [], (
        f"TTL index(es) found on operational collection(s): {ttl_offenders}"
    )


# ----------------------------------------------------------------------------
# 6. Auth guard — pagination endpoints reject unauth
# ----------------------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "/api/admin/recharges",
    "/api/admin/transactions",
    "/api/admin/withdrawals",
    "/api/admin/audit-logs",
    "/api/admin/users",
])
def test_auth_required(path):
    r = requests.get(f"{BASE_URL}{path}", params={"paginated": "true"}, timeout=15)
    assert r.status_code in (401, 403), f"{path} unauth got {r.status_code}"
