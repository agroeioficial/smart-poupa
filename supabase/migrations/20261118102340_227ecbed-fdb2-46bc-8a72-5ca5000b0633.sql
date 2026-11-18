-- ===================== Tipos =====================
create type public.platform_role as enum ('agroei_owner');
create type public.group_role as enum ('diretor','tesoureiro','secretario','membro');
create type public.member_status as enum ('convidado','ativo','suspenso','excluido');
create type public.group_status as enum ('ativo','suspenso');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;

-- ===================== profiles =====================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- ===================== platform_roles =====================
create table public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.platform_roles to authenticated;
grant all on public.platform_roles to service_role;
alter table public.platform_roles enable row level security;
create policy "platform_roles_select_own" on public.platform_roles for select to authenticated using (user_id = auth.uid());

create table public.platform_role_invites (
  email text primary key,
  role public.platform_role not null default 'agroei_owner',
  created_at timestamptz not null default now()
);
grant all on public.platform_role_invites to service_role;
alter table public.platform_role_invites enable row level security;

-- ===================== groups =====================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  location text,
  official_phone text,
  official_email text,
  status public.group_status not null default 'ativo',
  member_directory_visible boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.groups to authenticated;
grant all on public.groups to service_role;
alter table public.groups enable row level security;
create trigger groups_updated_at before update on public.groups for each row execute function public.set_updated_at();

-- ===================== group_members =====================
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  user_id uuid,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text,
  profession text,
  status public.member_status not null default 'convidado',
  joined_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index group_members_group_idx on public.group_members(group_id);
create index group_members_user_idx on public.group_members(user_id);
grant select on public.group_members to authenticated;
grant all on public.group_members to service_role;
alter table public.group_members enable row level security;
create trigger group_members_updated_at before update on public.group_members for each row execute function public.set_updated_at();

-- ===================== group_member_roles =====================
create table public.group_member_roles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  member_id uuid not null references public.group_members(id) on delete cascade,
  role public.group_role not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (member_id, role)
);
create index group_member_roles_group_idx on public.group_member_roles(group_id);
grant select on public.group_member_roles to authenticated;
grant all on public.group_member_roles to service_role;
alter table public.group_member_roles enable row level security;

-- ===================== member_private_data =====================
create table public.member_private_data (
  member_id uuid primary key references public.group_members(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete restrict,
  email text not null,
  id_document_type text,
  id_document_number text,
  birth_date date,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index member_private_data_group_email_uidx on public.member_private_data (group_id, lower(email));
create index member_private_data_email_idx on public.member_private_data (lower(email));
grant select on public.member_private_data to authenticated;
grant all on public.member_private_data to service_role;
alter table public.member_private_data enable row level security;
create trigger member_private_data_updated_at before update on public.member_private_data for each row execute function public.set_updated_at();

-- ===================== audit_log =====================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete restrict,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_group_idx on public.audit_log(group_id, created_at desc);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;

-- ===================== Funções auxiliares (security definer) =====================
create or replace function public.is_platform_owner(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_roles where user_id = _uid and role = 'agroei_owner')
$$;

create or replace function public.is_active_member(_uid uuid, _group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members
                 where user_id = _uid and group_id = _group and status = 'ativo')
$$;

create or replace function public.has_pending_invite(_uid uuid, _group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members
                 where user_id = _uid and group_id = _group and status = 'convidado')
$$;

create or replace function public.has_group_role(_uid uuid, _group uuid, _role public.group_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_member_roles r
    join public.group_members gm on gm.id = r.member_id
    where gm.user_id = _uid and gm.group_id = _group and r.group_id = _group
      and gm.status = 'ativo' and r.role = _role)
$$;

create or replace function public.is_group_admin(_uid uuid, _group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_member_roles r
    join public.group_members gm on gm.id = r.member_id
    where gm.user_id = _uid and gm.group_id = _group and r.group_id = _group
      and gm.status = 'ativo' and r.role in ('diretor','tesoureiro','secretario'))
$$;

create or replace function public.can_manage_members(_uid uuid, _group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_group_role(_uid, _group, 'diretor') or public.has_group_role(_uid, _group, 'secretario')
$$;

create or replace function public.group_directory_visible(_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select member_directory_visible from public.groups where id = _group), false)
$$;

create or replace function public.is_own_member(_uid uuid, _member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where id = _member and user_id = _uid)
$$;

create or replace function public._confirmed_user_id(_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users
  where lower(email) = lower(btrim(_email)) and email_confirmed_at is not null
  limit 1
$$;

-- ===================== Políticas RLS =====================
create policy "groups_select" on public.groups for select to authenticated using (
  public.is_platform_owner(auth.uid())
  or public.is_active_member(auth.uid(), id)
  or public.has_pending_invite(auth.uid(), id)
);

create policy "group_members_select" on public.group_members for select to authenticated using (
  user_id = auth.uid()
  or public.is_group_admin(auth.uid(), group_id)
  or (status = 'ativo' and public.is_active_member(auth.uid(), group_id) and public.group_directory_visible(group_id))
);

create policy "group_member_roles_select" on public.group_member_roles for select to authenticated using (
  public.is_own_member(auth.uid(), member_id)
  or public.is_group_admin(auth.uid(), group_id)
  or (public.is_active_member(auth.uid(), group_id) and public.group_directory_visible(group_id))
);

create policy "member_private_data_select" on public.member_private_data for select to authenticated using (
  public.is_own_member(auth.uid(), member_id)
  or public.can_manage_members(auth.uid(), group_id)
);

create policy "audit_log_select" on public.audit_log for select to authenticated using (
  group_id is not null and public.has_group_role(auth.uid(), group_id, 'diretor')
);

-- ===================== Ligação de contas e convites =====================
create or replace function public._link_user_invites(_uid uuid, _email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _email is null then return; end if;
  update public.group_members gm
     set user_id = _uid
    from public.member_private_data p
   where p.member_id = gm.id
     and gm.user_id is null
     and lower(p.email) = lower(_email)
     and not exists (select 1 from public.group_members x where x.group_id = gm.group_id and x.user_id = _uid);
  insert into public.platform_roles(user_id, role)
  select _uid, i.role from public.platform_role_invites i where lower(i.email) = lower(_email)
  on conflict (user_id, role) do nothing;
end; $$;

create or replace function public.handle_auth_user_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles(id, full_name, phone)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'phone')
    on conflict (id) do nothing;
  end if;
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null or old.email is distinct from new.email) then
    perform public._link_user_invites(new.id, new.email);
  end if;
  return new;
end; $$;

create trigger on_auth_user_sync
after insert or update of email_confirmed_at, email on auth.users
for each row execute function public.handle_auth_user_sync();

insert into public.profiles(id, full_name)
select id, coalesce(raw_user_meta_data->>'full_name', '') from auth.users
on conflict (id) do nothing;

-- ===================== Operações (RPC) =====================
create or replace function public._valid_email(_email text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(btrim(_email), '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

create or replace function public.create_group(
  _name text, _location text, _official_phone text, _official_email text,
  _director_name text, _director_email text, _director_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid; _mid uuid;
begin
  if _uid is null or not public.is_platform_owner(_uid) then
    raise exception 'Apenas a AGROEI pode criar grupos.' using errcode = '42501';
  end if;
  if not public._valid_email(_director_email) then
    raise exception 'Email do Diretor inválido.' using errcode = '22023';
  end if;
  insert into public.groups(name, location, official_phone, official_email, created_by)
  values (btrim(_name), nullif(btrim(_location), ''), nullif(btrim(_official_phone), ''),
          nullif(lower(btrim(_official_email)), ''), _uid)
  returning id into _gid;
  insert into public.group_members(group_id, user_id, full_name, phone, status, created_by)
  values (_gid, public._confirmed_user_id(_director_email), btrim(_director_name),
          nullif(btrim(_director_phone), ''), 'convidado', _uid)
  returning id into _mid;
  insert into public.member_private_data(member_id, group_id, email)
  values (_mid, _gid, lower(btrim(_director_email)));
  insert into public.group_member_roles(group_id, member_id, role, created_by)
  values (_gid, _mid, 'diretor', _uid);
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_gid, _uid, 'grupo_criado', 'group', _gid, jsonb_build_object('nome', btrim(_name)));
  return _gid;
end; $$;

create or replace function public.update_group_settings(
  _group_id uuid, _name text, _location text, _official_phone text, _official_email text,
  _member_directory_visible boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null or not public.has_group_role(_uid, _group_id, 'diretor') then
    raise exception 'Apenas o Diretor pode alterar as definições do grupo.' using errcode = '42501';
  end if;
  update public.groups
     set name = btrim(_name),
         location = nullif(btrim(_location), ''),
         official_phone = nullif(btrim(_official_phone), ''),
         official_email = nullif(lower(btrim(_official_email)), ''),
         member_directory_visible = coalesce(_member_directory_visible, false)
   where id = _group_id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'definicoes_alteradas', 'group', _group_id,
          jsonb_build_object('lista_membros_visivel', coalesce(_member_directory_visible, false)));
end; $$;

create or replace function public.add_group_member(
  _group_id uuid, _full_name text, _email text, _phone text, _profession text,
  _roles public.group_role[] default array['membro']::public.group_role[],
  _id_document_type text default null, _id_document_number text default null,
  _birth_date date default null, _address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _mid uuid; _linked uuid;
begin
  if _uid is null or not public.can_manage_members(_uid, _group_id) then
    raise exception 'Sem permissão para cadastrar membros neste grupo.' using errcode = '42501';
  end if;
  if _roles is null or cardinality(_roles) = 0 then
    raise exception 'Indique pelo menos um papel.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(_roles) r where r <> 'membro')
     and not public.has_group_role(_uid, _group_id, 'diretor') then
    raise exception 'Apenas o Diretor pode atribuir papéis administrativos.' using errcode = '42501';
  end if;
  if not public._valid_email(_email) then
    raise exception 'Email inválido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.member_private_data
             where group_id = _group_id and lower(email) = lower(btrim(_email))) then
    raise exception 'Já existe um membro com este email neste grupo.' using errcode = '23505';
  end if;
  _linked := public._confirmed_user_id(_email);
  if _linked is not null and exists (select 1 from public.group_members where group_id = _group_id and user_id = _linked) then
    raise exception 'Esta pessoa já pertence ao grupo.' using errcode = '23505';
  end if;
  insert into public.group_members(group_id, user_id, full_name, phone, profession, status, created_by)
  values (_group_id, _linked, btrim(_full_name), nullif(btrim(_phone), ''), nullif(btrim(_profession), ''),
          'convidado', _uid)
  returning id into _mid;
  insert into public.member_private_data(member_id, group_id, email, id_document_type, id_document_number, birth_date, address)
  values (_mid, _group_id, lower(btrim(_email)), nullif(btrim(_id_document_type), ''),
          nullif(btrim(_id_document_number), ''), _birth_date, nullif(btrim(_address), ''));
  insert into public.group_member_roles(group_id, member_id, role, created_by)
  select _group_id, _mid, r, _uid from (select distinct unnest(_roles) as r) s;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'membro_cadastrado', 'group_member', _mid,
          jsonb_build_object('papeis', to_jsonb(_roles)));
  return _mid;
end; $$;

create or replace function public.update_group_member(
  _member_id uuid, _full_name text, _phone text, _profession text,
  _id_document_type text, _id_document_number text, _birth_date date, _address text)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid;
begin
  select group_id into _gid from public.group_members where id = _member_id;
  if _gid is null or _uid is null or not public.can_manage_members(_uid, _gid) then
    raise exception 'Sem permissão para editar este membro.' using errcode = '42501';
  end if;
  update public.group_members
     set full_name = btrim(_full_name), phone = nullif(btrim(_phone), ''), profession = nullif(btrim(_profession), '')
   where id = _member_id;
  update public.member_private_data
     set id_document_type = nullif(btrim(_id_document_type), ''),
         id_document_number = nullif(btrim(_id_document_number), ''),
         birth_date = _birth_date,
         address = nullif(btrim(_address), '')
   where member_id = _member_id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_gid, _uid, 'membro_editado', 'group_member', _member_id);
end; $$;

create or replace function public.set_member_status(_member_id uuid, _status public.member_status)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.group_members%rowtype; _target_is_admin boolean; _directors int;
begin
  select * into _m from public.group_members where id = _member_id;
  if _m.id is null or _uid is null or not public.can_manage_members(_uid, _m.group_id) then
    raise exception 'Sem permissão para alterar o estado deste membro.' using errcode = '42501';
  end if;
  if _m.user_id = _uid then
    raise exception 'Não pode alterar o seu próprio estado.' using errcode = '42501';
  end if;
  if _status = 'convidado' then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  if _m.status = 'excluido' then
    raise exception 'Um membro excluído não pode ser reativado.' using errcode = '22023';
  end if;
  if _status = 'ativo' and _m.status <> 'suspenso' then
    raise exception 'Só é possível reativar membros suspensos. Convites são aceites pelo próprio membro.' using errcode = '22023';
  end if;
  select exists (select 1 from public.group_member_roles where member_id = _member_id and role <> 'membro')
    into _target_is_admin;
  if _target_is_admin and not public.has_group_role(_uid, _m.group_id, 'diretor') then
    raise exception 'Apenas o Diretor pode alterar o estado de um administrador.' using errcode = '42501';
  end if;
  if _status in ('suspenso','excluido') and exists (select 1 from public.group_member_roles where member_id = _member_id and role = 'diretor') then
    select count(*) into _directors from public.group_member_roles r join public.group_members gm on gm.id = r.member_id
     where r.group_id = _m.group_id and r.role = 'diretor' and gm.status = 'ativo' and gm.id <> _member_id;
    if _directors = 0 then
      raise exception 'O grupo deve manter pelo menos um Diretor ativo.' using errcode = '22023';
    end if;
  end if;
  update public.group_members set status = _status where id = _member_id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_m.group_id, _uid, 'estado_alterado', 'group_member', _member_id,
          jsonb_build_object('anterior', _m.status, 'novo', _status));
end; $$;

create or replace function public.set_member_roles(_member_id uuid, _roles public.group_role[])
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid; _before jsonb; _directors int;
begin
  select group_id into _gid from public.group_members where id = _member_id;
  if _gid is null or _uid is null or not public.has_group_role(_uid, _gid, 'diretor') then
    raise exception 'Apenas o Diretor pode atribuir papéis.' using errcode = '42501';
  end if;
  if _roles is null or cardinality(_roles) = 0 then
    raise exception 'Indique pelo menos um papel.' using errcode = '22023';
  end if;
  if not ('diretor' = any(_roles)) then
    select count(*) into _directors from public.group_member_roles r join public.group_members gm on gm.id = r.member_id
     where r.group_id = _gid and r.role = 'diretor' and gm.status = 'ativo' and gm.id <> _member_id;
    if _directors = 0 then
      raise exception 'O grupo deve manter pelo menos um Diretor ativo.' using errcode = '22023';
    end if;
  end if;
  select coalesce(jsonb_agg(role order by role), '[]'::jsonb) into _before from public.group_member_roles where member_id = _member_id;
  delete from public.group_member_roles where member_id = _member_id and not (role = any(_roles));
  insert into public.group_member_roles(group_id, member_id, role, created_by)
  select _gid, _member_id, r, _uid from (select distinct unnest(_roles) as r) s
  on conflict (member_id, role) do nothing;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_gid, _uid, 'papeis_alterados', 'group_member', _member_id,
          jsonb_build_object('anteriores', _before, 'novos', to_jsonb(_roles)));
end; $$;

create or replace function public.accept_invitation(_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _gid uuid;
begin
  update public.group_members set status = 'ativo', joined_at = now()
   where id = _member_id and user_id = _uid and status = 'convidado'
  returning group_id into _gid;
  if _gid is null then
    raise exception 'Convite não encontrado.' using errcode = '22023';
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id)
  values (_gid, _uid, 'convite_aceite', 'group_member', _member_id);
end; $$;

-- ===================== Permissões de execução =====================
revoke execute on function public._confirmed_user_id(text) from public, anon, authenticated;
revoke execute on function public._link_user_invites(uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_auth_user_sync() from public, anon, authenticated;

revoke execute on function public.is_platform_owner(uuid) from public, anon;
revoke execute on function public.is_active_member(uuid, uuid) from public, anon;
revoke execute on function public.has_pending_invite(uuid, uuid) from public, anon;
revoke execute on function public.has_group_role(uuid, uuid, public.group_role) from public, anon;
revoke execute on function public.is_group_admin(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_members(uuid, uuid) from public, anon;
revoke execute on function public.group_directory_visible(uuid) from public, anon;
revoke execute on function public.is_own_member(uuid, uuid) from public, anon;
grant execute on function public.is_platform_owner(uuid) to authenticated;
grant execute on function public.is_active_member(uuid, uuid) to authenticated;
grant execute on function public.has_pending_invite(uuid, uuid) to authenticated;
grant execute on function public.has_group_role(uuid, uuid, public.group_role) to authenticated;
grant execute on function public.is_group_admin(uuid, uuid) to authenticated;
grant execute on function public.can_manage_members(uuid, uuid) to authenticated;
grant execute on function public.group_directory_visible(uuid) to authenticated;
grant execute on function public.is_own_member(uuid, uuid) to authenticated;

revoke execute on function public.create_group(text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.update_group_settings(uuid, text, text, text, text, boolean) from public, anon;
revoke execute on function public.add_group_member(uuid, text, text, text, text, public.group_role[], text, text, date, text) from public, anon;
revoke execute on function public.update_group_member(uuid, text, text, text, text, text, date, text) from public, anon;
revoke execute on function public.set_member_status(uuid, public.member_status) from public, anon;
revoke execute on function public.set_member_roles(uuid, public.group_role[]) from public, anon;
revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.create_group(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_group_settings(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.add_group_member(uuid, text, text, text, text, public.group_role[], text, text, date, text) to authenticated;
grant execute on function public.update_group_member(uuid, text, text, text, text, text, date, text) to authenticated;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;
grant execute on function public.set_member_roles(uuid, public.group_role[]) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;