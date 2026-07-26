"""Backup & Restore — Async + Streaming (v3) tests for iteration_11.

Validates:
  - POST /api/admin/backups returns HTTP 202 immediately with status='in_progress'
  - Background job completes within 60s; manifest populated; gridfs_id, size_bytes
  - Bundle is NDJSON v3 (header / doc / file / manifest record types)
  - File binary SHA256 round-trip survives async restore polling
  - Download / Restore / Delete refused (409) while status != 'completed'
  - Restore endpoint returns 202 and writes restore_status / restore_result
  - Tampered manifest (file_count inflated) -> restore_status='failed' + restore_safety_backup_id
"""
import os
import io
import gzip
import json
import hashlib
import base64
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://fintech-bill-pay.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "makfinpay_db")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def mongo_db():
    cli = MongoClient(MONGO_URL)
    return cli[DB_NAME]


# ---------- helpers ----------
def _poll_status(bid, headers, field="status", target="completed",
                 fail_values=("failed",), timeout=90, interval=2):
    """Polls GET /api/admin/backups/{bid}/status until field hits target/fail."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = requests.get(f"{BASE_URL}/api/admin/backups/{bid}/status",
                         headers=headers, timeout=20)
        if r.status_code == 200:
            last = r.json()
            val = last.get(field)
            if val == target:
                return last
            if val in fail_values:
                return last
        time.sleep(interval)
    raise AssertionError(f"Timeout waiting for {field}={target}. Last={last}")


def _create_async_backup(headers, label):
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/api/admin/backups", headers=headers,
                      json={"label": label}, timeout=15)
    elapsed = time.time() - t0
    assert r.status_code == 202, f"expected 202, got {r.status_code}: {r.text}"
    assert elapsed < 5, f"POST took {elapsed:.1f}s (should be near-instant)"
    body = r.json()
    assert body.get("status") == "in_progress"
    assert body.get("id")
    return body, elapsed


# ---------- 1) Async response ----------
class TestAsyncBackupResponse:
    def test_post_returns_202_immediately(self, admin_headers):
        body, elapsed = _create_async_backup(admin_headers, "TEST_async-test")
        assert body.get("version") == 3
        assert body.get("status") == "in_progress"
        # Hint of <2s requirement
        assert elapsed < 5, f"Took {elapsed:.2f}s"


# ---------- 2) Background completion ----------
class TestBackgroundCompletion:
    def test_status_transitions_to_completed(self, admin_headers):
        body, _ = _create_async_backup(admin_headers, "TEST_bg-complete")
        bid = body["id"]
        final = _poll_status(bid, admin_headers, "status", "completed", timeout=90)
        assert final["status"] == "completed", f"final: {final}"
        # Re-fetch through list to get full record (status endpoint doesn't return gridfs_id)
        r = requests.get(f"{BASE_URL}/api/admin/backups", headers=admin_headers, timeout=30)
        rec = next((b for b in r.json() if b["id"] == bid), None)
        assert rec, "Backup not in list"
        assert rec.get("gridfs_id"), "gridfs_id is empty"
        assert rec.get("size_bytes", 0) > 0, "size_bytes is zero"
        manifest = rec.get("manifest") or final.get("manifest") or {}
        assert manifest.get("collection_doc_counts"), "no collection_doc_counts"
        assert "total_documents" in manifest
        assert "file_count" in manifest
        assert "file_total_bytes" in manifest

    def test_download_after_completion_works(self, admin_headers):
        body, _ = _create_async_backup(admin_headers, "TEST_download-ok")
        bid = body["id"]
        _poll_status(bid, admin_headers, "status", "completed", timeout=90)
        r = requests.get(f"{BASE_URL}/api/admin/backups/{bid}/download",
                         headers=admin_headers, timeout=120)
        assert r.status_code == 200
        assert r.content[:2] == b"\x1f\x8b", "not gzip"
        decompressed = gzip.decompress(r.content)
        assert decompressed[:1] == b"{", "decompressed content is not JSON"


# ---------- 3) NDJSON v3 streaming format ----------
class TestNdjsonV3Format:
    def test_bundle_is_newline_delimited_v3(self, admin_headers):
        body, _ = _create_async_backup(admin_headers, "TEST_ndjson-format")
        bid = body["id"]
        _poll_status(bid, admin_headers, "status", "completed", timeout=90)

        r = requests.get(f"{BASE_URL}/api/admin/backups/{bid}/download",
                         headers=admin_headers, timeout=120)
        assert r.status_code == 200
        decomp = gzip.decompress(r.content).decode("utf-8")
        lines = [ln for ln in decomp.split("\n") if ln.strip()]
        assert len(lines) >= 2, f"only {len(lines)} lines"

        # First line: header record
        first = json.loads(lines[0])
        assert first.get("t") == "header"
        assert first.get("version") == 3

        # Last line: manifest record
        last = json.loads(lines[-1])
        assert last.get("t") == "manifest"
        assert "collection_doc_counts" in last
        assert "file_count" in last

        # Some doc records expected (users coll at least)
        doc_record_types = set()
        for ln in lines:
            try:
                rec = json.loads(ln)
                doc_record_types.add(rec.get("t"))
            except json.JSONDecodeError:
                pytest.fail(f"line is not valid JSON: {ln[:100]!r}")
        assert "doc" in doc_record_types, f"no doc records found; types={doc_record_types}"


# ---------- 4) Refused while in_progress ----------
class TestRefusedWhileInProgress:
    def test_download_restore_delete_409_on_in_progress(self, admin_headers, mongo_db):
        # Insert a synthetic in_progress backup directly so we don't race the
        # background job. This is the documented behaviour: status!='completed' -> 409.
        from uuid import uuid4
        fake_id = f"test-inprog-{uuid4().hex[:8]}"
        mongo_db.backups.insert_one({
            "id": fake_id, "gridfs_id": None, "filename": None,
            "label": "TEST_inprog", "kind": "manual",
            "size_bytes": 0, "status": "in_progress", "manifest": None,
            "error": None, "started_at": "2026-01-01T00:00:00Z",
            "completed_at": None, "created_at": "2026-01-01T00:00:00Z",
            "created_by": "test", "version": 3,
        })
        try:
            r1 = requests.get(f"{BASE_URL}/api/admin/backups/{fake_id}/download",
                              headers=admin_headers, timeout=15)
            assert r1.status_code == 409, f"download: expected 409, got {r1.status_code}"

            r2 = requests.post(f"{BASE_URL}/api/admin/backups/{fake_id}/restore",
                               headers=admin_headers,
                               json={"confirm": "RESTORE"}, timeout=15)
            assert r2.status_code == 409, f"restore: expected 409, got {r2.status_code}: {r2.text}"

            # DELETE — spec says it must also refuse; report if it does not.
            r3 = requests.delete(f"{BASE_URL}/api/admin/backups/{fake_id}",
                                 headers=admin_headers, timeout=15)
            assert r3.status_code == 409, (
                f"delete: expected 409 on in_progress, got {r3.status_code}. "
                "Backend currently allows deleting in_progress backups."
            )
        finally:
            mongo_db.backups.delete_one({"id": fake_id})


# ---------- 5) File binary round-trip (async) ----------
class TestFileBinaryRoundTrip:
    def test_upload_backup_restore_sha256_match(self, admin_headers, admin_token, mongo_db):
        # 67-byte tiny PNG
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
            b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4"
            b"\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01"
            b"^\xf3*:\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        sha_orig = hashlib.sha256(png_bytes).hexdigest()

        # 1) Upload as admin
        r = requests.post(
            f"{BASE_URL}/api/uploads",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("iter11.png", png_bytes, "image/png")},
            timeout=60,
        )
        assert r.status_code == 200, f"upload: {r.status_code} {r.text}"
        sp = r.json()["path"]

        # 2) Verify uploaded file fetchable
        rr = requests.get(f"{BASE_URL}/api/files/{sp}?auth={admin_token}", timeout=30)
        assert rr.status_code == 200
        assert hashlib.sha256(rr.content).hexdigest() == sha_orig

        # 3) Async backup
        body, _ = _create_async_backup(admin_headers, "TEST_file-roundtrip")
        bid = body["id"]
        _poll_status(bid, admin_headers, "status", "completed", timeout=120)

        # 4) Wipe the files-collection doc to simulate data loss
        d = mongo_db.files.delete_one({"storage_path": sp})
        assert d.deleted_count == 1
        rr2 = requests.get(f"{BASE_URL}/api/files/{sp}?auth={admin_token}", timeout=30)
        assert rr2.status_code == 404

        # 5) Async restore — POST returns 202
        rr3 = requests.post(f"{BASE_URL}/api/admin/backups/{bid}/restore",
                            headers=admin_headers,
                            json={"confirm": "RESTORE"}, timeout=20)
        assert rr3.status_code == 202, f"restore: {rr3.status_code} {rr3.text}"
        assert rr3.json().get("status") == "in_progress"

        # 6) Poll restore_status until completed
        final = _poll_status(bid, admin_headers, "restore_status", "completed",
                             timeout=180)
        assert final.get("restore_status") == "completed", (
            f"restore failed: {final.get('restore_error')}"
        )
        rr_result = final.get("restore_result") or {}
        assert rr_result.get("verified") is True
        assert rr_result.get("files_restored", 0) >= 1
        assert final.get("restore_safety_backup_id")

        # 7) Re-fetch and SHA256-compare
        rr4 = requests.get(f"{BASE_URL}/api/files/{sp}?auth={admin_token}", timeout=30)
        assert rr4.status_code == 200, f"file missing after restore: {rr4.status_code}"
        assert hashlib.sha256(rr4.content).hexdigest() == sha_orig


# ---------- 6) Restore status tracking on completed backup ----------
class TestRestoreStatusTracking:
    def test_restore_writes_status_and_safety_backup_id(self, admin_headers):
        # Need a completed backup to restore
        body, _ = _create_async_backup(admin_headers, "TEST_restore-track")
        bid = body["id"]
        _poll_status(bid, admin_headers, "status", "completed", timeout=120)

        r = requests.post(f"{BASE_URL}/api/admin/backups/{bid}/restore",
                          headers=admin_headers,
                          json={"confirm": "RESTORE"}, timeout=20)
        assert r.status_code == 202
        body2 = r.json()
        assert body2.get("status") == "in_progress"
        assert body2.get("backup_id") == bid

        final = _poll_status(bid, admin_headers, "restore_status", "completed",
                             timeout=180)
        assert final.get("restore_status") == "completed"
        assert final.get("restore_safety_backup_id")
        # The safety backup itself should eventually be completed
        sid = final["restore_safety_backup_id"]
        safety_final = _poll_status(sid, admin_headers, "status", "completed",
                                    timeout=120)
        assert safety_final.get("status") == "completed"

        rr = final.get("restore_result") or {}
        assert rr.get("verified") is True


# ---------- 7) Partial-restore detection via tampered upload ----------
class TestTamperedRestoreDetected:
    def test_inflated_file_count_makes_restore_fail(self, admin_headers, admin_token):
        # Build a v2 in-memory bundle by downloading + decompressing a fresh backup,
        # then convert to v2 dict shape if needed. Simpler: use legacy
        # /api/admin/backups + tamper the v2 blob shape directly via JSON.
        # We construct a minimal v2 dict tied to current schema.
        tampered = {
            "version": 2,
            "created_at": "2026-01-01T00:00:00Z",
            "manifest": {
                "collection_doc_counts": {},
                "total_documents": 0,
                "file_count": 999,  # impossible — no files in payload
                "file_total_bytes": 0,
                "file_fetch_errors": [],
            },
            "collections": {},
            "files": [],
        }
        raw = json.dumps(tampered).encode("utf-8")
        blob = gzip.compress(raw)

        r = requests.post(
            f"{BASE_URL}/api/admin/backups/restore-upload",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("tampered.json.gz", blob, "application/gzip")},
            data={"confirm": "RESTORE"},
            timeout=60,
        )
        # Expect HTTP 202 — async path
        assert r.status_code == 202, f"expected 202, got {r.status_code}: {r.text}"
        body = r.json()
        bid = body.get("backup_id")
        assert bid

        final = _poll_status(bid, admin_headers, "restore_status", "failed",
                             fail_values=("completed",), timeout=180)
        assert final.get("restore_status") == "failed", (
            f"expected restore failed, got: {final.get('restore_status')}"
        )
        err = final.get("restore_error") or ""
        assert "Verification FAILED" in err or "verification FAILED" in err, (
            f"restore_error missing 'Verification FAILED': {err}"
        )
        assert final.get("restore_safety_backup_id"), (
            "restore_safety_backup_id must be populated for rollback"
        )


# ---------- 8) Daily scheduler still uses _run_backup_job ----------
class TestDailySchedulerWiring:
    def test_daily_job_awaits_run_backup_job(self):
        import re
        with open("/app/backend/server.py", "r") as f:
            src = f.read()
        # _daily_backup_job is present and awaits _run_backup_job inline
        m = re.search(r"async def _daily_backup_job\(\).*?(?=\nasync def |\ndef |\Z)",
                      src, re.DOTALL)
        assert m, "_daily_backup_job not found"
        body = m.group(0)
        assert "await _run_backup_job(" in body, (
            "_daily_backup_job must await _run_backup_job inline"
        )


# ---------- 9) Regression — list / admin users still works ----------
class TestRegressionSpotCheck:
    def test_list_backups_has_status_field(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/backups", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if items:
            assert "status" in items[0], "status field missing on backup list rows"

    def test_admin_users_still_returns(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"admin users: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)
