-- Client follow-up tracker: clients + their activity timeline.
-- Replaces the "Clients" and "Activity" tabs in the Google Sheet.

create table clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text,
  phone        text,
  wedding_date date,
  veil_type    text not null default 'TBD'
                 check (veil_type in ('Rental', 'Bespoke Veil', 'Bespoke Rental', 'TBD')),
  budget       numeric(10,2),
  stage        text not null default 'Inquiry'
                 check (stage in ('Inquiry', 'Consultation', 'Fitting', 'Confirmed', 'Completed', 'Lost')),
  notes        text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table activities (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete restrict,
  activity_date  date not null default current_date,
  type           text not null default 'Note'
                   check (type in ('Call', 'WhatsApp', 'Email', 'In-Person', 'Note')),
  notes          text,
  next_follow_up date,
  created_at     timestamptz not null default now()
);

-- Postgres does not index foreign keys automatically.
create index activities_client_id_idx on activities (client_id);
create index activities_next_follow_up_idx on activities (next_follow_up) where next_follow_up is not null;
create index clients_stage_idx on clients (stage) where archived_at is null;

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- RLS with no policies denies all access through the public anon key.
-- Policies are added in a later migration once the auth model is settled.
alter table clients enable row level security;
alter table activities enable row level security;
