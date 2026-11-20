create or replace function public._status_request_state(_request_id uuid)
returns public.request_status language plpgsql stable security definer set search_path = public as $$
declare _r public.member_status_requests%rowtype; _eligible uuid[]; _n int; _need int; _approvals int; _role public.group_role;
begin
  select * into _r from public.member_status_requests where id = _request_id;
  if _r.status <> 'pendente' then return _r.status; end if;
  if exists (select 1 from public.member_status_request_votes where request_id = _r.id and vote = 'rejeitado') then
    return 'rejeitado';
  end if;
  select coalesce(array_agg(distinct gm.id), '{}') into _eligible
  from public.group_members gm
  join public.group_member_roles gr on gr.member_id = gm.id
  where gm.group_id = _r.group_id and gm.status = 'ativo' and gm.id <> _r.member_id
    and gr.role in ('diretor','tesoureiro','secretario');
  _n := cardinality(_eligible);
  if _n = 0 then return 'pendente'; end if;
  _need := least(_n, 3);
  select count(*) into _approvals from public.member_status_request_votes v
   where v.request_id = _r.id and v.vote = 'aprovado' and v.voter_member_id = any(_eligible);
  if _approvals < _need then return 'pendente'; end if;
  if _n >= 3 then
    foreach _role in array array['diretor','tesoureiro','secretario']::public.group_role[] loop
      if exists (select 1 from public.group_member_roles gr where gr.member_id = any(_eligible) and gr.role = _role)
         and not exists (
           select 1 from public.member_status_request_votes v
           join public.group_member_roles gr on gr.member_id = v.voter_member_id and gr.role = _role
           where v.request_id = _r.id and v.vote = 'aprovado' and v.voter_member_id = any(_eligible)) then
        return 'pendente';
      end if;
    end loop;
  end if;
  return 'aprovado';
end; $$;
revoke execute on function public._status_request_state(uuid) from public, anon, authenticated;