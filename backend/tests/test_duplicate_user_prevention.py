import pytest
import sys
import uuid
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))
from server import create_subuser, admin_update_user, CreateUserIn, UpdateUserIn, db
from fastapi import HTTPException

@pytest.mark.anyio
async def test_duplicate_user_prevention():
    admin_id = str(uuid.uuid4())
    unique_email = "test_dup_unique_123@example.com"
    unique_phone = "9988776655"
    unique_name = "Test Unique User Prevention Name"

    # Clean up test user if previously exists
    await db.users.delete_many({"email": {"$regex": "test_dup_unique", "$options": "i"}})
    await db.users.delete_many({"phone": {"$in": ["9988776655", "9988776656", "9988776657"]}})
    await db.users.delete_many({"full_name": {"$regex": "Test Unique User Prevention", "$options": "i"}})

    user_data = CreateUserIn(
        role="agent",
        full_name=unique_name,
        email=unique_email,
        phone=unique_phone,
        address="Test Address 123",
    )

    # 1. Create first user successfully
    res = await create_subuser(user_data, parent_id=None, by=admin_id)
    assert res is not None

    # 2. Attempt duplicate Email creation
    dup_email_data = CreateUserIn(
        role="agent",
        full_name="Different Name One",
        email=unique_email.upper(),  # case-insensitive check
        phone="9988776656",
        address="Test Address",
    )
    with pytest.raises(HTTPException) as exc_info:
        await create_subuser(dup_email_data, parent_id=None, by=admin_id)
    assert exc_info.value.status_code == 400
    assert "Email already exists" in exc_info.value.detail

    # 3. Attempt duplicate Mobile Phone creation
    dup_phone_data = CreateUserIn(
        role="agent",
        full_name="Different Name Two",
        email="test_dup_unique_456@example.com",
        phone=unique_phone,
        address="Test Address",
    )
    with pytest.raises(HTTPException) as exc_info:
        await create_subuser(dup_phone_data, parent_id=None, by=admin_id)
    assert exc_info.value.status_code == 400
    assert "Mobile number already exists" in exc_info.value.detail

    # 4. Attempt duplicate Full Name creation (case-insensitive)
    dup_name_data = CreateUserIn(
        role="agent",
        full_name=unique_name.lower(),  # lowercase variation
        email="test_dup_unique_789@example.com",
        phone="9988776657",
        address="Test Address",
    )
    with pytest.raises(HTTPException) as exc_info:
        await create_subuser(dup_name_data, parent_id=None, by=admin_id)
    assert exc_info.value.status_code == 400
    assert "User with this name already exists" in exc_info.value.detail

    # 5. Create a second unique user
    second_user_data = CreateUserIn(
        role="agent",
        full_name="Test Unique User Prevention Second",
        email="test_dup_unique_sec@example.com",
        phone="9988776658",
        address="Test Address 456",
    )
    res_second = await create_subuser(second_user_data, parent_id=None, by=admin_id)
    second_user_record = await db.users.find_one({"email": "test_dup_unique_sec@example.com"})
    assert second_user_record is not None
    second_uid = second_user_record["id"]

    admin_user = {"id": admin_id, "role": "admin"}

    # Attempt updating second user to match first user's email
    update_dup_email = UpdateUserIn(
        full_name="Test Unique User Prevention Second",
        email=unique_email,
        phone="9988776658",
        address="Test Address 456",
    )
    with pytest.raises(HTTPException) as exc_info:
        await admin_update_user(second_uid, update_dup_email, user=admin_user)
    assert exc_info.value.status_code == 400
    assert "Email already exists" in exc_info.value.detail

    # Attempt updating second user to match first user's phone
    update_dup_phone = UpdateUserIn(
        full_name="Test Unique User Prevention Second",
        email="test_dup_unique_sec@example.com",
        phone=unique_phone,
        address="Test Address 456",
    )
    with pytest.raises(HTTPException) as exc_info:
        await admin_update_user(second_uid, update_dup_phone, user=admin_user)
    assert exc_info.value.status_code == 400
    assert "Mobile number already exists" in exc_info.value.detail

    # Attempt updating second user to match first user's name
    update_dup_name = UpdateUserIn(
        full_name=unique_name.lower(),
        email="test_dup_unique_sec@example.com",
        phone="9988776658",
        address="Test Address 456",
    )
    with pytest.raises(HTTPException) as exc_info:
        await admin_update_user(second_uid, update_dup_name, user=admin_user)
    assert exc_info.value.status_code == 400
    assert "User with this name already exists" in exc_info.value.detail

    # Clean up test users
    await db.users.delete_many({"email": {"$regex": "test_dup_unique", "$options": "i"}})
    await db.users.delete_many({"phone": {"$in": ["9988776655", "9988776656", "9988776657", "9988776658"]}})
    await db.users.delete_many({"full_name": {"$regex": "Test Unique User Prevention", "$options": "i"}})
