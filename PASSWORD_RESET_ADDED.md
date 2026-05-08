# Password Reset Feature Added

This version adds a full password reset workflow to the login page.

## What changed

- Added a **Forgot password?** tab on the login page.
- Users can enter their email and request a password reset link.
- The app calls Supabase Auth `resetPasswordForEmail()`.
- The reset email redirects users back to the app with `?reset-password=true`.
- The app shows a **Set a New Password** page.
- The new password is saved using Supabase Auth `updateUser({ password })`.
- After updating, the user is signed out and asked to login with the new password.

## Supabase settings needed

In Supabase, add these redirect URLs:

```text
https://www.pharmacy-hmu.com/**
https://pharmacy-hmu.com/**
http://localhost:5173/**
```

Also configure SMTP if you want password reset emails to send reliably.
