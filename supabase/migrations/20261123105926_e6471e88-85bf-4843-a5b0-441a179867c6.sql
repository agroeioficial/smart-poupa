-- ===================== Definições de empréstimo por grupo =====================
create table public.group_loan_settings (
  group_id uuid primary key references public.groups(id) on delete restrict,
  vote_deadline_days int check (vote_deadline_days is null or vote_deadline_days between 1 and 90),
  guarantee_required boolean not null default false,
  interest_method text check (interest_method is null or interest_method in ('fixa_unica','simples_mensal','sobre_saldo')),
  interest_rate numeric(6,2) check (interest_rate is null or (interest_rate >= 0 and interest_rate <= 100)),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_loan_settings_interest_pair check ((interest_method is null) = (interest_rate is null))
);
grant select on public.group_loan_settings to authenticated;
grant all on public.group_loan_settings to service_role;
alter table public.group_loan_settings enable row level security;
create policy "group_loan_settings_select" on public.group_loan_settings for select to authenticated using (
  public.is_active_member(auth.uid(), group_id)
);
create trigger group_loan_settings_updated_at before update on public.group_loan_settings
for each row execute function public.set_updated_at();

create or replace function public.set_group_loan_settings(
  _group_id uuid, _vote_deadline_days int, _guarantee_required boolean, _interest_method text, _interest_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _method text := nullif(btrim(coalesce(_interest_method, '')), '');
begin
  if _uid is null or not public.has_group_role(_uid, _group_id, 'diretor') then
    raise exception 'Só o Diretor altera as regras de empréstimo.' using errcode = '42501';
  end if;
  if _vote_deadline_days is not null and (_vote_deadline_days < 1 or _vote_deadline_days > 90) then
    raise exception 'O prazo de votação deve ter entre 1 e 90 dias.' using errcode = '22023';
  end if;
  if _method is not null and _method not in ('fixa_unica','simples_mensal','sobre_saldo') then
    raise exception 'Método de juros inválido.' using errcode = '22023';
  end if;
  if (_method is null) <> (_interest_rate is null) then
    raise exception 'Indique o método de juros e a taxa em conjunto.' using errcode = '22023';
  end if;
  if _interest_rate is not null and (_interest_rate < 0 or _interest_rate > 100 or _interest_rate <> round(_interest_rate, 2)) then
    raise exception 'A taxa de juros deve estar entre 0 e 100%% (até 2 casas decimais).' using errcode = '22023';
  end if;
  insert into public.group_loan_settings(group_id, vote_deadline_days, guarantee_required, interest_method, interest_rate, updated_by)
  values (_group_id, _vote_deadline_days, coalesce(_guarantee_required, false), _method, _interest_rate, _uid)
  on conflict (group_id) do update
     set vote_deadline_days = excluded.vote_deadline_days, guarantee_required = excluded.guarantee_required,
         interest_method = excluded.interest_method, interest_rate = excluded.interest_rate, updated_by = excluded.updated_by;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'regras_emprestimo_alteradas', 'group', _group_id,
          jsonb_build_object('prazo_votacao_dias', _vote_deadline_days, 'garantia_obrigatoria', coalesce(_guarantee_required, false),
                             'metodo_juros', _method, 'taxa_juros', _interest_rate));
end; $$;

-- ===================== Juros em vigor no momento do pedido =====================
alter table public.loans add column interest_method text
  check (interest_method is null or interest_method in ('fixa_unica','simples_mensal','sobre_saldo'));
alter table public.loans add column interest_rate numeric(6,2);

create or replace function public._guard_loan()
returns trigger language plpgsql set search_path = public as $$
begin
  if public._purge_allowed() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    raise exception 'Pedidos de empréstimo não podem ser apagados.' using errcode = '42501';
  end if;
  if new.group_id <> old.group_id or new.member_id <> old.member_id or new.requested_by <> old.requested_by
     or new.amount <> old.amount or new.term_months <> old.term_months or new.purpose <> old.purpose
     or new.guarantee_description is distinct from old.guarantee_description
     or new.guarantee_path is distinct from old.guarantee_path or new.declaration_path <> old.declaration_path
     or new.interest_method is distinct from old.interest_method or new.interest_rate is distinct from old.interest_rate
     or new.created_at <> old.created_at then
    raise exception 'Os dados do pedido de empréstimo não podem ser alterados.' using errcode = '42501';
  end if;
  if old.status in ('rejeitado','cancelado') then
    raise exception 'Este pedido de empréstimo já foi encerrado.' using errcode = '42501';
  end if;
  return new;
end; $$;

-- ===================== Regra de aprovação (igual à da suspensão) =====================
-- Direção ativa sem o requerente: 1 → basta 1; 2 → os 2; 3 ou mais → 3 aprovações que cubram
-- cada cargo principal ocupado (Diretor, Tesoureiro, Secretário). Uma rejeição rejeita.
create or replace function public._loan_vote_state(_loan_id uuid)
returns public.loan_status language plpgsql stable security definer set search_path = public as $$
declare _l public.loans%rowtype; _eligible uuid[]; _n int; _need int; _approvals int; _role public.group_role;
begin
  select * into _l from public.loans where id = _loan_id;
  if _l.status not in ('submetido','em_analise') then return _l.status; end if;
  if exists (select 1 from public.loan_votes where loan_id = _l.id and vote = 'rejeitado') then
    return 'rejeitado';
  end if;
  _eligible := public._loan_voters(_l.group_id, _l.member_id);
  _n := cardinality(_eligible);
  if _n > 0 then
    select count(*) into _approvals from public.loan_votes
     where loan_id = _l.id and vote = 'aprovado' and voter_member_id = any(_eligible);
    _need := least(_n, 3);
    if _approvals >= _need then
      if _n >= 3 then
        foreach _role in array array['diretor','tesoureiro','secretario']::public.group_role[] loop
          if exists (select 1 from public.group_member_roles gr where gr.member_id = any(_eligible) and gr.role = _role)
             and not exists (
               select 1 from public.loan_votes v
               join public.group_member_roles gr on gr.member_id = v.voter_member_id and gr.role = _role
               where v.loan_id = _l.id and v.vote = 'aprovado' and v.voter_member_id = any(_eligible)) then
            return 'em_analise';
          end if;
        end loop;
      end if;
      return 'aprovado';
    end if;
  end if;
  if exists (select 1 from public.loan_votes where loan_id = _l.id) then return 'em_analise'; end if;
  return 'submetido';
end; $$;

-- ===================== Pedido: garantia segundo o grupo; juros em vigor =====================
create or replace function public.submit_loan_request(
  _group_id uuid, _amount numeric, _term_months int, _purpose text, _declaration_path text,
  _guarantee_description text default null, _guarantee_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _me public.group_members%rowtype; _id uuid; _p text; _gpath text;
        _gdesc text := nullif(btrim(coalesce(_guarantee_description, '')), ''); _s public.group_loan_settings%rowtype;
begin
  select * into _me from public.group_members where user_id = _uid and group_id = _group_id and status = 'ativo';
  if _uid is null or _me.id is null then
    raise exception 'Só membros ativos do grupo podem pedir empréstimos.' using errcode = '42501';
  end if;
  select * into _s from public.group_loan_settings where group_id = _group_id;
  if _amount is null or _amount <= 0 or _amount > 100000000 or _amount <> round(_amount, 2) then
    raise exception 'Indique um valor válido em MZN (até 2 casas decimais).' using errcode = '22023';
  end if;
  if _term_months is null or _term_months < 1 or _term_months > 120 then
    raise exception 'Indique o prazo em meses (de 1 a 120).' using errcode = '22023';
  end if;
  perform public._req(_purpose, 'A finalidade');
  if char_length(btrim(_purpose)) < 5 or char_length(btrim(_purpose)) > 1000 then
    raise exception 'Descreva a finalidade (entre 5 e 1000 caracteres).' using errcode = '22023';
  end if;
  if char_length(coalesce(_gdesc, '')) > 1000 then
    raise exception 'A descrição da garantia não pode ter mais de 1000 caracteres.' using errcode = '22023';
  end if;
  perform public._req(_declaration_path, 'A declaração de dívida e compromisso');
  _gpath := nullif(btrim(coalesce(_guarantee_path, '')), '');
  if coalesce(_s.guarantee_required, false) and (_gdesc is null or _gpath is null) then
    raise exception 'Este grupo exige garantia: descreva-a e anexe o documento ou fotografia.' using errcode = '22023';
  end if;
  if _gpath = _declaration_path then
    raise exception 'A garantia e a declaração devem ser ficheiros diferentes.' using errcode = '22023';
  end if;
  foreach _p in array array_remove(array[_declaration_path, _gpath], null) loop
    if split_part(_p, '/', 1) <> _group_id::text or split_part(_p, '/', 2) <> _uid::text
       or not exists (select 1 from storage.objects where bucket_id = 'comprovativos' and name = _p) then
      raise exception 'Documento não encontrado. Volte a anexar o ficheiro.' using errcode = '22023';
    end if;
    if exists (select 1 from public.deposits where receipt_path = _p)
       or exists (select 1 from public.loans where declaration_path = _p or guarantee_path = _p) then
      raise exception 'Este ficheiro já foi usado noutro registo.' using errcode = '23505';
    end if;
  end loop;
  if cardinality(public._loan_voters(_group_id, _me.id)) = 0 then
    raise exception 'O grupo precisa de pelo menos outro administrador ativo para decidir o pedido.' using errcode = '22023';
  end if;
  insert into public.loans(group_id, member_id, requested_by, amount, term_months, purpose,
                           guarantee_description, guarantee_path, declaration_path, interest_method, interest_rate)
  values (_group_id, _me.id, _uid, _amount, _term_months, btrim(_purpose), _gdesc, _gpath, _declaration_path,
          _s.interest_method, _s.interest_rate)
  returning id into _id;
  insert into public.audit_log(group_id, actor_id, action, entity, entity_id, details)
  values (_group_id, _uid, 'emprestimo_pedido', 'loan', _id,
          jsonb_build_object('valor', _amount, 'prazo_meses', _term_months, 'estado_novo', 'submetido',
                             'declaracao', _declaration_path, 'garantia', _gpath,
                             'metodo_juros', _s.interest_method, 'taxa_juros', _s.interest_rate));
  return _id;
end; $$;

-- ===================== Permissões de execução =====================
revoke execute on function public._guard_loan() from public, anon, authenticated;
revoke execute on function public._loan_vote_state(uuid) from public, anon, authenticated;
revoke execute on function public.set_group_loan_settings(uuid, int, boolean, text, numeric) from public, anon;
grant execute on function public.set_group_loan_settings(uuid, int, boolean, text, numeric) to authenticated;
revoke execute on function public.submit_loan_request(uuid, numeric, int, text, text, text, text) from public, anon;
grant execute on function public.submit_loan_request(uuid, numeric, int, text, text, text, text) to authenticated;