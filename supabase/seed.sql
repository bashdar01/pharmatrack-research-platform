-- Optional starter data for PharmaTrack
-- This file intentionally does NOT add fake/sample users.
-- Users are created from the Login page or loaded from the real Supabase profiles table.

insert into public.deadlines (title, deadline_type, due_date, academic_year, status) values
('Weekly Research Report', 'Weekly Report', '2026-05-11', '2026-2027', 'Active'),
('Proposal Final Version', 'Proposal', '2026-05-18', '2026-2027', 'Active'),
('Final Thesis Submission', 'Final Thesis', '2026-06-20', '2026-2027', 'Active'),
('Poster and Presentation', 'Presentation', '2026-06-27', '2026-2027', 'Active')
on conflict do nothing;
