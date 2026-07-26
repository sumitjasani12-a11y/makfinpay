import requests

def main():
    try:
        # 1. Login to get token
        login_res = requests.post("http://localhost:8011/api/auth/login", json={
            "email": "makfinpay@gmail.com", 
            "password": "Riyaz@1212"
        })
        login_data = login_res.json()
        token = login_data["token"]
        print("Logged in successfully. Token length:", len(token))
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Call admin/stats
        res1 = requests.get("http://localhost:8011/api/admin/stats", headers=headers)
        print("\n--- GET /api/admin/stats ---")
        print("Status code:", res1.status_code)
        
        # 3. Call admin/stats/financial
        res2 = requests.get("http://localhost:8011/api/admin/stats/financial?range=today", headers=headers)
        print("\n--- GET /api/admin/stats/financial?range=today ---")
        print("Status code:", res2.status_code)
        
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
