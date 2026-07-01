# Admin API Documentation

## Overview

Admin endpoints provide user management capabilities. All admin endpoints require authentication and admin privileges.

**Base URL:** `/api/admin`

**Authentication:** Bearer token with admin privileges

---

## Making a User Admin

Since the first admin must be created manually, use SQLite directly:

```bash
cd backend-certificate-generator
sqlite3 data/app.db "UPDATE users SET is_admin = 1 WHERE email = 'admin@example.com';"
```

After the first admin is created, additional admins can be promoted via API.

---

## Endpoints

### List All Users

**GET** `/api/admin/users`

Returns all users in the system with their details.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`
```json
[
  {
    "id": "f79fb5e8-ff52-4d65-8f04-5db942059f06",
    "email": "user@example.com",
    "name": "John Doe",
    "isAdmin": false,
    "failedLoginAttempts": 0,
    "lockedUntil": null,
    "createdAt": 1782890667
  }
]
```

**Error Responses:**
- `401` - Not authenticated
- `403` - Not admin
- `500` - Server error

---

### Get Single User

**GET** `/api/admin/users/:id`

Get detailed information about a specific user by UUID.

**Parameters:**
- `id` (path) - User UUID

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`
```json
{
  "id": "f79fb5e8-ff52-4d65-8f04-5db942059f06",
  "email": "user@example.com",
  "name": "John Doe",
  "isAdmin": false,
  "failedLoginAttempts": 0,
  "lockedUntil": null,
  "createdAt": 1782890667
}
```

**Error Responses:**
- `401` - Not authenticated
- `403` - Not admin
- `404` - User not found
- `500` - Server error

---

### Update User

**PUT** `/api/admin/users/:id`

Update user admin status or unlock account.

**Parameters:**
- `id` (path) - User UUID

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "isAdmin": true,
  "unlock": false
}
```

**Fields:**
- `isAdmin` (boolean, optional) - Set admin status
- `unlock` (boolean, optional) - Unlock account and reset failed login attempts

**Response:** `200 OK`
```json
{
  "id": "f79fb5e8-ff52-4d65-8f04-5db942059f06",
  "email": "user@example.com",
  "name": "John Doe",
  "isAdmin": true,
  "failedLoginAttempts": 0,
  "lockedUntil": null,
  "createdAt": 1782890667
}
```

**Error Responses:**
- `400` - No valid fields to update
- `401` - Not authenticated
- `403` - Not admin
- `404` - User not found
- `500` - Server error

---

### Delete User

**DELETE** `/api/admin/users/:id`

Delete a user account. Admins cannot delete their own account.

**Parameters:**
- `id` (path) - User UUID

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`
```json
{
  "success": true
}
```

**Error Responses:**
- `400` - Cannot delete your own account
- `401` - Not authenticated
- `403` - Not admin
- `404` - User not found
- `500` - Server error

---

## Examples

### List All Users

```bash
curl -X GET http://localhost:4000/api/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Promote User to Admin

```bash
curl -X PUT http://localhost:4000/api/admin/users/f79fb5e8-ff52-4d65-8f04-5db942059f06 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isAdmin": true}'
```

### Unlock User Account

```bash
curl -X PUT http://localhost:4000/api/admin/users/f79fb5e8-ff52-4d65-8f04-5db942059f06 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"unlock": true}'
```

### Delete User

```bash
curl -X DELETE http://localhost:4000/api/admin/users/f79fb5e8-ff52-4d65-8f04-5db942059f06 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Security Notes

1. **Admin Access** - All endpoints require valid authentication token with `isAdmin: true`
2. **Self-Protection** - Admins cannot delete their own account
3. **Password Security** - Passwords are never returned in API responses
4. **UUID Exposure** - All IDs are UUIDs, internal integer IDs are hidden
5. **Account Lockout** - Failed login attempts lock accounts for 15 minutes (5 attempts)

---

## Timestamp Format

All timestamps are Unix epoch seconds (e.g., `1782890667` = 2026-07-01 07:11:07 UTC).

Convert to human-readable:
```bash
date -r 1782890667
```

---

## Common Workflows

### Promoting First Admin
1. Create user via register endpoint
2. Manually set admin in database:
   ```bash
   sqlite3 data/app.db "UPDATE users SET is_admin = 1 WHERE email = 'admin@example.com';"
   ```
3. Login to get admin token
4. Use admin endpoints

### Unlocking Locked Account
1. User gets locked after 5 failed login attempts
2. Admin calls PUT `/api/admin/users/:id` with `{"unlock": true}`
3. User can login immediately

### Managing Admins
1. List users to find UUID
2. Call PUT with `{"isAdmin": true}` to promote
3. Call PUT with `{"isAdmin": false}` to demote
