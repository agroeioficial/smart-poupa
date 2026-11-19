alter table public.member_status_requests
  add column kind text not null default 'estado' check (kind in ('estado','papeis')),
  add column requested_roles public.group_role[],
  add column from_roles public.group_role[];
alter table public.member_status_requests alter column requested_status drop not null;
alter table public.member_status_requests alter column from_status drop not null;
alter table public.member_status_requests add constraint member_status_requests_kind_fields check (
  (kind = 'estado' and requested_status is not null and from_status is not null)
  or (kind = 'papeis' and requested_roles is not null and cardinality(requested_roles) > 0)
);

create or replace function public._validate_roles_change(_m public.group_members, _roles public.group_role[])
returns void language plpgsql stable security definer set search_path = public as $$
declare _current public.group_role[]; _directors int;
begin
  if _roles is null or cardinality(_roles) = 0 then
    raise exception 'Indique pelo menos um cargo.' using errcode = '22023';
  end if;
  if _m.status not in ('ativo','convidado') then
    raise exception 'Só é possível alterar cargos de membros ativos ou convidados.' using errcode = '22023';
  end if;
  select coalesce(array_agg(role order by role), '{}') into _current from public.group_member_roles where member_id = _m.id;
  if _current = (select array_agg(r order by r) from (select distinct unnest(_roles) r) s) then
    raise exception 'O membro já tem esses cargos.' using errcode = '22023';
  end if;
  if 'diretor' = any(_current) and not ('diretor' = any(_roles)) then
    select count(*) into _directors from public.group_member_roles r join public.group_members gm on gm.id = r.member_id
     where r.group_id = _m.group_id and r.role = 'diretor' and gm.status = 'ativo' and gm.id <> _m.id;
    if _directors = 0 then
      raise exception 'O grupo deve manter pelo menos um Diretor ativo. Promova outro Diretor primeiro.' using errcode = '22023';
    end if;
  end if;
end; $$;

create or replace function public._apply_status_request(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _r public.member_status_requests%rowtype; _m public.group_members%rowtype;
        _admin_roles public.group_role[]; _before public.group_role[];
begin
  select * into _r from public.member_status_requests where id = _request_id for update;
  select * into _m from public.group_members where id = _r.member_id for update;
  if _r.kind = 'papeis' then
    perform public._validate_roles_change(_m, _r.requested_roles);
    select coalesce(array_agg(role), '{}') into _before from public.group_member_roles where member_id = _m.id;
    delete from public.group_member_roles where member_id = _m.id and not (role = any(_r.requested_roles));
    insert into public.group_member_roles(group_id, member_id, role, created_by)
    select _m.group_id, _m.id, r, _r.requested_by from (select distinct unnest(_r.requested_roles) as r) s
    on conflict (member_id, role) do nothing;
    perform public._log_admin_roles(_m.id,
      array(select r from unnest(_r.requested_roles) r where not (r = any(_before))), 'atribuido', null, 'Aprovação da direção');
    perform public._log_admin_roles(_m.id,
      array(select r from unnest(_before) r where not (r = any(_r.requested_roles))), 'removido', null, 'Aprovação da direção');
    update public.member_status_requests set status = 'aprovado', resolved_at = now() where id = _r.id;
    insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
    values (_m.group_id, null, 'papeis_alterados', 'group_member', _m.id,
            jsonb_build_object('anteriores', to_jsonb(_before), 'novos', to_jsonb(_r.requested_roles), 'pedido', _r.id));
    return;
  end if;

  perform public._validate_status_change(_m, _r.requested_status);
  update public.group_members set status = _r.requested_status where id = _m.id;
  update public.member_status_requests set status = 'aprovado', resolved_at = now() where id = _r.id;
  select coalesce(array_agg(role), '{}') into _admin_roles from public.group_member_roles
   where member_id = _m.id and role in ('diretor','tesoureiro','secretario');
  if cardinality(_admin_roles) > 0 then
    perform public._log_admin_roles(_m.id, _admin_roles,
      case _r.requested_status when 'suspenso' then 'suspenso' when 'excluido' then 'excluido' else 'reativado' end,
      null, 'Aprovação da direção');
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_m.group_id, null, 'estado_alterado', 'group_member', _m.id,
          jsonb_build_object('anterior', _m.status, 'novo', _r.requested_status, 'pedido', _r.id));
end; $$;

create or replace function public._open_board_request(
  _m public.group_members, _uid uuid, _kind text, _status public.member_status,
  _roles public.group_role[], _reason text)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare _me uuid; _rid uuid; _state public.request_status; _cur public.group_role[];
begin
  _me := public._active_member_id(_uid, _m.group_id);
  if _me is null then
    raise exception 'Apenas a direção do grupo pode fazer pedidos.' using errcode = '42501';
  end if;
  if exists (select 1 from public.member_status_requests where member_id = _m.id and status = 'pendente') then
    raise exception 'Já existe um pedido pendente para este membro.' using errcode = '23505';
  end if;
  select coalesce(array_agg(role), '{}') into _cur from public.group_member_roles where member_id = _m.id;
  insert into public.member_status_requests(group_id, member_id, kind, from_status, requested_status,
                                            from_roles, requested_roles, reason, requested_by, requested_by_member)
  values (_m.group_id, _m.id, _kind,
          case when _kind = 'estado' then _m.status end, _status,
          _cur, case when _kind = 'papeis' then (select array_agg(distinct r) from unnest(_roles) r) end,
          btrim(_reason), _uid, _me)
  returning id into _rid;
  insert into public.member_status_request_votes(request_id, group_id, voter_member_id, voter_user_id, vote)
  values (_rid, _m.group_id, _me, _uid, 'aprovado');
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_m.group_id, _uid, 'pedido_criado', 'member_status_request', _rid,
          jsonb_build_object('membro', _m.id, 'tipo', _kind));
  _state := public._status_request_state(_rid);
  if _state = 'aprovado' then
    perform public._apply_status_request(_rid);
  end if;
  return _state;
end; $$;

create or replace function public.request_member_status_change(_member_id uuid, _status public.member_status, _reason text)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.group_members%rowtype;
begin
  select * into _m from public.group_members where id = _member_id;
  if _m.id is null or _uid is null or not public.is_group_admin(_uid, _m.group_id) then
    raise exception 'Apenas a direção do grupo pode pedir alterações de estado.' using errcode = '42501';
  end if;
  if _m.user_id = _uid then
    raise exception 'Não pode pedir a alteração do seu próprio estado.' using errcode = '42501';
  end if;
  perform public._req(_reason, 'O motivo');
  perform public._validate_status_change(_m, _status);
  return public._open_board_request(_m, _uid, 'estado', _status, null, _reason);
end; $$;

create or replace function public.request_member_roles_change(_member_id uuid, _roles public.group_role[], _reason text)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _m public.group_members%rowtype;
begin
  select * into _m from public.group_members where id = _member_id;
  if _m.id is null or _uid is null or not public.is_group_admin(_uid, _m.group_id) then
    raise exception 'Apenas a direção do grupo pode propor cargos.' using errcode = '42501';
  end if;
  if _m.user_id = _uid then
    raise exception 'Não pode propor alterações aos seus próprios cargos.' using errcode = '42501';
  end if;
  perform public._req(_reason, 'O motivo');
  perform public._validate_roles_change(_m, _roles);
  return public._open_board_request(_m, _uid, 'papeis', null, _roles, _reason);
end; $$;

-- Cadastro: cargos administrativos ficam pendentes de aprovação
create or replace function public.add_group_member(
  _group_id uuid, _full_name text, _email text, _phone text, _profession text,
  _roles public.group_role[] default array['membro']::public.group_role[],
  _id_document_type text default null, _id_document_number text default null,
  _birth_date date default null, _address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _mid uuid; _linked uuid; _m public.group_members%rowtype;
        _has_admin boolean;
begin
  if _uid is null or not public.can_manage_members(_uid, _group_id) then
    raise exception 'Sem permissão para cadastrar membros neste grupo.' using errcode = '42501';
  end if;
  if _roles is null or cardinality(_roles) = 0 then
    raise exception 'Indique pelo menos um papel.' using errcode = '22023';
  end if;
  if not public._valid_email(_email) then
    raise exception 'O email é obrigatório e deve ser válido.' using errcode = '22023';
  end if;
  perform public._check_member_fields(_full_name, _phone, _profession, _id_document_type,
                                      _id_document_number, _birth_date, _address);
  if exists (select 1 from public.member_private_data
             where group_id = _group_id and lower(email) = lower(btrim(_email))) then
    raise exception 'Já existe um membro com este email neste grupo.' using errcode = '23505';
  end if;
  _linked := public._confirmed_user_id(_email);
  if _linked is not null and exists (select 1 from public.group_members where group_id = _group_id and user_id = _linked) then
    raise exception 'Esta pessoa já pertence ao grupo.' using errcode = '23505';
  end if;
  insert into public.group_members(group_id, user_id, full_name, phone, profession, status, created_by)
  values (_group_id, _linked, btrim(_full_name), btrim(_phone), btrim(_profession), 'convidado', _uid)
  returning id into _mid;
  insert into public.member_private_data(member_id, group_id, email, id_document_type, id_document_number, birth_date, address)
  values (_mid, _group_id, lower(btrim(_email)), btrim(_id_document_type), btrim(_id_document_number),
          _birth_date, btrim(_address));
  if 'membro' = any(_roles) then
    insert into public.group_member_roles(group_id, member_id, role, created_by) values (_group_id, _mid, 'membro', _uid);
  end if;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'membro_cadastrado', 'group_member', _mid, jsonb_build_object('papeis', to_jsonb(_roles)));
  _has_admin := exists (select 1 from unnest(_roles) r where r <> 'membro');
  if _has_admin then
    select * into _m from public.group_members where id = _mid;
    perform public._open_board_request(_m, _uid, 'papeis', null, _roles, 'Cargo indicado no cadastro');
  end if;
  return _mid;
end; $$;

drop function if exists public.set_member_roles(uuid, public.group_role[]);

revoke execute on function public._validate_roles_change(public.group_members, public.group_role[]) from public, anon, authenticated;
revoke execute on function public._open_board_request(public.group_members, uuid, text, public.member_status, public.group_role[], text) from public, anon, authenticated;
revoke execute on function public.request_member_roles_change(uuid, public.group_role[], text) from public, anon;
grant execute on function public.request_member_roles_change(uuid, public.group_role[], text) to authenticated;