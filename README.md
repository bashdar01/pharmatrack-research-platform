# PharmaTrack Research Platform

A React/Vite web application for managing final-year pharmacy research projects at Hawler Medical University, College of Pharmacy.

## New features in this version

- Login page
- Notification/reminder page
- Print / Save as PDF reports
- Dark/light mode
- Search and filter system
- Fake/sample users removed
- Local database mode for testing
- Supabase-ready database schema

## Run locally

```bash
npm install
npm run dev
```

Open the localhost link shown in the terminal, usually:

```bash
http://localhost:5173
```

## Important

Do not open `index.html` directly. Always use `npm run dev` and open the localhost link.

## Login

The app now starts with a login page. Enter your real name, email, and role. The old fake/sample users have been removed. In local mode, each login is saved to the local browser database.

## Print / Save as PDF

Go to **Print/PDF Reports** and click **Print / Save as PDF**. In the browser print dialog, choose **Save as PDF**.

## Dark / Light mode

Use the Dark/Light button in the login page or header.

## Search and filters

Use the Dashboard search/filter card to filter projects by title, group, area, supervisor, approval, or status.

## Supabase setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Optionally run `supabase/seed.sql` to add only default deadlines. It does not add fake users.
5. Create a private Storage bucket named:

```bash
project-files
```

6. Copy `.env.example` to `.env.local`.
7. Add your Supabase project URL and anon/publishable key:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

8. Restart the app:

```bash
npm run dev
```

## Security note

The included SQL uses open development policies so the demo login can read/write while testing. Before official university deployment, replace these with strict Supabase Auth and role-based Row Level Security policies.

## Files

- `src/App.jsx` — main app
- `src/styles.css` — app styling, dark mode, print styles
- `src/lib/supabaseClient.js` — Supabase connection
- `supabase/schema.sql` — database schema
- `supabase/seed.sql` — optional starter deadlines only

## Password login added

This version includes a secure login/register screen with email and password.

- Use **Create account** the first time.
- Use **Login** after the account already exists.
- Passwords are handled by Supabase Auth when Supabase is connected.
- Passwords are not stored in the `profiles` table.
- For local demo mode only, the app stores a simple local password marker in browser storage; this is not for official deployment.

### Supabase Auth requirement

In Supabase Dashboard, go to **Authentication → Providers → Email** and make sure Email login is enabled.

For testing, if new users cannot login immediately after creating an account, disable email confirmation or confirm the email first.


## Admin Approval for New Users

This version includes an approval workflow:

1. The first registered Admin account becomes Active automatically, so the platform is not locked.
2. Every later registered user is saved as Pending.
3. Pending users cannot access any dashboard.
4. Admin users can open the Admin dashboard and approve, reject, or change each user's role.

If your Supabase database was created before this feature, run this file in Supabase SQL Editor:

```sql
supabase/admin_approval_workflow.sql
```

Then restart the app with:

```bash
npm run dev
```

## Password reset

The login page includes a **Forgot password?** tab. It sends a Supabase password recovery email and redirects users back to the app so they can set a new password.

Add these Supabase Auth redirect URLs:

```text
https://www.pharmacy-hmu.com/**
https://pharmacy-hmu.com/**
http://localhost:5173/**
```
