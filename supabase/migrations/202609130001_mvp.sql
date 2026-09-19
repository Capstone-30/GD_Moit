begin;

create schema if not exists private;
revoke all on schema private from public;

create table public.app_settings (
  id boolean primary key default true check (id),
  school_name text not null check (length(trim(school_name)) between 1 and 80),
  email_domain text not null check (email_domain = lower(email_domain) and email_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'),
  semester text not null check (length(trim(semester)) between 1 and 40),
  weekdays integer[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7] and array_position(weekdays, null) is null),
  period_count integer not null check (period_count between 1 and 99),
  retention_policy text not null check (length(trim(retention_policy)) between 10 and 2000)
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 20)
);
create table public.availability (
  user_id uuid not null references auth.users on delete cascade,
  semester text not null,
  slots integer[] not null default '{}',
  primary key (user_id, semester)
);
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users on delete cascade,
  semester text not null,
  kind text not null check (kind in ('study', 'coffee', 'lunch')),
  place text not null check (length(trim(place)) between 2 and 100),
  capacity integer not null check (capacity between 2 and 100),
  confirmed_slot integer,
  created_at timestamptz not null default now()
);
create table public.meeting_members (
  meeting_id uuid not null references public.meetings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index on public.meeting_members(user_id);
create index on public.meetings(semester, created_at desc);

-- Only this predicate may inspect Auth records. A deleted/unverified account
-- cannot keep using an unexpired JWT to read application data.
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u cross join public.app_settings s
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and lower(split_part(u.email, '@', 2)) = s.email_domain
  );
$$;

create function private.require_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'AUTH_REQUIRED'; end if;
  return auth.uid();
end;
$$;

create function private.guard_school_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_settings s where lower(split_part(new.email, '@', 2)) = s.email_domain)
    then raise exception 'SCHOOL_EMAIL_REQUIRED'; end if;
  return new;
end;
$$;
create trigger guard_school_email before insert or update of email on auth.users
for each row execute function private.guard_school_email();

-- ponytail: serialize MVP writes; use ordered meeting locks if write volume grows.
create function private.lock_writes() returns void
language sql volatile set search_path = '' as $$ select pg_catalog.pg_advisory_xact_lock(2026091301); $$;

create function private.common_slots(target uuid) returns integer[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(candidate order by candidate), '{}'::integer[]) from (
    select distinct unnest(a.slots) as candidate
    from public.availability a join public.meetings m on m.id = target
    where a.user_id = m.host_id and a.semester = m.semester
  ) candidates
  where not exists (
    select 1 from public.meeting_members mm join public.meetings m on m.id = mm.meeting_id
    left join public.availability a on a.user_id = mm.user_id and a.semester = m.semester
    where mm.meeting_id = target and not coalesce(candidate = any(a.slots), false)
  );
$$;

create function public.save_profile(p_name text, p_slots integer[]) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; s public.app_settings;
begin
  perform private.lock_writes();
  actor := private.require_member();
  select * into strict s from public.app_settings;
  if p_name is null or length(trim(p_name)) not between 2 and 20 then raise exception 'INVALID_NAME'; end if;
  if p_slots is null or cardinality(p_slots) > cardinality(s.weekdays) * s.period_count
    or exists (select 1 from unnest(p_slots) slot where slot is null or not (slot / 100 = any(s.weekdays)) or slot % 100 not between 1 and s.period_count)
    then raise exception 'INVALID_SLOTS'; end if;
  insert into public.profiles values(actor, trim(p_name)) on conflict(id) do update set display_name = excluded.display_name;
  insert into public.availability values(actor, s.semester, array(select distinct unnest(p_slots) order by 1))
    on conflict(user_id, semester) do update set slots = excluded.slots;
  update public.meetings m set confirmed_slot = null
    where m.confirmed_slot is not null
      and exists(select 1 from public.meeting_members mm where mm.meeting_id = m.id and mm.user_id = actor)
      and not (m.confirmed_slot = any(private.common_slots(m.id)));
end;
$$;

create function public.create_meeting(p_kind text, p_place text, p_capacity integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid; term text; result uuid;
begin
  perform private.lock_writes();
  actor := private.require_member();
  select semester into strict term from public.app_settings;
  if not exists(select 1 from public.availability where user_id = actor and semester = term)
    then raise exception 'PROFILE_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('study','coffee','lunch') then raise exception 'INVALID_KIND'; end if;
  if p_place is null or length(trim(p_place)) not between 2 and 100 then raise exception 'INVALID_PLACE'; end if;
  if p_capacity is null or p_capacity not between 2 and 100 then raise exception 'INVALID_CAPACITY'; end if;
  insert into public.meetings(host_id, semester, kind, place, capacity)
    values(actor, term, p_kind, trim(p_place), p_capacity) returning id into result;
  insert into public.meeting_members(meeting_id, user_id) values(result, actor);
  return result;
end;
$$;

create function public.join_meeting(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; m public.meetings;
begin
  perform private.lock_writes();
  actor := private.require_member();
  select * into m from public.meetings where id = p_id and semester = (select semester from public.app_settings);
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if exists(select 1 from public.meeting_members where meeting_id = p_id and user_id = actor) then return; end if;
  if not exists(select 1 from public.availability where user_id = actor and semester = m.semester)
    then raise exception 'PROFILE_REQUIRED'; end if;
  if (select count(*) from public.meeting_members where meeting_id = p_id) >= m.capacity then raise exception 'MEETING_FULL'; end if;
  if m.confirmed_slot is not null and not exists(select 1 from public.availability where user_id = actor and semester = m.semester and m.confirmed_slot = any(slots))
    then raise exception 'TIME_CONFLICT'; end if;
  insert into public.meeting_members(meeting_id, user_id) values(p_id, actor);
end;
$$;

create function public.confirm_meeting(p_id uuid, p_slot integer) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; m public.meetings;
begin
  perform private.lock_writes();
  actor := private.require_member();
  select * into m from public.meetings where id = p_id and semester = (select semester from public.app_settings);
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if m.host_id <> actor then raise exception 'HOST_ONLY'; end if;
  if (select count(*) from public.meeting_members where meeting_id = p_id) < 2 then raise exception 'WAIT_FOR_MEMBER'; end if;
  if p_slot is null or not (p_slot = any(private.common_slots(p_id))) then raise exception 'NO_COMMON_SLOT'; end if;
  update public.meetings set confirmed_slot = p_slot where id = p_id;
end;
$$;

-- Aggregate only: never expose another student's email or individual timetable.
create function public.get_meetings(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := private.require_member();
  return coalesce((select jsonb_agg(entry order by created_at desc, id) from (
    select m.id, m.created_at, jsonb_build_object(
      'id', m.id, 'kind', m.kind, 'place', m.place, 'capacity', m.capacity,
      'confirmed_slot', m.confirmed_slot, 'is_host', m.host_id = actor,
      'joined', exists(select 1 from public.meeting_members where meeting_id = m.id and user_id = actor),
      'member_count', (select count(*) from public.meeting_members where meeting_id = m.id),
      'common_slots', case when m.host_id = actor or (select count(*) from public.meeting_members where meeting_id = m.id) >= 2 then private.common_slots(m.id) else '{}'::integer[] end,
      'my_overlap', (select coalesce(jsonb_agg(slot order by slot), '[]'::jsonb)
        from unnest(case when m.confirmed_slot is null then private.common_slots(m.id) else array[m.confirmed_slot] end) slot
        where exists(select 1 from public.availability where user_id = actor and semester = m.semester and slot = any(slots))),
      'members', case when p_id is null then '[]'::jsonb else
        (select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'is_host', mm.user_id = m.host_id, 'is_me', mm.user_id = actor) order by mm.joined_at, mm.user_id), '[]'::jsonb)
         from public.meeting_members mm join public.profiles p on p.id = mm.user_id where mm.meeting_id = m.id) end
    ) entry from public.meetings m
    where m.semester = (select semester from public.app_settings) and (p_id is null or m.id = p_id)
  ) entries), '[]'::jsonb);
end;
$$;

create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  perform private.lock_writes();
  -- An existing user can delete their data even if the school setting changed.
  actor := auth.uid();
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from auth.users where id = actor;
  update public.meetings m set confirmed_slot = null where confirmed_slot is not null
    and (select count(*) from public.meeting_members mm where mm.meeting_id = m.id) < 2;
end;
$$;

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.availability enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_members enable row level security;

revoke all on public.app_settings, public.profiles, public.availability, public.meetings, public.meeting_members from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant select on public.profiles, public.availability to authenticated;
create policy read_settings on public.app_settings for select to anon, authenticated using(true);
create policy own_profile on public.profiles for select to authenticated using(id = (select auth.uid()) and (select private.is_member()));
create policy own_availability on public.availability for select to authenticated using(user_id = (select auth.uid()) and (select private.is_member()));

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_member() to authenticated;
revoke all on function public.save_profile(text,integer[]), public.create_meeting(text,text,integer), public.join_meeting(uuid), public.confirm_meeting(uuid,integer), public.get_meetings(uuid), public.delete_account() from public, anon;
grant execute on function public.save_profile(text,integer[]), public.create_meeting(text,text,integer), public.join_meeting(uuid), public.confirm_meeting(uuid,integer), public.get_meetings(uuid), public.delete_account() to authenticated;

commit;
