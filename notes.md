## Understanding the Different Kinds of Errors

 **Before writing code, let's classify errors by intent and origin:**

# Error Type	Meaning	When it occurs
**Programming Error:**	A bug in your code (e.g., undefined variable, mis-typed property)	At any time; should be fixed by developers, not shown to users.
**Validation Error:**	User input fails schema rules (e.g., email missing, password too short)	During request validation; should return 400 Bad Request.
**Authentication Error:**	User is not logged in or credentials are invalid	Missing/invalid JWT, bad password; return 401 Unauthorized.
**Authorization Error:**	User is authenticated but lacks permission for the action	Role/permission check fails; return 403 Forbidden.
Not Found	The requested resource doesn't exist	GET /users/999 where user 999 not found; return 404 Not Found.
Conflict Attempt to create/update something that already exists	Duplicate unique key (email already registered); return 409 Conflict.
**Business Logic Error:**	Operation violates domain rules (e.g., cannot withdraw more than balance)	Service-layer checks; often 400 or 422 Unprocessable Entity.
**Database Error:**	Low-level DB failure (connection lost, constraint violation)	Should be caught and transformed into a user-friendly error (often 500).
**External Service Error:**	Third-party API fails, times out, or returns an error	Payment gateway, email provider; must be handled gracefully (retry, fallback, or 503).
Operational vs Programming Errors – Operational errors are predictable (validation, not found, etc.) and should be handled. Programming errors are bugs; they should crash the process in development and be logged + 500 in production.