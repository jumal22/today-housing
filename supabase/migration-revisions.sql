
-- =====================================================================
-- 13. 배치 수정 변경안 — 댓글에 "내가 이렇게 바꿔봤어요"를 붙인다
--   · comment_revisions 한 줄 = 변경안 한 버전. 댓글(또는 작성자가 다시 수정하며 자동으로 다는 알림 답글)에 붙는다.
--   · changes(JSON)에는 "원본 게시글 대비 바뀐 것"만 들어간다(가구 이동/추가/삭제 + 벽 색). Before = 원본, After = 변경안.
--   · 최초 변경안은 최상위 댓글에만, 이후 버전은 그 댓글 작성자 본인이 자기 댓글 아래 알림 답글로만 붙인다(버전은 서버가 매김).
--   · 댓글이 지워지면(작성자/관리자) 변경안도 함께 지워진다(on delete cascade). 누구나 읽을 수 있다.
-- =====================================================================
create table if not exists public.comment_revisions (
  comment_id  uuid primary key references public.comments (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  root_id     uuid not null references public.comments (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  version     integer not null default 1,
  changes     jsonb not null,
  created_at  timestamptz not null default now(),
  constraint comment_revisions_size check (pg_column_size(changes) < 120000),
  constraint comment_revisions_shape check (
    jsonb_typeof(changes) = 'object'
    and jsonb_typeof(changes -> 'furniture') = 'array'
    and jsonb_typeof(changes -> 'walls') = 'array'
    and jsonb_array_length(changes -> 'furniture') + jsonb_array_length(changes -> 'walls') between 1 and 80
  )
);
create index if not exists comment_revisions_post_idx on public.comment_revisions (post_id, root_id, version);
alter table public.comment_revisions enable row level security;

grant select on public.comment_revisions to anon, authenticated;
grant insert on public.comment_revisions to authenticated;

drop policy if exists "comment_revisions_select_all" on public.comment_revisions;
create policy "comment_revisions_select_all" on public.comment_revisions
  for select to anon, authenticated using (true);
drop policy if exists "comment_revisions_insert_own" on public.comment_revisions;
create policy "comment_revisions_insert_own" on public.comment_revisions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_member());

-- 규칙 검사 + root_id/version 자동 채움 (클라이언트가 보낸 값은 무시)
create or replace function public.comment_revisions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.comments%rowtype;
  p public.comments%rowtype;
  n integer;
begin
  select * into c from public.comments where id = new.comment_id;
  if not found or c.user_id <> new.user_id or c.post_id <> new.post_id then
    raise exception 'invalid_revision_target' using errcode = '22023';
  end if;
  if c.parent_id is null then
    new.root_id := c.id;
    new.version := 1;
  else
    -- 이후 버전: 원댓글 작성자 본인이 자기 원댓글 밑에 다는 답글에만 붙일 수 있고, 원댓글에 최초 변경안(1)이 이미 있어야 한다
    select * into p from public.comments where id = c.parent_id;
    if not found or p.user_id <> c.user_id then
      raise exception 'revision_owner_only' using errcode = '42501';
    end if;
    if not exists (select 1 from public.comment_revisions r where r.comment_id = p.id) then
      raise exception 'revision_root_missing' using errcode = '22023';
    end if;
    select coalesce(max(r.version), 0) into n from public.comment_revisions r where r.root_id = p.id;
    if n >= 30 then
      raise exception 'revision_limit' using errcode = 'P0001';
    end if;
    new.root_id := p.id;
    new.version := n + 1;
  end if;
  return new;
end;
$$;
revoke execute on function public.comment_revisions_guard() from public, anon, authenticated;

drop trigger if exists comment_revisions_guard_trg on public.comment_revisions;
create trigger comment_revisions_guard_trg
  before insert on public.comment_revisions
  for each row execute function public.comment_revisions_guard();
