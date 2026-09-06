-- Run once in your Supabase project's SQL Editor before enabling generation.
-- Stores counts and an expiring request ID only. No coursework or passwords.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.ai_usage (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  counts integer[] not null default array[0, 0, 0, 0],
  resets_at timestamptz[] not null default array['epoch'::timestamptz, 'epoch'::timestamptz, 'epoch'::timestamptz, 'epoch'::timestamptz],
  active_request uuid,
  active_until timestamptz
);
alter table private.ai_usage enable row level security;
revoke all on private.ai_usage from public, anon, authenticated;

create or replace function public.reserve_ai_generation(p_owner uuid, p_request uuid, p_limits integer[])
returns integer[]
language plpgsql security definer set search_path = ''
as $$
declare
  usage private.ai_usage%rowtype;
  stamp timestamptz;
  periods integer[] := array[60, 3600, 86400, 2592000];
  ceilings integer[] := array[30, 100, 200, 1000];
  i integer;
begin
  if p_owner is null or p_request is null or p_limits is null or
      cardinality(p_limits) <> 4 or array_lower(p_limits, 1) <> 1 then
    raise exception 'Invalid usage reservation';
  end if;
  for i in 1..4 loop
    if p_limits[i] is null or p_limits[i] < 1 or p_limits[i] > ceilings[i] then
      raise exception 'Invalid usage limits';
    end if;
  end loop;
  insert into private.ai_usage(owner_id) values(p_owner) on conflict do nothing;
  -- Serialize competing requests across every Vercel instance.
  select * into strict usage from private.ai_usage where owner_id = p_owner for update;
  stamp := clock_timestamp();
  for i in 1..4 loop
    if usage.resets_at[i] <= stamp then
      usage.counts[i] := 0;
      usage.resets_at[i] := stamp + make_interval(secs => periods[i]);
    end if;
    if usage.counts[i] >= p_limits[i] then
      return array[0, i, greatest(1, ceil(extract(epoch from usage.resets_at[i] - stamp))::integer)];
    end if;
  end loop;
  if usage.active_until > stamp then
    return array[0, 5, greatest(1, ceil(extract(epoch from usage.active_until - stamp))::integer)];
  end if;
  for i in 1..4 loop usage.counts[i] := usage.counts[i] + 1; end loop;
  update private.ai_usage set counts = usage.counts, resets_at = usage.resets_at,
    active_request = p_request, active_until = stamp + interval '90 seconds'
    where owner_id = p_owner;
  return array[1, 0, 0];
end;
$$;

create or replace function public.release_ai_generation(p_owner uuid, p_request uuid)
returns void
language sql security definer set search_path = ''
as $$
  update private.ai_usage set active_request = null, active_until = null
  where owner_id = p_owner and active_request = p_request;
$$;

-- Functions default to PUBLIC execution. Only the Vercel server secret may call these.
revoke all on function public.reserve_ai_generation(uuid, uuid, integer[]) from public, anon, authenticated;
revoke all on function public.release_ai_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_generation(uuid, uuid, integer[]) to service_role;
grant execute on function public.release_ai_generation(uuid, uuid) to service_role;
commit;
