# Admin Approval Workflow Added

This version prevents new users from accessing the system immediately after registration.

## Behavior

- The first registered Admin account is automatically Active so the platform is not locked.
- Every later account is created as Pending.
- Pending users cannot access dashboards.
- Rejected users cannot access dashboards.
- Admin users can approve, reject, and change roles from the Admin dashboard.

## Supabase Migration

If you already created your database before this version, run:

```sql
supabase/admin_approval_workflow.sql
```

in Supabase SQL Editor.

## Important

If email confirmation is enabled in Supabase, users still need to confirm their email before they can log in, even after Admin approval.


## Important SQL note

When running the migration, do not paste `supabase/admin_approval_workflow.sql` into Supabase SQL Editor. That is only the file path. Open the file, copy the SQL code inside it, and paste the SQL code into Supabase SQL Editor.
