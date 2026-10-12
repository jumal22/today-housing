-- ============================================================
-- 오늘의 하우징 · 회원/갤러리 스키마
-- 실행 위치: Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run
-- 여러 번 실행해도 되게(재실행 안전) 작성했어요.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 프로필 (닉네임) — 회원 한 명당 한 줄, 가입하면 자동 생성
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null,
  role        text not null default 'user',     -- user(일반 회원) / contractor(인테리어 업자) / admin(관리자)
  created_at  timestamptz not null default now(),
  constraint profiles_nickname_len check (char_length(nickname) between 2 and 12)
);
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(nickname));
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'contractor', 'admin'));
alter table public.profiles enable row level security;

-- 예전 칸(is_admin / is_expert)이 남아 있으면 role 로 옮기고 지운다 (재실행 안전)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin') then
    execute 'update public.profiles set role = ''admin'' where is_admin';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_expert') then
    execute 'update public.profiles set role = ''contractor'' where is_expert and role = ''user''';
  end if;
end;
$$;

-- 지금 로그인한 사람이 관리자인지 (RLS 규칙에서 사용)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())), false);
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 지금 요청이 "정식 회원"인지 (비회원 임시 세션(익명 로그인)은 false).
-- 비회원도 글은 올릴 수 있지만, 이미지 업로드·댓글·좋아요는 정식 회원만 되게 막는 데 쓴다.
create or replace function public.is_member()
returns boolean
language sql
stable
set search_path = public
as $$
  select (select auth.uid()) is not null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false;
$$;
grant execute on function public.is_member() to anon, authenticated;

alter table public.profiles drop column if exists is_admin;
alter table public.profiles drop column if exists is_expert;

-- 첫 관리자 지정(본인 이메일로 한 번만, 이 파일에는 이메일을 적지 않는다):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = '내 이메일');
-- 그 뒤로는 관리자 페이지(admin.html)에서 역할을 바꾼다.

-- 허용 문자(한글/영문/숫자/_)만 남기고 12자로 줄인 뒤, 겹치면 숫자를 붙여 유일한 닉네임을 만든다
create or replace function public.make_unique_nickname(raw text, uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := left(regexp_replace(coalesce(raw, ''), '[^0-9A-Za-z_가-힣]', '', 'g'), 12);
  if char_length(base) < 2 then
    base := 'user' || substr(replace(uid::text, '-', ''), 1, 6);
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where lower(nickname) = lower(candidate)) loop
    n := n + 1;
    if n > 999 then
      candidate := 'user' || substr(replace(uid::text, '-', ''), 1, 8);
      exit;
    end if;
    candidate := left(base, 12 - char_length(n::text)) || n::text;
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    public.make_unique_nickname(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      new.id
    )
  );
  return new;
end;
$$;

-- 이 함수들은 가입 트리거 안에서만 쓰므로 API로 직접 부르지 못하게 막는다
revoke execute on function public.make_unique_nickname(text, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입돼 있던 회원(테스트로 가입한 계정)에게도 프로필 만들어주기
do $$
declare
  r record;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    insert into public.profiles (id, nickname)
    values (
      r.id,
      public.make_unique_nickname(
        coalesce(
          nullif(trim(r.raw_user_meta_data ->> 'nickname'), ''),
          nullif(trim(r.raw_user_meta_data ->> 'full_name'), ''),
          nullif(trim(r.raw_user_meta_data ->> 'name'), ''),
          split_part(coalesce(r.email, ''), '@', 1)
        ),
        r.id
      )
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 2. 게시글
--    큰 이미지(썸네일/도면/벽 이미지)는 DB가 아니라 Storage(post-images)에 올리고
--    여기에는 파일 경로만 저장한다.
-- ------------------------------------------------------------
create table if not exists public.posts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  author_name       text check (author_name is null or char_length(author_name) between 1 and 12),  -- 비회원 글의 표시 이름(회원 글은 null)
  title             text not null check (char_length(title) between 1 and 80),
  room_w            numeric not null default 0,
  room_d            numeric not null default 0,
  wall_data         jsonb not null default '{}'::jsonb,   -- 벽 좌표(outer/inner), 벽 색 등
  furniture         jsonb not null default '[]'::jsonb,   -- 가구 배치
  thumb_path        text,                                  -- 썸네일 파일 경로
  floor_photo_path  text,                                  -- 도면 이미지(게시할 때 체크한 경우만)
  wall_image_paths  jsonb,                                 -- 벽 이미지 경로 배열(없는 벽은 null)
  like_count        integer not null default 0,
  comment_count     integer not null default 0,
  created_at        timestamptz not null default now(),
  constraint posts_wall_data_size check (pg_column_size(wall_data) < 300000),
  constraint posts_furniture_size check (pg_column_size(furniture) < 300000)
);
alter table public.posts add column if not exists author_name text;
alter table public.posts drop constraint if exists posts_author_name_len;
alter table public.posts add constraint posts_author_name_len check (author_name is null or char_length(author_name) between 1 and 12);
-- 글·댓글에서 작성자 닉네임/딱지(role)를 한 번에 가져오려고 profiles 로도 연결해 둔다
alter table public.posts drop constraint if exists posts_profile_fkey;
alter table public.posts add constraint posts_profile_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_like_count_idx on public.posts (like_count desc);
alter table public.posts enable row level security;

-- ------------------------------------------------------------
-- 3. 댓글(의견)
-- ------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
alter table public.comments drop constraint if exists comments_profile_fkey;
alter table public.comments add constraint comments_profile_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
create index if not exists comments_post_idx on public.comments (post_id, created_at);
alter table public.comments enable row level security;

-- ------------------------------------------------------------
-- 4. 좋아요 (회원 한 명이 글 하나에 한 번만)
-- ------------------------------------------------------------
create table if not exists public.likes (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.likes enable row level security;

-- 좋아요/댓글 수는 트리거가 자동으로 맞춘다 (클라이언트가 숫자를 직접 못 바꿈)
create or replace function public.bump_post_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'comments' then
    if tg_op = 'INSERT' then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    else
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
  elsif tg_table_name = 'likes' then
    if tg_op = 'INSERT' then
      update public.posts set like_count = like_count + 1 where id = new.post_id;
    else
      update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.bump_post_counts() from public, anon, authenticated;

drop trigger if exists comments_count_trg on public.comments;
create trigger comments_count_trg
  after insert or delete on public.comments
  for each row execute function public.bump_post_counts();

drop trigger if exists likes_count_trg on public.likes;
create trigger likes_count_trg
  after insert or delete on public.likes
  for each row execute function public.bump_post_counts();

-- ------------------------------------------------------------
-- 5. 접근 권한 (테이블 단위) — 자동 노출을 꺼둔 프로젝트라서 직접 열어준다
-- ------------------------------------------------------------
-- ------------------------------------------------------------
-- 관리자 페이지용 함수 — 이메일은 일반 방법으로는 읽을 수 없어서,
-- 관리자만 호출할 수 있는 함수로만 내려준다 (일반 회원이 부르면 forbidden)
-- ------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, nickname text, email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.nickname, u.email::text, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where not coalesce(u.is_anonymous, false)
    order by p.created_at desc
    limit 1000;
end;
$$;

-- 역할 바꾸기. 관리자 본인의 역할은 못 바꿔서(= 관리자가 0명이 되는 사고 방지) 항상 한 명 이상 남는다
create or replace function public.admin_set_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('user', 'contractor', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if target = (select auth.uid()) then
    raise exception 'cannot_change_self' using errcode = 'P0001';
  end if;
  update public.profiles set role = new_role where id = target;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (nickname) on public.profiles to authenticated;      -- role 은 못 바꿈(관리자 함수로만)

grant select on public.posts to anon, authenticated;
grant insert, delete on public.posts to authenticated;
grant update (title) on public.posts to authenticated;

grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;

grant select, insert, delete on public.likes to authenticated;

-- ------------------------------------------------------------
-- 6. 행 단위 보안 규칙(RLS) — "누가 어떤 행을 볼/바꿀 수 있나"
-- ------------------------------------------------------------
-- 프로필: 누구나 닉네임을 볼 수 있고, 내 닉네임만 바꿀 수 있다
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select to anon, authenticated using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- 게시글: 누구나 보고, 로그인한 사람만 내 이름으로 쓰고, 내 글만 고친다. 삭제는 내 글 또는 관리자(모든 글)
drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all" on public.posts
  for select to anon, authenticated using (true);
drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      (public.is_member() and author_name is null)                                   -- 회원: 닉네임은 프로필 것을 쓴다
      or (not public.is_member() and author_name is not null and char_length(btrim(author_name)) >= 1)  -- 비회원: 입력한 이름
    )
    -- 이미지(썸네일/도면/벽 이미지) 경로는 정식 회원만 달 수 있다 (비회원은 이미지 없는 글만)
    and (public.is_member() or (thumb_path is null and floor_photo_path is null and wall_image_paths is null))
  );
drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "posts_delete_own" on public.posts;
drop policy if exists "posts_delete_own_or_admin" on public.posts;
create policy "posts_delete_own_or_admin" on public.posts
  for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

-- 댓글: 누구나 보고, 로그인하면 쓰고, 삭제는 내 댓글 또는 관리자(모든 댓글)
drop policy if exists "comments_select_all" on public.comments;
create policy "comments_select_all" on public.comments
  for select to anon, authenticated using (true);
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
  for insert to authenticated with check ((select auth.uid()) = user_id and public.is_member());
drop policy if exists "comments_delete_own" on public.comments;
drop policy if exists "comments_delete_own_or_admin" on public.comments;
create policy "comments_delete_own_or_admin" on public.comments
  for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

-- 좋아요: 내 좋아요만 보고, 내 이름으로만 누르고 취소한다
drop policy if exists "likes_select_own" on public.likes;
create policy "likes_select_own" on public.likes
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes
  for insert to authenticated with check ((select auth.uid()) = user_id and public.is_member());
drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- 7. 이미지 저장소 (Storage) — 읽기는 공개, 쓰기는 내 폴더(<내 id>/...)에만
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "post_images_read" on storage.objects;
create policy "post_images_read" on storage.objects
  for select using (bucket_id = 'post-images');

drop policy if exists "post_images_upload_own_folder" on storage.objects;
create policy "post_images_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and public.is_member() and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "post_images_delete_own_folder" on storage.objects;
drop policy if exists "post_images_delete_own_or_admin" on storage.objects;
create policy "post_images_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-images'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );
-- ------------------------------------------------------------
-- 8. 댓글 답글 (디시 스타일: 답글은 원댓글 아래 한 줄로 쭉 이어진다)
--    parent_id 가 있으면 답글. 답글에 또 답글을 달아도 항상 "원댓글"에 붙는다.
-- ------------------------------------------------------------
alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);

create or replace function public.comments_normalize_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p_post uuid;
  p_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select c.post_id, c.parent_id into p_post, p_parent
    from public.comments c where c.id = new.parent_id;
  if not found or p_post <> new.post_id then
    raise exception 'invalid_parent' using errcode = '22023';
  end if;
  if p_parent is not null then
    new.parent_id := p_parent;   -- 답글의 답글 → 원댓글 밑으로 모은다
  end if;
  return new;
end;
$$;

create or replace trigger comments_parent_trg
  before insert on public.comments
  for each row execute function public.comments_normalize_parent();

-- ------------------------------------------------------------
-- 9. 비회원(유동)도 의견·답글·하트 가능 — 디시 방식
--    · 비회원 글/댓글 옆에 접속 IP 앞 두 자리를 표시 (전체 IP는 화면에 안 나온다)
--    · 도배 쿨타임: 글 회원 30초/비회원 60초, 의견·답글 회원 5초/비회원 10초 (비회원은 IP 기준)
--    · 하트: 비회원은 같은 IP에서 글 하나에 1번만 (회원은 계정당 1번)
-- ------------------------------------------------------------

-- 접속 IP 읽기: PostgREST 가 요청 헤더를 넘겨준다. 변조하기 어려운 헤더부터 쓴다.
create or replace function public.request_ip()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  h json;
  ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null then
    return null;
  end if;
  ip := coalesce(
    nullif(btrim(h ->> 'cf-connecting-ip'), ''),
    nullif(btrim(h ->> 'x-real-ip'), ''),
    nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
  return ip;
end;
$$;

-- 화면에 보여줄 앞부분만: 123.45.67.89 → 123.45 / 2001:db8::1 → 2001:db8
create or replace function public.mask_ip(raw text)
returns text
language sql
immutable
as $$
  select case
    when ip is null or ip = '' then null
    when position(':' in ip) > 0 then split_part(ip, ':', 1) || ':' || split_part(ip, ':', 2)
    else split_part(ip, '.', 1) || '.' || split_part(ip, '.', 2)
  end
  from (select replace(lower(coalesce(raw, '')), '::ffff:', '') as ip) s
$$;

revoke execute on function public.request_ip() from public, anon, authenticated;

-- 내 IP 앞부분만 알려주는 함수 (비회원 입력칸 옆에 "(123.45)" 로 미리 보여주려고)
create or replace function public.my_ip_prefix()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.mask_ip(public.request_ip())
$$;
revoke execute on function public.my_ip_prefix() from public;
grant execute on function public.my_ip_prefix() to anon, authenticated;

-- 쿨타임·하트 중복 확인용 기록 (IP는 해시로만 저장, 화면/API로는 아무도 못 읽는다)
create table if not exists public.ip_log (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('post', 'comment', 'like')),
  post_id     uuid references public.posts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  ip_hash     text not null,
  guest       boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists ip_log_ip_idx on public.ip_log (kind, ip_hash, created_at desc);
create index if not exists ip_log_user_idx on public.ip_log (kind, user_id, created_at desc);
create index if not exists ip_log_created_idx on public.ip_log (created_at);
alter table public.ip_log enable row level security;
revoke all on public.ip_log from anon, authenticated;

-- 비회원 표시 이름·IP 앞부분 컬럼
alter table public.comments add column if not exists author_name text;
alter table public.comments add column if not exists ip_prefix text;
alter table public.comments drop constraint if exists comments_author_name_fmt;
alter table public.comments add constraint comments_author_name_fmt
  check (author_name is null or author_name ~ '^[0-9A-Za-z_가-힣]{2,12}$');
alter table public.posts add column if not exists ip_prefix text;

-- 글·의견을 쓸 때: 이름 확인 + IP 앞부분 기록 + 쿨타임
create or replace function public.guard_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := tg_argv[0];
  ip text := public.request_ip();
  is_guest boolean := new.author_name is not null;
  hkey text := encode(sha256(convert_to(coalesce(ip, 'u:' || new.user_id::text) || ':oh1', 'utf8')), 'hex');
  wait_s integer;
  last_at timestamptz;
  pw_salt text;
begin
  if is_guest then
    -- 비회원 닉네임은 디시처럼 중복 가능. 관리자를 흉내내는 이름만 막는다
    -- (비회원 글에는 '비회원' 표시와 IP 앞자리가 항상 붙어서 회원과 구분된다)
    if lower(new.author_name) in ('관리자', '운영자', '운영진', 'admin', 'administrator') then
      raise exception 'nickname_taken' using errcode = 'P0001';
    end if;
    -- 삭제용 비밀번호: 숫자 4~6자리
    if new.guest_pw is null or new.guest_pw !~ '^[0-9]{4,6}$' then
      raise exception 'invalid_pw' using errcode = 'P0001';
    end if;
  end if;

  wait_s := case
    when k = 'post' then (case when is_guest then 60 else 30 end)
    else (case when is_guest then 10 else 5 end)
  end;

  select max(l.created_at) into last_at
    from public.ip_log l
   where l.kind = k
     and l.created_at > now() - interval '5 minutes'
     and (l.user_id = new.user_id or (is_guest and l.guest and l.ip_hash = hkey));

  if last_at is not null and last_at > now() - make_interval(secs => wait_s) then
    raise exception 'cooldown'
      using errcode = 'P0001',
            detail = ceil(extract(epoch from (last_at + make_interval(secs => wait_s) - now())))::text;
  end if;

  insert into public.ip_log (kind, post_id, user_id, ip_hash, guest)
  values (k, case when k = 'comment' then (to_jsonb(new) ->> 'post_id')::uuid else null end, new.user_id, hkey, is_guest);

  if random() < 0.05 then
    delete from public.ip_log where kind in ('post', 'comment', 'pwfail') and created_at < now() - interval '1 day';
  end if;

  -- 비밀번호는 해시로만 따로 저장하고, 글/댓글 행에는 남기지 않는다
  if is_guest then
    pw_salt := gen_random_uuid()::text;
    insert into public.guest_pw (kind, target_id, salt, pw_hash)
    values (k, new.id, pw_salt, encode(sha256(convert_to(pw_salt || ':' || new.guest_pw, 'utf8')), 'hex'));
  end if;
  new.guest_pw := null;

  new.ip_prefix := case when is_guest then public.mask_ip(ip) else null end;
  return new;
end;
$$;
revoke execute on function public.guard_write() from public, anon, authenticated;

create or replace trigger comments_guard_trg
  before insert on public.comments
  for each row execute function public.guard_write('comment');
create or replace trigger posts_guard_trg
  before insert on public.posts
  for each row execute function public.guard_write('post');

-- 하트: 비회원은 같은 IP에서 글 하나에 한 번만. 취소하면 그 기록도 지운다.
create or replace function public.guard_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ip text := public.request_ip();
  hkey text;
begin
  if tg_op = 'DELETE' then
    delete from public.ip_log where kind = 'like' and post_id = old.post_id and user_id = old.user_id;
    return old;
  end if;
  if not public.is_member() then
    hkey := encode(sha256(convert_to(coalesce(ip, 'u:' || new.user_id::text) || ':oh1', 'utf8')), 'hex');
    if exists (
      select 1 from public.ip_log l
       where l.kind = 'like' and l.post_id = new.post_id and l.guest and l.ip_hash = hkey
    ) then
      raise exception 'ip_already_liked' using errcode = 'P0001';
    end if;
    insert into public.ip_log (kind, post_id, user_id, ip_hash, guest)
    values ('like', new.post_id, new.user_id, hkey, true);
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_like() from public, anon, authenticated;

create or replace trigger likes_guard_trg
  before insert or delete on public.likes
  for each row execute function public.guard_like();

-- 비회원도 의견·하트 가능
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      (public.is_member() and author_name is null)                 -- 회원: 프로필 닉네임
      or (not public.is_member() and author_name is not null)      -- 비회원: 입력한 이름
    )
  );
drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- 10. 비회원 삭제 비밀번호 (숫자 4~6자리) — 글/의견/답글을 쓸 때 정하고, 지울 때 입력한다
--     비밀번호는 해시로만 저장(guest_pw), 아무도 API로 읽을 수 없다. 틀리면 기록되어 시도 횟수가 제한된다.
-- ------------------------------------------------------------
create table if not exists public.guest_pw (
  kind        text not null check (kind in ('post', 'comment')),
  target_id   uuid not null,
  salt        text not null,
  pw_hash     text not null,
  created_at  timestamptz not null default now(),
  primary key (kind, target_id)
);
alter table public.guest_pw enable row level security;
revoke all on public.guest_pw from anon, authenticated;

-- 글/댓글 입력에서만 잠깐 쓰는 칸 (트리거가 해시로 옮기고 바로 비운다)
alter table public.posts add column if not exists guest_pw text;
alter table public.comments add column if not exists guest_pw text;

-- 비밀번호 오입력 기록용 (로그인 안 한 사람도 지울 수 있으니 user_id 는 비어 있을 수 있다)
alter table public.ip_log alter column user_id drop not null;
alter table public.ip_log add column if not exists target_id uuid;
alter table public.ip_log drop constraint if exists ip_log_kind_check;
alter table public.ip_log add constraint ip_log_kind_check check (kind in ('post', 'comment', 'like', 'pwfail'));
create index if not exists ip_log_target_idx on public.ip_log (kind, target_id, created_at desc);

create or replace function public.cleanup_guest_pw()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.guest_pw where kind = tg_argv[0] and target_id = old.id;
  return null;
end;
$$;
revoke execute on function public.cleanup_guest_pw() from public, anon, authenticated;

create or replace trigger posts_pw_cleanup_trg
  after delete on public.posts
  for each row execute function public.cleanup_guest_pw('post');
create or replace trigger comments_pw_cleanup_trg
  after delete on public.comments
  for each row execute function public.cleanup_guest_pw('comment');

-- 비밀번호로 비회원 글/댓글 지우기. 같은 IP 10분에 5번, 같은 글 1시간에 10번 틀리면 잠시 막는다.
create or replace function public.delete_guest_item(p_kind text, p_id uuid, p_pw text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ip text := public.request_ip();
  hkey text := encode(sha256(convert_to(coalesce(ip, 'unknown') || ':oh1', 'utf8')), 'hex');
  rec public.guest_pw%rowtype;
  fails_ip integer;
  fails_target integer;
  n integer;
begin
  if p_kind not in ('post', 'comment') or p_id is null then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;
  if p_pw is null or p_pw !~ '^[0-9]{4,6}$' then
    raise exception 'invalid_pw' using errcode = 'P0001';
  end if;

  select count(*) into fails_ip from public.ip_log
   where kind = 'pwfail' and ip_hash = hkey and created_at > now() - interval '10 minutes';
  select count(*) into fails_target from public.ip_log
   where kind = 'pwfail' and target_id = p_id and created_at > now() - interval '1 hour';
  if fails_ip >= 5 or fails_target >= 10 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  select * into rec from public.guest_pw where kind = p_kind and target_id = p_id;
  if not found then
    return false;   -- 회원 글이거나 이미 지워진 글
  end if;

  if rec.pw_hash <> encode(sha256(convert_to(rec.salt || ':' || p_pw, 'utf8')), 'hex') then
    insert into public.ip_log (kind, target_id, ip_hash, guest) values ('pwfail', p_id, hkey, true);
    return false;
  end if;

  if p_kind = 'post' then
    delete from public.posts where id = p_id and author_name is not null;
  else
    delete from public.comments where id = p_id and author_name is not null;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function public.delete_guest_item(text, uuid, text) from public;
grant execute on function public.delete_guest_item(text, uuid, text) to anon, authenticated;
