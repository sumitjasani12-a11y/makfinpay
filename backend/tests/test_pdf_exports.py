"""
Backend tests for the new Admin PDF export endpoints (iteration_13).
Endpoints under test:
  - GET /api/admin/exports/distributor.pdf
  - GET /api/admin/exports/agent.pdf
"""
import io
import os
import uuid
import pytest
import requests

from pypdf import PdfReader

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fintech-bill-pay.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "makfinpay@gmail.com"
ADMIN_PASSWORD = "Riyaz@1212"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seed_distributor(admin_headers):
    """Ensure at least one distributor exists so PDF has data. Returns (id, email)."""
    lst = requests.get(f"{API}/admin/users", params={"role": "distributor"}, headers=admin_headers, timeout=15)
    lst.raise_for_status()
    users = lst.json()
    if users:
        return users[0]["id"], users[0]["email"], users[0]["full_name"]

    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_dist_{suffix}@x.com"
    payload = {
        "role": "distributor",
        "full_name": f"TEST Dist {suffix}",
        "email": email,
        "password": "TestPass@123",
        "phone": "9990000000",
        "address": "TEST",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), f"Create distributor failed: {r.status_code} {r.text}"
    d = r.json()
    return d["id"], d["email"], d["full_name"]


@pytest.fixture(scope="module")
def distributor_token(seed_distributor):
    """Reset distributor password (via admin) if needed, then login."""
    return None  # We won't login as distributor unless needed; below tests use non-admin proxy check.


@pytest.fixture(scope="module")
def non_admin_token(admin_headers):
    """Create a temporary distributor with known password and log in."""
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_authcheck_{suffix}@x.com"
    payload = {
        "role": "distributor",
        "full_name": f"TEST Auth {suffix}",
        "email": email,
        "password": "TestPass@123",
        "phone": "9990000001",
        "address": "TEST",
    }
    r = requests.post(f"{API}/admin/users", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass@123"}, timeout=15)
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


# ---------- Basic PDF-endpoint tests ----------
class TestDistributorPdf:
    def test_returns_pdf_bytes(self, admin_token, seed_distributor):
        r = requests.get(
            f"{API}/admin/exports/distributor.pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:500]
        assert r.headers["content-type"].lower().startswith("application/pdf"), r.headers
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower(), cd
        assert "MAK_FIN_PAY_Distributors_" in cd, cd
        # PDF magic bytes and EOF trailer
        assert r.content.startswith(b"%PDF-1."), r.content[:16]
        assert b"%%EOF" in r.content[-1024:], "PDF trailer missing"

    def test_pdf_content_matches_admin_users(self, admin_token, admin_headers):
        # Fetch source data
        users = requests.get(f"{API}/admin/users", params={"role": "distributor"}, headers=admin_headers, timeout=15).json()
        r = requests.get(f"{API}/admin/exports/distributor.pdf",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        assert "MAK FIN PAY" in text
        assert "Distributors Report" in text
        assert "Generated:" in text
        assert f"Total Distributors: {len(users)}" in text, f"Expected 'Total Distributors: {len(users)}' in PDF text"
        # Each user's full_name and email should appear (substring; wrapping/PDF spacing tolerant)
        for u in users:
            name = (u.get("full_name") or "").strip()
            email = (u.get("email") or "").strip()
            # Extraction may split long tokens: strip whitespace for compare
            text_flat = "".join(text.split())
            if name:
                assert "".join(name.split()) in text_flat, f"Distributor name '{name}' missing from PDF"
            if email:
                assert "".join(email.split()) in text_flat, f"Distributor email '{email}' missing from PDF"

    def test_earnings_values_match(self, admin_token, admin_headers):
        users = requests.get(f"{API}/admin/users", params={"role": "distributor"}, headers=admin_headers, timeout=15).json()
        r = requests.get(f"{API}/admin/exports/distributor.pdf",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        text_flat = "".join(text.split())
        for u in users:
            earnings = float(u.get("earnings") or 0)
            # Match "₹" + comma-formatted 2-decimal earnings
            token = f"₹{earnings:,.2f}"
            token_flat = "".join(token.split())
            # rupee sign sometimes drops in extract_text; allow bare numeric fallback
            bare = "".join(f"{earnings:,.2f}".split())
            assert (token_flat in text_flat) or (bare in text_flat), (
                f"Earnings {earnings} for distributor {u.get('email')} not found in PDF"
            )


class TestAgentPdf:
    def test_returns_pdf_bytes(self, admin_token):
        r = requests.get(
            f"{API}/admin/exports/agent.pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:500]
        assert r.headers["content-type"].lower().startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "MAK_FIN_PAY_Agents_" in cd
        assert r.content.startswith(b"%PDF-1.")
        assert b"%%EOF" in r.content[-1024:]

    def test_pdf_content_matches_admin_users(self, admin_token, admin_headers):
        users = requests.get(f"{API}/admin/users", params={"role": "agent"}, headers=admin_headers, timeout=15).json()
        r = requests.get(f"{API}/admin/exports/agent.pdf",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        reader = PdfReader(io.BytesIO(r.content))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        assert "MAK FIN PAY" in text
        assert "Agents Report" in text
        assert "Generated:" in text
        assert f"Total Agents: {len(users)}" in text

        text_flat = "".join(text.split())
        for u in users:
            name = (u.get("full_name") or "").strip()
            email = (u.get("email") or "").strip()
            if name:
                assert "".join(name.split()) in text_flat, f"Agent name '{name}' missing from PDF"
            if email:
                assert "".join(email.split()) in text_flat, f"Agent email '{email}' missing from PDF"
            wallet = float(u.get("wallet_balance") or 0)
            bare = "".join(f"{wallet:,.2f}".split())
            assert bare in text_flat, f"Wallet {wallet} for agent {u.get('email')} missing from PDF"


# ---------- Auth guard tests ----------
class TestAuthGuard:
    def test_no_auth_returns_401(self):
        r = requests.get(f"{API}/admin/exports/distributor.pdf", timeout=15)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:200]}"

    def test_non_admin_returns_403(self, non_admin_token):
        r = requests.get(
            f"{API}/admin/exports/distributor.pdf",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=15,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text[:200]}"

    def test_non_admin_agent_returns_403(self, non_admin_token):
        r = requests.get(
            f"{API}/admin/exports/agent.pdf",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            timeout=15,
        )
        assert r.status_code == 403


class TestPathValidation:
    def test_invalid_role_returns_404(self, admin_token):
        r = requests.get(
            f"{API}/admin/exports/invalidrole.pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 404
        detail = r.json().get("detail", "")
        assert "Unknown export" in detail or "unknown" in detail.lower()


# ---------- iteration_14: rupee-glyph + white-header + bundled fonts ----------
class TestRupeeGlyphAndFonts:
    """iteration_14 bug fix: ₹ glyph must render (not tofu) and header text
    must be white on the dark green header row."""

    RUPEE = "\u20B9"          # ₹
    TOFU = "\u25A0"           # ■  (black square)
    REPLACEMENT = "\uFFFD"    # �  (unicode replacement)
    RUPEE_UTF8 = b"\xe2\x82\xb9"

    def _fetch_pdf(self, admin_token, role):
        r = requests.get(
            f"{API}/admin/exports/{role}.pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        return r.content

    def _extracted_text(self, pdf_bytes):
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join((p.extract_text() or "") for p in reader.pages)

    # ----- Distributor rupee glyph -----
    def test_distributor_pdf_has_rupee_glyph(self, admin_token):
        pdf = self._fetch_pdf(admin_token, "distributor")
        text = self._extracted_text(pdf)
        # Primary assertion: rupee char present in extracted text
        has_rupee_in_text = self.RUPEE in text
        # Fallback: the UTF-8 byte sequence appears in the raw PDF stream
        has_rupee_in_bytes = self.RUPEE_UTF8 in pdf
        assert has_rupee_in_text or has_rupee_in_bytes, (
            f"Rupee glyph ₹ (U+20B9) not found in extracted text nor raw bytes."
        )
        # Assert no tofu / replacement chars
        assert self.TOFU not in text, "Found tofu ■ (U+25A0) in Distributor PDF text"
        assert self.REPLACEMENT not in text, "Found replacement char \\uFFFD in Distributor PDF text"

    def test_distributor_pdf_rupee_adjacent_to_earnings(self, admin_token, admin_headers):
        users = requests.get(f"{API}/admin/users", params={"role": "distributor"},
                             headers=admin_headers, timeout=15).json()
        pdf = self._fetch_pdf(admin_token, "distributor")
        text = self._extracted_text(pdf)
        text_flat = "".join(text.split())

        # For at least one user, the "₹<amount>" token should appear
        matched = 0
        for u in users:
            earnings = float(u.get("earnings") or 0)
            token = f"\u20B9{earnings:,.2f}"
            if "".join(token.split()) in text_flat:
                matched += 1
        assert matched >= 1, (
            f"No distributor row rendered ₹<amount> together in extracted text. "
            f"Users checked: {len(users)}"
        )

    # ----- Agent rupee glyph -----
    def test_agent_pdf_has_rupee_glyph(self, admin_token):
        pdf = self._fetch_pdf(admin_token, "agent")
        text = self._extracted_text(pdf)
        has_rupee_in_text = self.RUPEE in text
        has_rupee_in_bytes = self.RUPEE_UTF8 in pdf
        assert has_rupee_in_text or has_rupee_in_bytes, (
            "Rupee glyph ₹ not found in Agent PDF (text nor bytes)"
        )
        assert self.TOFU not in text, "Found tofu ■ in Agent PDF text"
        assert self.REPLACEMENT not in text, "Found replacement char in Agent PDF text"

    def test_agent_pdf_rupee_adjacent_to_wallet(self, admin_token, admin_headers):
        users = requests.get(f"{API}/admin/users", params={"role": "agent"},
                             headers=admin_headers, timeout=15).json()
        if not users:
            pytest.skip("No agents in DB to verify wallet rupee token")
        pdf = self._fetch_pdf(admin_token, "agent")
        text = self._extracted_text(pdf)
        text_flat = "".join(text.split())

        matched = 0
        for u in users:
            wallet = float(u.get("wallet_balance") or 0)
            token = f"\u20B9{wallet:,.2f}"
            if "".join(token.split()) in text_flat:
                matched += 1
        assert matched >= 1, (
            f"No agent row rendered ₹<wallet_balance> together. Users checked: {len(users)}"
        )

    # ----- Header column names still present (proof they were drawn) -----
    def test_header_columns_present_distributor(self, admin_token):
        pdf = self._fetch_pdf(admin_token, "distributor")
        text = self._extracted_text(pdf)
        for header in ("Name", "Email", "Phone", "Earnings"):
            assert header in text, f"Header '{header}' missing from Distributor PDF text"

    def test_header_columns_present_agent(self, admin_token):
        pdf = self._fetch_pdf(admin_token, "agent")
        text = self._extracted_text(pdf)
        for header in ("Name", "Email", "Phone", "Wallet"):
            assert header in text, f"Header '{header}' missing from Agent PDF text"

    # ----- White header verification via content-stream inspection -----
    def test_header_uses_white_fill_colour_distributor(self, admin_token):
        """The PDF content stream must reference the white fill colour (rg=1 1 1
        for RGB or scn=1 for CMYK white). reportlab's Paragraph with
        textColor=colors.white renders '1 1 1 rg' in the content stream."""
        pdf = self._fetch_pdf(admin_token, "distributor")
        # decompress-and-scan approach: search inside the raw content streams
        reader = PdfReader(io.BytesIO(pdf))
        found_white = False
        for page in reader.pages:
            try:
                # get_contents returns a ContentStream / EncodedStreamObject
                content = page.get_contents()
                if content is None:
                    continue
                data = content.get_data() if hasattr(content, "get_data") else bytes(content)
            except Exception:
                data = b""
            # reportlab emits either "1 1 1 rg" or "1 1 1 RG" (fill vs stroke)
            if b"1 1 1 rg" in data or b"1 1 1 RG" in data:
                found_white = True
                break
        assert found_white, (
            "PDF content stream does not contain white-fill operator '1 1 1 rg'. "
            "Header text may still be black on dark green."
        )

    def test_header_uses_white_fill_colour_agent(self, admin_token):
        pdf = self._fetch_pdf(admin_token, "agent")
        reader = PdfReader(io.BytesIO(pdf))
        found_white = False
        for page in reader.pages:
            try:
                content = page.get_contents()
                if content is None:
                    continue
                data = content.get_data() if hasattr(content, "get_data") else bytes(content)
            except Exception:
                data = b""
            if b"1 1 1 rg" in data or b"1 1 1 RG" in data:
                found_white = True
                break
        assert found_white, "Agent PDF content stream missing white-fill operator"

    # ----- Landscape orientation preserved -----
    def test_landscape_orientation_distributor(self, admin_token):
        pdf = self._fetch_pdf(admin_token, "distributor")
        reader = PdfReader(io.BytesIO(pdf))
        page = reader.pages[0]
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)
        assert w > h, f"Distributor PDF page 1 is not landscape: {w}x{h}"

    def test_landscape_orientation_agent(self, admin_token):
        pdf = self._fetch_pdf(admin_token, "agent")
        reader = PdfReader(io.BytesIO(pdf))
        page = reader.pages[0]
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)
        assert w > h, f"Agent PDF page 1 is not landscape: {w}x{h}"


class TestBundledFonts:
    """Assert bundled DejaVu TTFs exist, non-empty, and include U+20B9 glyph."""
    FONTS_DIR = "/app/backend/fonts"

    def test_regular_ttf_exists(self):
        p = os.path.join(self.FONTS_DIR, "DejaVuSans.ttf")
        assert os.path.exists(p), f"Missing font file: {p}"
        assert os.path.getsize(p) > 100_000, "DejaVuSans.ttf is suspiciously small"

    def test_bold_ttf_exists(self):
        p = os.path.join(self.FONTS_DIR, "DejaVuSans-Bold.ttf")
        assert os.path.exists(p), f"Missing font file: {p}"
        assert os.path.getsize(p) > 100_000, "DejaVuSans-Bold.ttf is suspiciously small"

    def _has_codepoint(self, ttf_path, codepoint):
        from fontTools.ttLib import TTFont
        f = TTFont(ttf_path)
        for table in f["cmap"].tables:
            if codepoint in table.cmap:
                return True
        return False

    def test_regular_has_rupee_glyph(self):
        p = os.path.join(self.FONTS_DIR, "DejaVuSans.ttf")
        assert self._has_codepoint(p, 0x20B9), "DejaVuSans.ttf missing U+20B9 (₹)"

    def test_bold_has_rupee_glyph(self):
        p = os.path.join(self.FONTS_DIR, "DejaVuSans-Bold.ttf")
        assert self._has_codepoint(p, 0x20B9), "DejaVuSans-Bold.ttf missing U+20B9 (₹)"


class TestIdempotentFontRegistration:
    """Hitting the export endpoint multiple times must not error out on
    already-registered fonts."""

    def test_three_consecutive_exports_succeed(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        for i in range(3):
            r = requests.get(f"{API}/admin/exports/distributor.pdf",
                             headers=headers, timeout=30)
            assert r.status_code == 200, (
                f"Attempt #{i+1} failed with {r.status_code}: {r.text[:200]}"
            )
            assert r.content.startswith(b"%PDF-1."), f"Attempt #{i+1} not PDF"


# ---------- Regression: async backup path still works ----------
class TestBackupRegression:
    def test_backup_202_and_completes(self, admin_headers):
        r = requests.post(f"{API}/admin/backups", headers=admin_headers,
                          json={"label": "TEST_pdf_iter13_regression"}, timeout=30)
        assert r.status_code == 202, f"Expected 202, got {r.status_code}: {r.text[:300]}"
        bid = r.json().get("id") or r.json().get("backup_id")
        assert bid, f"Missing backup id: {r.json()}"

        # Poll status
        import time
        deadline = time.time() + 60
        last = None
        while time.time() < deadline:
            s = requests.get(f"{API}/admin/backups/{bid}/status", headers=admin_headers, timeout=10)
            assert s.status_code == 200, s.text
            last = s.json()
            if last.get("status") in ("completed", "failed"):
                break
            time.sleep(1)
        assert last and last.get("status") == "completed", f"Backup did not complete: {last}"
