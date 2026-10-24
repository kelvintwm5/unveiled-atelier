-- Default an activity's date to today in Singapore, not today on the database server.
--
-- current_date is evaluated in the session's time zone, which on Supabase is UTC,
-- so before 08:00 SGT it gives yesterday. The app always sends the date itself;
-- this only matters for rows added by hand in the SQL editor.
-- Changes a default only: existing rows are untouched.

alter table activities
  alter column activity_date set default ((now() at time zone 'Asia/Singapore')::date);
