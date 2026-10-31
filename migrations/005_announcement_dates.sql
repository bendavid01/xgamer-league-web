-- Updates (announcements) are shown newest first on the website, so they need a date.
alter table announcement add column if not exists created_at timestamptz not null default now();
create index if not exists announcement_tournament_recent on announcement(tournament_id, created_at desc) where deleted_at is null;
