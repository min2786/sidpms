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
