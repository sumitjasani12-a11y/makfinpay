import requests

url = "https://itbtuduqkhgtfkwpamcw.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YnR1ZHVxa2hndGZrd3BhbWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTg4NDAsImV4cCI6MjEwMDU3NDg0MH0.ui8OpPSqQQbGQ1htNEMtVK--3H2TSOfW49mNAGqu6vo"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

body = {
    "id": "uploads",
    "name": "uploads",
    "public": True
}

r = requests.post(f"{url}/storage/v1/bucket", headers=headers, json=body)
print("Create Bucket Status:", r.status_code)
print("Create Bucket Response:", r.text)
