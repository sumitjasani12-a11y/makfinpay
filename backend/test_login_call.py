import os
import sys
import asyncio
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

import server
from pydantic import BaseModel

class LoginIn(BaseModel):
    email: str
    password: str

async def main():
    db = server.db
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    await db.init_pool(uri)

    print("=== TESTING LOGIN HANDLER DIRECTLY ===")
    emails = ["jigs.vanani@gmail.com", "makfinpay@gmail.com"]
    passwords = ["Jigscse@3521", "Riyaz@1212", "Riyaz@12123521", "admin123"]

    class MockRequest:
        client = None

    class MockResponse:
        def set_cookie(self, *args, **kwargs): pass

    for e in emails:
        for p in passwords:
            try:
                res = await server.login(server.LoginIn(email=e, password=p), MockResponse(), MockRequest())
                print(f"SUCCESS: Email='{e}' with Password='{p}' -> Role={res['user']['role']}")
            except Exception as exc:
                pass

    await db.close()

if __name__ == "__main__":
    asyncio.run(main())
