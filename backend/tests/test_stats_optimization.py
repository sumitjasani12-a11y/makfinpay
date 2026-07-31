import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
from server import app
from database import PostgresDatabase

db = PostgresDatabase()
client = TestClient(app)

SUPER_ADMIN_EMAIL = "jigs.vanani@gmail.com"
SUPER_ADMIN_PASS = "Jigscse@3521"

def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return r.json()["token"]

def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

@pytest.fixture(scope="session")
def super_admin_token():
    with TestClient(app) as c:
        token = _login(c, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASS)
        yield token

def test_financial_stats_values_match_loop_logic(super_admin_token):
    with TestClient(app) as c:
        # 1. Fetch values from optimized API
        r = c.get("/api/admin/stats/financial", headers=_h(super_admin_token))
        assert r.status_code == 200, r.text
        opt_data = r.json()
        
        # 2. Re-calculate using the original slow loop logic manually
        # Get helper functions from server
        from server import _distributor_earnings_batch, _md_earnings_batch
        
        import asyncio
        loop = asyncio.get_event_loop()
        
        async def run_slow_calculations():
            dist_ids = [u["id"] async for u in db.users.find({"role": "distributor", "is_deleted": False}, {"_id": 0, "id": 1})]
            earnings_map = await _distributor_earnings_batch(dist_ids)
            total_distributor_earnings_slow = round(sum(earnings_map.values()), 2)
            
            md_ids = [u["id"] async for u in db.users.find({"role": "master_distributor", "is_deleted": False}, {"_id": 0, "id": 1})]
            md_earnings_map = await _md_earnings_batch(md_ids)
            total_md_earnings_slow = round(sum(md_earnings_map.values()), 2)
            
            return total_distributor_earnings_slow, total_md_earnings_slow

        slow_dist, slow_md = loop.run_until_complete(run_slow_calculations())
        
        # 3. Assert that both values are exactly equal
        assert opt_data["total_distributor_earnings"] == slow_dist, f"Distributor earnings mismatch: {opt_data['total_distributor_earnings']} != {slow_dist}"
        assert opt_data["total_md_earnings"] == slow_md, f"MD earnings mismatch: {opt_data['total_md_earnings']} != {slow_md}"
        
        print(f"Success! Distributor earnings: {slow_dist}, MD earnings: {slow_md}")
