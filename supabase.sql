-- Supabase SQL Editor에서 한 번 실행하세요.
create table if not exists public.pms_docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);

alter table public.pms_docs enable row level security;

-- 주의: anon key를 아는 누구나 읽고 쓸 수 있는 정책입니다.
-- 로그인 기능을 붙이기 전까지는 URL을 공개하지 마세요.
drop policy if exists "pms_all" on public.pms_docs;
create policy "pms_all" on public.pms_docs
  for all to anon using (true) with check (true);

-- 테이블을 API가 바로 인식하도록 스키마 캐시를 새로고침합니다.
notify pgrst, 'reload schema';
