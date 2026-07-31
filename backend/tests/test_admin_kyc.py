import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
from server import app

SUPER_ADMIN_EMAIL = "jigs.vanani@gmail.com"
SUPER_ADMIN_PASS = "Jigscse@3521"

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="session")
def super_admin_token(client):
    return _login(client, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASS)

def test_admin_kyc_list(client, super_admin_token):
    headers = {"Authorization": f"Bearer {super_admin_token}", "Content-Type": "application/json"}
    r = client.get("/api/admin/kyc", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

def test_serve_file_thumbnail_auth_required(client):
    r = client.get("/api/files/test_image.png?thumbnail=true")
    assert r.status_code == 401
