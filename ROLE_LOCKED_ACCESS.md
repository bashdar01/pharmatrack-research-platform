# Role-Locked Access Update

This version locks each user to the role selected during first registration/login.

## What changed

- The role switching buttons were removed.
- After login, the user sees only their registered role dashboard.
- If the same email logs in again, the app uses the originally saved role instead of allowing a new role choice.
- Student accounts cannot access Supervisor, Committee, or Admin dashboards.
- Supervisor accounts cannot access Student, Committee, or Admin dashboards.
- Committee accounts cannot access Student, Supervisor, or Admin dashboards.
- Admin accounts cannot access other role dashboards unless separate admin controls are implemented.
- Notification creation is limited to Admin and Research Committee accounts.

## Note

This is front-end/local role locking. For real deployment, Supabase Row Level Security policies must also enforce the same role restrictions on the database side.
