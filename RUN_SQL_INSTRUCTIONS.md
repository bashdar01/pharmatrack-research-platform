# How to run the Admin Approval SQL file correctly

Do **not** paste this text into Supabase SQL Editor:

```text
supabase/admin_approval_workflow.sql
```

That is only the file path/name. Supabase SQL Editor needs the **SQL code inside the file**.

## Correct steps

1. Open the project folder in VS Code.
2. Open this file:

```text
supabase/admin_approval_workflow.sql
```

3. Select all the SQL code inside the file.
4. Copy it.
5. Open Supabase → SQL Editor → New query.
6. Paste the copied SQL code.
7. Click **Run**.

If it says **Success. No rows returned**, it worked.
