-- WhatsApp is the required contact (existing contact_hash/contact_cipher columns).
-- Discord username becomes an optional, separately encrypted second contact.
alter table player add column if not exists discord_handle_hash text unique;
alter table player add column if not exists discord_handle_cipher text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'player_discord_handle_pair') then
    alter table player add constraint player_discord_handle_pair
      check ((discord_handle_hash is null) = (discord_handle_cipher is null));
  end if;
end $$;
