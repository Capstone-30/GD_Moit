begin;

alter table public.app_settings add column public_places text[] not null default '{}';
alter table public.profiles add column department text, add column admission_year integer, add column interests text[] not null default '{}';
alter table public.meetings add column topic text not null default '미분류';
alter table public.meetings add column meeting_date date;
-- Legacy confirmations have no real date, so they must be scheduled again.
update public.meetings set confirmed_slot=null where confirmed_slot is not null;
alter table public.meetings drop constraint meetings_capacity_check;
alter table public.meetings add constraint meetings_capacity_check check (capacity between 2 and 4);
create table public.meeting_comments (
  id bigint generated always as identity primary key,
  meeting_id uuid not null references public.meetings on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create table public.blocks (
  blocker_id uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users on delete cascade,
  meeting_id uuid references public.meetings on delete cascade,
  target_id uuid references auth.users on delete cascade,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check ((meeting_id is null) <> (target_id is null))
);
create table public.account_restrictions (
  user_id uuid primary key references auth.users on delete cascade,
  restricted_at timestamptz not null default now()
);
create function private.restrict_reported_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.target_id is not null and (select count(distinct reporter_id) from public.reports where target_id=new.target_id)>=3 then
    insert into public.account_restrictions(user_id) values(new.target_id) on conflict do nothing;
  end if;
  return new;
end; $$;
create trigger restrict_reported_account after insert on public.reports for each row execute function private.restrict_reported_account();
create table public.meeting_removals (
  meeting_id uuid not null references public.meetings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (meeting_id, user_id)
);
create table public.meeting_availability (
  meeting_id uuid not null references public.meetings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  slots integer[] not null,
  primary key(meeting_id,user_id)
);
create table public.time_proposals (
  meeting_id uuid primary key references public.meetings on delete cascade,
  slot integer not null,
  meeting_date date not null,
  created_at timestamptz not null default now()
);
create table public.proposal_acceptances (
  meeting_id uuid not null references public.time_proposals on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key(meeting_id,user_id)
);

create function private.effective_slots(p_meeting uuid,p_user uuid) returns integer[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select slots from public.meeting_availability where meeting_id=p_meeting and user_id=p_user),
    (select a.slots from public.availability a join public.meetings m on m.id=p_meeting and m.semester=a.semester where a.user_id=p_user),'{}'::integer[]);
$$;
create or replace function private.common_slots(target uuid) returns integer[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(candidate order by candidate),'{}'::integer[]) from (
    select distinct unnest(private.effective_slots(target,m.host_id)) candidate from public.meetings m where m.id=target
  ) candidates where not exists (
    select 1 from public.meeting_members mm where mm.meeting_id=target and not (candidate=any(private.effective_slots(target,mm.user_id)))
  );
$$;

drop function public.save_profile(text,integer[]);
drop function public.create_meeting(text,text,integer);

create or replace function public.save_profile(p_name text, p_slots integer[], p_department text default null, p_admission_year integer default null, p_interests text[] default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; s public.app_settings;
begin
  perform private.lock_writes(); actor := private.require_member();
  select * into strict s from public.app_settings;
  if p_name is null or length(trim(p_name)) not between 2 and 20 then raise exception 'INVALID_NAME'; end if;
  if p_department is not null and length(trim(p_department)) > 80 then raise exception 'INVALID_PROFILE'; end if;
  if p_admission_year is not null and p_admission_year not between 1900 and extract(year from now())::integer then raise exception 'INVALID_PROFILE'; end if;
  if p_interests is null or cardinality(p_interests) > 10 or exists(select 1 from unnest(p_interests) x where x is null or length(trim(x)) not between 1 and 40) then raise exception 'INVALID_PROFILE'; end if;
  if p_slots is null or cardinality(p_slots) > cardinality(s.weekdays) * s.period_count
    or exists (select 1 from unnest(p_slots) slot where slot is null or not (slot / 100 = any(s.weekdays)) or slot % 100 not between 1 and s.period_count)
    then raise exception 'INVALID_SLOTS'; end if;
  insert into public.profiles(id,display_name,department,admission_year,interests)
    values(actor,trim(p_name),nullif(trim(p_department),''),p_admission_year,p_interests)
    on conflict(id) do update set display_name=excluded.display_name, department=excluded.department, admission_year=excluded.admission_year, interests=excluded.interests;
  insert into public.availability values(actor,s.semester,array(select distinct unnest(p_slots) order by 1))
    on conflict(user_id,semester) do update set slots=excluded.slots;
  delete from public.time_proposals tp using public.meeting_members mm where tp.meeting_id=mm.meeting_id and mm.user_id=actor;
  update public.meetings m set confirmed_slot=null,meeting_date=null where confirmed_slot is not null
    and exists(select 1 from public.meeting_members mm where mm.meeting_id=m.id and mm.user_id=actor)
    and not (confirmed_slot=any(private.common_slots(m.id)));
end; $$;

create or replace function public.create_meeting(p_kind text, p_place text, p_capacity integer, p_topic text, p_pair boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid; s public.app_settings; result uuid;
begin
  perform private.lock_writes(); actor := private.require_member();
  select * into strict s from public.app_settings;
  if not exists(select 1 from public.availability where user_id=actor and semester=s.semester) then raise exception 'PROFILE_REQUIRED'; end if;
  if exists(select 1 from public.account_restrictions where user_id=actor) then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if p_kind is null or p_kind not in ('study','coffee','lunch') then raise exception 'INVALID_KIND'; end if;
  if p_topic is null or length(trim(p_topic)) not between 2 and 80 then raise exception 'INVALID_TOPIC'; end if;
  if p_place is null or not (p_place=any(s.public_places)) then raise exception 'INVALID_PLACE'; end if;
  if p_capacity is null or p_capacity not between 2 and 4 then raise exception 'INVALID_CAPACITY'; end if;
  if p_capacity=2 and p_pair is distinct from true then raise exception 'PAIR_CHOICE_REQUIRED'; end if;
  insert into public.meetings(host_id,semester,kind,place,capacity,topic) values(actor,s.semester,p_kind,p_place,p_capacity,trim(p_topic)) returning id into result;
  insert into public.meeting_members values(result,actor,now()); return result;
end; $$;

create or replace function public.join_meeting(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; m public.meetings;
begin
  perform private.lock_writes(); actor := private.require_member();
  select * into m from public.meetings where id=p_id and semester=(select semester from public.app_settings);
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if exists(select 1 from public.meeting_members where meeting_id=p_id and user_id=actor) then return; end if;
  if exists(select 1 from public.meeting_removals where meeting_id=p_id and user_id=actor) then raise exception 'MEETING_NOT_FOUND'; end if;
  if exists(select 1 from public.time_proposals where meeting_id=p_id) then raise exception 'PROPOSAL_PENDING'; end if;
  if exists(select 1 from public.blocks where (blocker_id=actor and blocked_id=m.host_id) or (blocker_id=m.host_id and blocked_id=actor)) then raise exception 'MEETING_NOT_FOUND'; end if;
  if not exists(select 1 from public.availability where user_id=actor and semester=m.semester) then raise exception 'PROFILE_REQUIRED'; end if;
  if (select count(*) from public.meeting_members where meeting_id=p_id)>=m.capacity then raise exception 'MEETING_FULL'; end if;
  if m.confirmed_slot is not null and not exists(select 1 from public.availability where user_id=actor and semester=m.semester and m.confirmed_slot=any(slots)) then raise exception 'TIME_CONFLICT'; end if;
  insert into public.meeting_members(meeting_id,user_id) values(p_id,actor);
end; $$;

create function public.set_meeting_availability(p_id uuid,p_slots integer[]) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; s public.app_settings;
begin
  perform private.lock_writes(); actor := private.require_member();
  if not exists(select 1 from public.meeting_members where meeting_id=p_id and user_id=actor) then raise exception 'MEMBER_ONLY'; end if;
  select * into strict s from public.app_settings;
  if p_slots is null or cardinality(p_slots)>cardinality(s.weekdays)*s.period_count or exists(select 1 from unnest(p_slots) slot where slot is null or not (slot/100=any(s.weekdays)) or slot%100 not between 1 and s.period_count) then raise exception 'INVALID_SLOTS'; end if;
  insert into public.meeting_availability values(p_id,actor,array(select distinct unnest(p_slots) order by 1)) on conflict(meeting_id,user_id) do update set slots=excluded.slots;
  delete from public.time_proposals where meeting_id=p_id;
  update public.meetings set confirmed_slot=null,meeting_date=null where id=p_id and confirmed_slot is not null and not (confirmed_slot=any(private.common_slots(p_id)));
end; $$;

create or replace function public.confirm_meeting(p_id uuid,p_slot integer,p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; m public.meetings;
begin
  perform private.lock_writes(); actor := private.require_member();
  select * into m from public.meetings where id=p_id and semester=(select semester from public.app_settings);
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if m.host_id<>actor then raise exception 'HOST_ONLY'; end if;
  if (select count(*) from public.meeting_members where meeting_id=p_id)<2 then raise exception 'WAIT_FOR_MEMBER'; end if;
  if p_slot is null or not (p_slot=any(private.common_slots(p_id))) then raise exception 'NO_COMMON_SLOT'; end if;
  if p_date is null or p_date<current_date or p_date>current_date+28 or extract(isodow from p_date)::integer<>p_slot/100 then raise exception 'INVALID_DATE'; end if;
  delete from public.time_proposals where meeting_id=p_id;
  update public.meetings set confirmed_slot=p_slot,meeting_date=p_date where id=p_id;
end; $$;
drop function public.confirm_meeting(uuid,integer);

create function public.propose_time(p_id uuid,p_slot integer,p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; s public.app_settings;
begin
  perform private.lock_writes(); actor := private.require_member();
  if not exists(select 1 from public.meetings where id=p_id and host_id=actor and confirmed_slot is null) then raise exception 'HOST_ONLY'; end if;
  if (select count(*) from public.meeting_members where meeting_id=p_id)<2 then raise exception 'WAIT_FOR_MEMBER'; end if;
  select * into strict s from public.app_settings;
  if p_slot is null or not (p_slot/100=any(s.weekdays)) or p_slot%100 not between 1 and s.period_count then raise exception 'INVALID_SLOTS'; end if;
  if p_date is null or p_date<current_date or p_date>current_date+28 or extract(isodow from p_date)::integer<>p_slot/100 then raise exception 'INVALID_DATE'; end if;
  if cardinality(private.common_slots(p_id))>0 then raise exception 'NO_COMMON_SLOT'; end if;
  delete from public.time_proposals where meeting_id=p_id;
  insert into public.time_proposals values(p_id,p_slot,p_date,now());
  insert into public.proposal_acceptances values(p_id,actor);
end; $$;
create function public.accept_time(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid; proposal public.time_proposals;
begin
  perform private.lock_writes(); actor := private.require_member();
  if not exists(select 1 from public.meeting_members where meeting_id=p_id and user_id=actor) then raise exception 'MEMBER_ONLY'; end if;
  select * into proposal from public.time_proposals where meeting_id=p_id;
  if not found then raise exception 'PROPOSAL_MISSING'; end if;
  if proposal.meeting_date<current_date then raise exception 'INVALID_DATE'; end if;
  insert into public.proposal_acceptances values(p_id,actor) on conflict do nothing;
  if (select count(*) from public.proposal_acceptances where meeting_id=p_id)=(select count(*) from public.meeting_members where meeting_id=p_id) then
    update public.meetings set confirmed_slot=proposal.slot,meeting_date=proposal.meeting_date where id=p_id;
    delete from public.time_proposals where meeting_id=p_id;
  end if;
end; $$;

create function public.add_comment(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := private.require_member();
  if not exists(select 1 from public.meeting_members where meeting_id=p_id and user_id=actor) then raise exception 'MEMBER_ONLY'; end if;
  if p_body is null or length(trim(p_body)) not between 1 and 1000 then raise exception 'INVALID_COMMENT'; end if;
  insert into public.meeting_comments(meeting_id,author_id,body) values(p_id,actor,trim(p_body));
end; $$;
create function public.get_comments(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := private.require_member();
  if not exists(select 1 from public.meeting_members where meeting_id=p_id and user_id=actor) then raise exception 'MEMBER_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,'mine',c.author_id=actor,'author',coalesce(nullif(p.department,''),'참여자')) order by c.created_at,c.id)
    from public.meeting_comments c left join public.profiles p on p.id=c.author_id where c.meeting_id=p_id),'[]'::jsonb);
end; $$;
create function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  perform private.lock_writes(); actor := private.require_member();
  if p_target is null or p_target=actor or not exists(select 1 from auth.users where id=p_target) then raise exception 'INVALID_TARGET'; end if;
  insert into public.blocks values(actor,p_target) on conflict do nothing;
  delete from public.meeting_members mm using public.meeting_members other,public.meetings m
    where mm.meeting_id=other.meeting_id and m.id=mm.meeting_id and other.user_id=p_target
      and ((mm.user_id=actor and m.host_id<>actor) or (mm.user_id=p_target and m.host_id=actor));
  delete from public.time_proposals tp where exists(select 1 from public.meetings m where m.id=tp.meeting_id and exists(select 1 from public.meeting_members mm where mm.meeting_id=m.id and mm.user_id in (actor,p_target)));
  update public.meetings m set confirmed_slot=null,meeting_date=null where confirmed_slot is not null
    and ((select count(*) from public.meeting_members where meeting_id=m.id)<2 or not (confirmed_slot=any(private.common_slots(m.id))));
end; $$;
create function public.leave_meeting(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  perform private.lock_writes(); actor := private.require_member();
  if exists(select 1 from public.meetings where id=p_id and host_id=actor) then raise exception 'HOST_ONLY'; end if;
  delete from public.meeting_members where meeting_id=p_id and user_id=actor;
  delete from public.time_proposals where meeting_id=p_id;
  update public.meetings set confirmed_slot=null,meeting_date=null where id=p_id and confirmed_slot is not null
    and ((select count(*) from public.meeting_members where meeting_id=p_id)<2 or not (confirmed_slot=any(private.common_slots(p_id))));
end; $$;
create function public.report_problem(p_meeting uuid, p_target uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := private.require_member();
  if (p_meeting is null)=(p_target is null) or p_reason is null or length(trim(p_reason)) not between 1 and 1000 then raise exception 'INVALID_REPORT'; end if;
  if p_meeting is not null and not exists(select 1 from public.meetings where id=p_meeting) then raise exception 'MEETING_NOT_FOUND'; end if;
  if p_target is not null and (p_target=actor or not exists(select 1 from auth.users where id=p_target)) then raise exception 'INVALID_TARGET'; end if;
  insert into public.reports(reporter_id,meeting_id,target_id,reason) values(actor,p_meeting,p_target,trim(p_reason));
end; $$;
create function public.remove_member(p_id uuid,p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  perform private.lock_writes(); actor := private.require_member();
  if not exists(select 1 from public.meetings where id=p_id and host_id=actor) then raise exception 'HOST_ONLY'; end if;
  if p_target=actor or not exists(select 1 from public.meeting_members where meeting_id=p_id and user_id=p_target) then raise exception 'INVALID_TARGET'; end if;
  insert into public.meeting_removals values(p_id,p_target) on conflict do nothing;
  delete from public.meeting_members where meeting_id=p_id and user_id=p_target;
  delete from public.time_proposals where meeting_id=p_id;
  update public.meetings set confirmed_slot=null,meeting_date=null where id=p_id and confirmed_slot is not null
    and ((select count(*) from public.meeting_members where meeting_id=p_id)<2 or not (confirmed_slot=any(private.common_slots(p_id))));
end; $$;

create or replace function public.get_meetings(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := private.require_member();
  return coalesce((select jsonb_agg(entry order by created_at desc,id) from (
    select m.id,m.created_at,jsonb_build_object(
      'id',m.id,'kind',m.kind,'topic',m.topic,'place',m.place,'capacity',m.capacity,
      'confirmed_slot',m.confirmed_slot,'meeting_date',m.meeting_date,'is_host',m.host_id=actor,
      'proposal',(select jsonb_build_object('slot',tp.slot,'meeting_date',tp.meeting_date,'accepted',exists(select 1 from public.proposal_acceptances pa where pa.meeting_id=m.id and pa.user_id=actor),'accepted_count',(select count(*) from public.proposal_acceptances where meeting_id=m.id)) from public.time_proposals tp where tp.meeting_id=m.id),
      'joined',exists(select 1 from public.meeting_members where meeting_id=m.id and user_id=actor),
      'my_slots',case when p_id is not null and exists(select 1 from public.meeting_members where meeting_id=m.id and user_id=actor) then private.effective_slots(m.id,actor) else '{}'::integer[] end,
      'member_count',(select count(*) from public.meeting_members where meeting_id=m.id),
      'common_slots',case when m.host_id=actor or (select count(*) from public.meeting_members where meeting_id=m.id)>=2 then private.common_slots(m.id) else '{}'::integer[] end,
      'my_overlap',(select coalesce(jsonb_agg(slot order by slot),'[]'::jsonb) from unnest(case when m.confirmed_slot is null then private.common_slots(m.id) else array[m.confirmed_slot] end) slot where slot=any(private.effective_slots(m.id,actor))),
      'members',case when p_id is null then '[]'::jsonb else
        (select coalesce(jsonb_agg(jsonb_build_object('id',mm.user_id,'name',coalesce(nullif(p.department,''),'참여자'),'department',p.department,'admission_year',p.admission_year,'interests',p.interests,'is_host',mm.user_id=m.host_id,'is_me',mm.user_id=actor) order by mm.joined_at,mm.user_id),'[]'::jsonb)
         from public.meeting_members mm join public.profiles p on p.id=mm.user_id where mm.meeting_id=m.id) end
    ) entry from public.meetings m
    where m.semester=(select semester from public.app_settings) and (p_id is null or m.id=p_id)
      and not exists(select 1 from public.blocks b where (b.blocker_id=actor and b.blocked_id=m.host_id) or (b.blocker_id=m.host_id and b.blocked_id=actor))
  ) entries),'[]'::jsonb);
end; $$;

alter table public.meeting_comments enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.account_restrictions enable row level security;
alter table public.meeting_removals enable row level security;
alter table public.meeting_availability enable row level security;
alter table public.time_proposals enable row level security;
alter table public.proposal_acceptances enable row level security;
revoke all on public.meeting_comments,public.blocks,public.reports,public.account_restrictions,public.meeting_removals,public.meeting_availability,public.time_proposals,public.proposal_acceptances from anon,authenticated;
revoke all on function private.effective_slots(uuid,uuid),private.restrict_reported_account() from public,anon,authenticated;
revoke all on function public.save_profile(text,integer[],text,integer,text[]),public.create_meeting(text,text,integer,text,boolean),public.confirm_meeting(uuid,integer,date),public.set_meeting_availability(uuid,integer[]),public.propose_time(uuid,integer,date),public.accept_time(uuid),public.add_comment(uuid,text),public.get_comments(uuid),public.block_user(uuid),public.leave_meeting(uuid),public.report_problem(uuid,uuid,text),public.remove_member(uuid,uuid) from public,anon;
grant execute on function public.save_profile(text,integer[],text,integer,text[]),public.create_meeting(text,text,integer,text,boolean),public.confirm_meeting(uuid,integer,date),public.set_meeting_availability(uuid,integer[]),public.propose_time(uuid,integer,date),public.accept_time(uuid),public.add_comment(uuid,text),public.get_comments(uuid),public.block_user(uuid),public.leave_meeting(uuid),public.report_problem(uuid,uuid,text),public.remove_member(uuid,uuid) to authenticated;
commit;
