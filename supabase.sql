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
