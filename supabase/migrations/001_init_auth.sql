do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'system_role' and n.nspname = 'public'
  ) then
    create type "public"."system_role" as enum ('admin','user');
  end if;
end $$;

create table if not exists "public"."profiles" (
  "id" uuid primary key not null,
  "email" text not null,
  "system_role" "public"."system_role" default 'user' not null,
  "full_name" text,
  "phone" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null
);

alter table "public"."profiles" enable row level security;

create or replace function "public"."handle_new_user"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into "public"."profiles" ("id","email","system_role")
  values (new.id, new.email, 'user')
  on conflict ("id") do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function "public"."handle_new_user"();

drop policy if exists "profiles_select_own" on "public"."profiles";
create policy "profiles_select_own"
on "public"."profiles"
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on "public"."profiles";
create policy "profiles_update_own"
on "public"."profiles"
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
alter table "public"."profiles" add column if not exists "system_role" "public"."system_role" default 'user' not null;
