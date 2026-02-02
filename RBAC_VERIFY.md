# RBAC Verification Checklist

This guide provides SQL, curl, and manual UI checks to verify RBAC behavior around booking confirmation privileges.
All commands are copy-paste friendly for Windows PowerShell.

## SQL (PostgreSQL via psql)

### 1) List roles
```sql
SELECT id, name, description, is_system
FROM roles
ORDER BY name;
```

### 2) List privileges
```sql
SELECT id, key, name, description, module_id
FROM privileges
ORDER BY key;
```

### 3) Show role privileges for LAWYER
```sql
SELECT r.name AS role_name, p.key AS privilege_key, p.name AS privilege_name
FROM roles r
JOIN role_privileges rp ON rp.role_id = r.id
JOIN privileges p ON p.id = rp.privilege_id
WHERE r.name = 'LAWYER'
ORDER BY p.key;
```

### 4) Confirm booking.confirm removed from LAWYER
```sql
SELECT r.name AS role_name, p.key AS privilege_key
FROM roles r
JOIN role_privileges rp ON rp.role_id = r.id
JOIN privileges p ON p.id = rp.privilege_id
WHERE r.name = 'LAWYER' AND p.key = 'booking.confirm';
-- Expect: 0 rows
```

## API Verification (curl)

> Replace BASE_URL, EMAIL, PASSWORD, and BOOKING_ID with real values.

### Common setup (PowerShell)
```powershell
$BASE_URL = "http://127.0.0.1:8000"
$LAWYER_EMAIL = "lawyer@example.com"
$LAWYER_PASSWORD = "password123"
$ADMIN_EMAIL = "admin@example.com"
$ADMIN_PASSWORD = "admin123"
$BOOKING_ID = 123
```

### 1) Login as lawyer and get access token
```powershell
$lawyerToken = (curl.exe -s -X POST "$BASE_URL/auth/login" `
  -H "Content-Type: application/x-www-form-urlencoded" `
  -d "username=$LAWYER_EMAIL&password=$LAWYER_PASSWORD" | ConvertFrom-Json).access_token
$lawyerToken
```

### 2) Check lawyer effective privileges
```powershell
curl.exe -s -H "Authorization: Bearer $lawyerToken" "$BASE_URL/auth/me" | ConvertFrom-Json
```
Expected: `effective_privileges` does NOT include `booking.confirm`.

### 3) Lawyer tries to confirm booking (expect 403)
```powershell
curl.exe -s -o $null -w "%{http_code}" -X PATCH `
  -H "Authorization: Bearer $lawyerToken" `
  "$BASE_URL/api/bookings/$BOOKING_ID/confirm"
```
Expected: `403`

### 4) Login as admin and get access token
```powershell
$adminToken = (curl.exe -s -X POST "$BASE_URL/auth/login" `
  -H "Content-Type: application/x-www-form-urlencoded" `
  -d "username=$ADMIN_EMAIL&password=$ADMIN_PASSWORD" | ConvertFrom-Json).access_token
$adminToken
```

### 5) Admin confirms booking (expect 200)
```powershell
curl.exe -s -o $null -w "%{http_code}" -X PATCH `
  -H "Authorization: Bearer $adminToken" `
  "$BASE_URL/api/bookings/$BOOKING_ID/confirm"
```
Expected: `200`

## Manual UI Checks

1) **LawyerIncomingBookingsPage**
   - Confirm button is hidden when `booking.confirm` is missing.
   - Reject button is still shown if `booking.reject` remains assigned.

2) **Admin Access Control**
   - Toggling role privileges updates the list after save.
   - Removing `booking.confirm` from LAWYER removes it from `/auth/me` effective privileges after refresh or re-login.
