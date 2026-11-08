-- Client profile additions: a free-text Activity field and dated reminders.

-- One running free-text field on the client, edited with the rest of the profile.
-- Separate from the activities table, which is the dated log of individual contacts.
alter table clients add column activity_notes text;

create table client_reminders (
  id          uuid primary key default gen_random_uuid(),
  -- restrict: "deleting" a client sets clients.archived_at, so their reminders
  -- stay in place and come back if the client is restored.
  client_id   uuid not null references clients(id) on delete restrict,
  -- A calendar date, not an instant: the morning digest runs once a day, so a
  -- time of day couldn't be honoured anyway.
  remind_on   date not null,
  note        text not null check (btrim(note) <> ''),
  -- Null means still open. Kept rather than deleted, so a finished reminder
  -- isn't lost and the morning digest only has to skip it.
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index client_reminders_client_id_idx on client_reminders (client_id);
-- Partial: the only query that scans by date is "what's still open and due".
create index client_reminders_open_idx on client_reminders (remind_on) where done_at is null;

alter table client_reminders enable row level security;

create policy owners_all_client_reminders on client_reminders
  for all using (is_app_owner()) with check (is_app_owner());
