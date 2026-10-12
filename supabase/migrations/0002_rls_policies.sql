-- Who is allowed to touch real client data.
-- Kept as a table rather than hardcoded in the policies so that granting
-- access is an INSERT, not a schema migration.

create table app_owners (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

-- No policies: unreadable and unwritable through the public anon key.
alter table app_owners enable row level security;

-- security definer runs this as the function's owner, which bypasses RLS on
-- app_owners. Without it the policies below could never read the table they
-- depend on. search_path is pinned so the function can't be hijacked by a
-- caller-controlled schema.
create function is_app_owner() returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from app_owners
    where email = (select auth.jwt() ->> 'email')
  );
$$;

-- "using" gates which existing rows are visible to read/update/delete.
-- "with check" gates what new or modified rows are allowed to look like.
-- Both are needed, or an owner could write rows they then cannot read.
create policy owners_all_clients on clients
  for all using (is_app_owner()) with check (is_app_owner());

create policy owners_all_activities on activities
  for all using (is_app_owner()) with check (is_app_owner());

insert into app_owners (email, note) values
  ('kelvintwm5@gmail.com', 'developer');
-- TODO: add Esther's Gmail here so she can sign in to the live app.
