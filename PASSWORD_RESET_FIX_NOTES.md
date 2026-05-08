# Password reset fix notes

This version improves the password reset screen alignment and shows clearer Supabase recovery email errors.

If you see an email sending error, check these Supabase settings:

1. Authentication → URL Configuration → Redirect URLs
   - http://localhost:5173/**
   - https://www.pharmacy-hmu.com/**
   - https://pharmacy-hmu.com/**

2. Authentication → Logs
   - Check the exact SMTP or recovery-email error.

3. Authentication → Emails → SMTP Settings
   - Enable custom SMTP before testing many signup/reset emails.

Supabase's built-in email service has a low rate limit, so SMTP is recommended for real use.
