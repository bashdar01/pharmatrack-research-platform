# Password Login Added

This version adds a secure email/password login flow.

## What changed

- Login page now has two modes: Login and Create account.
- Create account requires full name, email, password, confirm password, and role.
- Login requires email and password.
- Supabase-connected mode uses Supabase Auth for password handling.
- Passwords are not stored in the public profiles table.
- Local demo mode uses browser local storage only for testing.

## Supabase setup

Make sure Email authentication is enabled:

Supabase Dashboard > Authentication > Providers > Email

For easy testing, disable email confirmation or confirm the email before logging in.
