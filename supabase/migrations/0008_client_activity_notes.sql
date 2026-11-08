-- A free-text Activity field on the client profile.

-- One running free-text field on the client, edited with the rest of the profile.
-- Separate from the activities table, which is the dated log of individual contacts.
alter table clients add column activity_notes text;
