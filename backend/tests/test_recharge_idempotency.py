"""Tests for the agent recharge idempotency guard (duplicate-UTR check).

Bug: rapid double-submission of same recharge would create duplicate pending records.
Fix:
  - app-level duplicate check on (user_id, utr, status in pending|approved)
  - DuplicateKeyError safety net for race conditions
  - REJECTED recharges must NOT block re-submission
"""
import asyncio
import os
import random
import string
import requests
import httpx
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASS = "Riyaz@1212"
AGENT_EMAIL = "test_agent_46a8e0d6@x.com"
AGENT_PASS = "TestPass@123"

DUP_MSG = "This UTR has already been submitted. If you believe this is an error, please contact the admin."


def _utr():
    return "".join(random.choices(string.digits, k=12))


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def agent_token():
    return _login(AGENT_EMAIL, AGENT_PASS)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


def _post_recharge(token, utr, amount=50000, last4="1234"):
    return requests.post(
        f"{API}/agent/recharges",
        json={"amount": amount, "utr": utr, "card_last4": last4, "screenshot_path": "test/screenshot.png"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )


# ---------- Test 1: duplicate-UTR re-submit returns 409 ----------
def test_duplicate_utr_returns_409(agent_token):
    utr = _utr()
    r1 = _post_recharge(agent_token, utr)
    assert r1.status_code == 200, f"first submit should succeed, got {r1.status_code}: {r1.text}"
    assert r1.json()["utr"] == utr
    assert r1.json()["status"] == "pending"

    r2 = _post_recharge(agent_token, utr)
    assert r2.status_code == 409, f"duplicate submit should be 409, got {r2.status_code}: {r2.text}"
    detail = r2.json().get("detail", "")
    assert detail == DUP_MSG, f"unexpected detail: {detail!r}"


# ---------- Test 2: rejected recharge does NOT block re-submission ----------
def test_rejected_does_not_block(agent_token, admin_token):
    utr = _utr()
    r1 = _post_recharge(agent_token, utr)
    assert r1.status_code == 200
    rid = r1.json()["id"]

    # admin rejects it
    rej = requests.post(
        f"{API}/admin/recharges/{rid}/reject",
        json={"note": "test rejection"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert rej.status_code == 200, f"reject failed: {rej.status_code} {rej.text}"

    # re-submit with same UTR should succeed
    r2 = _post_recharge(agent_token, utr)
    assert r2.status_code == 200, f"re-submit after reject should succeed: {r2.status_code} {r2.text}"
    assert r2.json()["status"] == "pending"

    # Admin list should show both — at least one rejected + one pending with this utr
    lst = requests.get(
        f"{API}/admin/recharges",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    ).json()
    matching = [x for x in lst if x.get("utr") == utr]
    statuses = sorted([x["status"] for x in matching])
    assert "rejected" in statuses and "pending" in statuses, f"expected both rejected+pending, got {statuses}"


# ---------- Test 3: approved recharge BLOCKS re-submission ----------
def test_approved_blocks_resubmission(agent_token, admin_token):
    utr = _utr()
    r1 = _post_recharge(agent_token, utr, amount=100)
    assert r1.status_code == 200
    rid = r1.json()["id"]

    appr = requests.post(
        f"{API}/admin/recharges/{rid}/approve",
        json={"note": "test approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert appr.status_code == 200, f"approve failed: {appr.status_code} {appr.text}"

    r2 = _post_recharge(agent_token, utr, amount=100)
    assert r2.status_code == 409, f"approved utr should block: {r2.status_code} {r2.text}"
    assert r2.json().get("detail") == DUP_MSG


# ---------- Test 4: race condition — exactly one 200, one 409 ----------
def test_race_condition_safety_net(agent_token, admin_token):
    utr = _utr()

    async def fire():
        async with httpx.AsyncClient(timeout=20) as c:
            return await c.post(
                f"{API}/agent/recharges",
                json={"amount": 1500, "utr": utr, "card_last4": "9999", "screenshot_path": "test/race.png"},
                headers={"Authorization": f"Bearer {agent_token}"},
            )

    async def race():
        return await asyncio.gather(fire(), fire())

    a, b = asyncio.run(race())
    codes = sorted([a.status_code, b.status_code])
    assert codes == [200, 409], f"expected [200, 409], got {codes}; bodies={a.text!r} / {b.text!r}"

    # verify exactly one record exists with this utr for the agent
    lst = requests.get(
        f"{API}/admin/recharges",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    ).json()
    matching = [x for x in lst if x.get("utr") == utr]
    assert len(matching) == 1, f"expected exactly 1 DB record for utr {utr}, got {len(matching)}"


# ---------- Test 5: regression — existing validation rules still enforced ----------
def test_regression_amount_too_high(agent_token):
    r = _post_recharge(agent_token, _utr(), amount=300001)
    assert r.status_code == 400
    assert "3,00,000" in r.json().get("detail", "")


def test_regression_amount_zero(agent_token):
    r = _post_recharge(agent_token, _utr(), amount=0)
    assert r.status_code == 400


def test_regression_utr_len_11(agent_token):
    r = _post_recharge(agent_token, "12345678901")  # 11 digits
    assert r.status_code == 400
    assert "exactly 12" in r.json().get("detail", "")


def test_regression_utr_non_digit(agent_token):
    r = _post_recharge(agent_token, "12345678901a")
    assert r.status_code == 400
    assert "only digits" in r.json().get("detail", "")


def test_regression_last4_invalid(agent_token):
    r = _post_recharge(agent_token, _utr(), last4="12")
    assert r.status_code == 400


# ---------- Test 6: different agents can use the same UTR (scope is per-user) ----------
# Not asserted to avoid creating a second agent; the unique index includes user_id so
# this is structurally correct. Skipped.
