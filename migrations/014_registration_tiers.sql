-- 014: Two registration tiers on the first-time application queue (012).
--
-- Schema only. Requests already in the queue become 'registered' with no password:
-- on approval they get an XG ID as before and claim their account later with an
-- organizer's code. Needs 012 and 013.
--
-- A 'registered' applicant may set a password and nickname when applying. Only the
-- scrypt hash is stored, and it is cleared by every decision: approval moves it to
-- player_credential, rejection erases it. A 'guest' never has either.
alter table new_player_registration_request
  add column if not exists registration_tier text not null default 'registered';
alter table new_player_registration_request
  add column if not exists pending_password_hash text;
alter table new_player_registration_request
  add column if not exists pending_nickname text;
alter table new_player_registration_request drop constraint if exists new_player_registration_tier_check;
alter table new_player_registration_request add constraint new_player_registration_tier_check
  check (registration_tier in ('registered', 'guest'));
alter table new_player_registration_request drop constraint if exists new_player_registration_password_hash;
alter table new_player_registration_request add constraint new_player_registration_password_hash check (
  pending_password_hash is null
  or pending_password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$');
alter table new_player_registration_request drop constraint if exists new_player_registration_nickname_length;
alter table new_player_registration_request add constraint new_player_registration_nickname_length check (
  pending_nickname is null or char_length(pending_nickname) between 2 and 24);
-- Decisions clear the account details.
alter table new_player_registration_request drop constraint if exists new_player_registration_account_purged;
alter table new_player_registration_request add constraint new_player_registration_account_purged check (
  status = 'pending' or (pending_password_hash is null and pending_nickname is null));
-- Guests never set a password or nickname.
alter table new_player_registration_request drop constraint if exists new_player_registration_guest_no_account;
alter table new_player_registration_request add constraint new_player_registration_guest_no_account check (
  registration_tier = 'registered' or (pending_password_hash is null and pending_nickname is null));
-- A password always comes with a nickname, so approval can lock both together.
alter table new_player_registration_request drop constraint if exists new_player_registration_account_pair;
alter table new_player_registration_request add constraint new_player_registration_account_pair check (
  (pending_password_hash is null) = (pending_nickname is null));
