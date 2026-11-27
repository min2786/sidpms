-- Supabase SQL Editor에서 한 번 실행하세요.
create table if not exists public.pms_docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);

alter table public.pms_docs enable row level security;

-- 로그인한 사용자만 읽고 쓸 수 있습니다. (이전의 anon 공개 정책은 제거)
drop policy if exists "pms_all" on public.pms_docs;
drop policy if exists "pms_auth" on public.pms_docs;
create policy "pms_auth" on public.pms_docs
  for all to authenticated using (true) with check (true);

-- 테이블을 API가 바로 인식하도록 스키마 캐시를 새로고침합니다.
notify pgrst, 'reload schema';

-- ===== 이미지 업로드(컨텐츠 현황)용 Storage 설정 =====
-- 비공개 버킷을 만들고, 로그인한 사용자만 읽고/쓰고/지울 수 있게 합니다.
insert into storage.buckets (id, name, public)
values ('pms-images', 'pms-images', false)
on conflict (id) do nothing;

drop policy if exists "pms_img_auth" on storage.objects;
create policy "pms_img_auth" on storage.objects
  for all to authenticated
  using (bucket_id = 'pms-images')
  with check (bucket_id = 'pms-images');

-- 실시간 알림: UPDATE 웹훅에서 변경 전 데이터(old_record)를 받으려면 필요합니다.
alter table public.pms_docs replica identity full;

-- 회의 녹음 임시 저장용 비공개 버킷 (정리가 끝나면 서버가 자동 삭제). 파일당 최대 100MB
insert into storage.buckets (id, name, public, file_size_limit) values ('pms-audio','pms-audio',false,104857600)
  on conflict (id) do nothing;
drop policy if exists pms_audio_auth on storage.objects;
create policy pms_audio_auth on storage.objects for all to authenticated
  using (bucket_id = 'pms-audio') with check (bucket_id = 'pms-audio');

-- ===== 관리자 페이지: 사용량 기록 + 회원 권한 =====
-- 직접 접근은 모두 막고(RLS 정책 없음), 아래 보안 함수로만 읽고 씁니다.
create table if not exists public.pms_roles (
  user_id uuid primary key,
  email text,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now()
);
alter table public.pms_roles enable row level security;

create table if not exists public.pms_usage_log (
  day date primary key,
  snap jsonb not null,
  at timestamptz not null default now()
);
alter table public.pms_usage_log enable row level security;

-- 관리자 확인. 관리자가 아직 없으면 "가장 먼저 가입한 계정"이 관리자가 됩니다.
create or replace function public.pms_admin_check() returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  if not exists (select 1 from public.pms_roles where role = 'admin')
     and uid = (select id from auth.users order by created_at asc limit 1) then
    insert into public.pms_roles (user_id, email, role)
    values (uid, (select email from auth.users where id = uid), 'admin')
    on conflict (user_id) do update set role = 'admin';
  end if;
  return exists (select 1 from public.pms_roles where user_id = uid and role = 'admin');
end $$;

-- 현재 사용량 계산 (내부용)
create or replace function public.pms_usage_calc() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'docs_bytes', pg_total_relation_size('public.pms_docs'),
    'docs_rows', (select count(*) from public.pms_docs),
    'cols', coalesce((select jsonb_object_agg(col, jsonb_build_object('n', n, 'bytes', b))
              from (select col, count(*) n, sum(pg_column_size(data))::bigint b from public.pms_docs group by col) x), '{}'::jsonb),
    'storage', coalesce((select jsonb_object_agg(bucket_id, jsonb_build_object('n', n, 'bytes', b))
              from (select bucket_id, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0)::bigint b from storage.objects group by bucket_id) y), '{}'::jsonb),
    'users', (select count(*) from auth.users)
  );
$$;

-- 하루 한 번 기록 (pg_cron 또는 관리자 페이지를 열 때)
create or replace function public.pms_usage_snapshot() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.pms_usage_log (day, snap) values ((now() at time zone 'Asia/Seoul')::date, public.pms_usage_calc())
  on conflict (day) do update set snap = excluded.snap, at = now();
end $$;
revoke all on function public.pms_usage_calc() from public, anon, authenticated;
revoke all on function public.pms_usage_snapshot() from public, anon, authenticated;

create or replace function public.pms_usage_now() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.pms_admin_check() then raise exception 'forbidden'; end if;
  perform public.pms_usage_snapshot();
  return public.pms_usage_calc() || jsonb_build_object('at', now());
end $$;

create or replace function public.pms_usage_history(days int default 400) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.pms_admin_check() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('day', day) || snap order by day)
                   from public.pms_usage_log where day >= current_date - days), '[]'::jsonb);
end $$;

create or replace function public.pms_members() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.pms_admin_check() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
           'last_sign_in_at', u.last_sign_in_at, 'role', r.role) order by u.created_at)
         from auth.users u left join public.pms_roles r on r.user_id = u.id), '[]'::jsonb);
end $$;

create or replace function public.pms_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pms_admin_check() then raise exception 'forbidden'; end if;
  if new_role is null or new_role = 'none' then
    if (select role from public.pms_roles where user_id = target) = 'admin'
       and (select count(*) from public.pms_roles where role = 'admin') <= 1 then
      raise exception '마지막 관리자는 해제할 수 없습니다';
    end if;
    delete from public.pms_roles where user_id = target;
    return;
  end if;
  if new_role not in ('admin','editor','viewer') then raise exception 'invalid role'; end if;
  if new_role <> 'admin' and (select role from public.pms_roles where user_id = target) = 'admin'
     and (select count(*) from public.pms_roles where role = 'admin') <= 1 then
    raise exception '마지막 관리자는 변경할 수 없습니다';
  end if;
  insert into public.pms_roles (user_id, email, role)
  values (target, (select email from auth.users where id = target), new_role)
  on conflict (user_id) do update set role = excluded.role;
end $$;

revoke all on function public.pms_admin_check() from public, anon;
revoke all on function public.pms_usage_now() from public, anon;
revoke all on function public.pms_usage_history(int) from public, anon;
revoke all on function public.pms_members() from public, anon;
revoke all on function public.pms_set_role(uuid, text) from public, anon;
grant execute on function public.pms_admin_check() to authenticated;
grant execute on function public.pms_usage_now() to authenticated;
grant execute on function public.pms_usage_history(int) to authenticated;
grant execute on function public.pms_members() to authenticated;
grant execute on function public.pms_set_role(uuid, text) to authenticated;

-- 매일 00:05(KST) 자동 기록 (pg_cron을 쓸 수 없으면 건너뜁니다 — 관리자 페이지를 여는 날은 기록됩니다)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('pms_usage_daily', '5 15 * * *', 'select public.pms_usage_snapshot()');
exception when others then
  raise notice 'pg_cron 설정을 건너뜁니다: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
