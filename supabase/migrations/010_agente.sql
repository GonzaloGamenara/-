-- Gastos · migración 010: acceso de solo lectura para tu agente de IA (GET /api/agente)
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

create extension if not exists pgcrypto with schema extensions;

-- Tokens personales: se guarda solo el hash (SHA-256); el token se ve una única vez al crearlo
create table if not exists public.agent_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null default 'Mi agente',
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.agent_tokens enable row level security;
drop policy if exists "own rows" on public.agent_tokens;
create policy "own rows" on public.agent_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lectura con token: valida el token y devuelve SOLO las filas de su dueño, de una lista
-- cerrada de tablas. No permite escribir nada.
create or replace function public.agent_read(p_token text, p_table text, p_from date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_uid uuid;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'token inválido' using errcode = '28000';
  end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  select user_id into v_uid from public.agent_tokens where token_hash = v_hash and revoked_at is null;
  if v_uid is null then
    raise exception 'token inválido' using errcode = '28000';
  end if;
  update public.agent_tokens set last_used_at = now()
    where token_hash = v_hash and (last_used_at is null or last_used_at < now() - interval '1 minute');

  if p_table = 'perfil' then
    select jsonb_build_object('alias', u.raw_user_meta_data->>'alias', 'nombre', u.raw_user_meta_data->>'name')
      into v_result from auth.users u where u.id = v_uid;
    return v_result;
  end if;

  if p_table not in ('transactions', 'categories', 'recurring', 'cards', 'purchases', 'splits',
                     'shared_groups', 'shared_members', 'shared_expenses', 'shared_payments',
                     'budgets', 'budget_categories', 'budget_snapshots', 'assets', 'asset_snapshots') then
    raise exception 'tabla no permitida: %', p_table;
  end if;

  if p_table = 'transactions' and p_from is not null then
    select coalesce(jsonb_agg(to_jsonb(t) - 'user_id'), '[]'::jsonb) into v_result
      from public.transactions t where t.user_id = v_uid and t.occurred_on >= p_from;
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''user_id''), ''[]''::jsonb) from public.%I t where t.user_id = $1', p_table)
      into v_result using v_uid;
  end if;
  return v_result;
end;
$$;

revoke all on function public.agent_read(text, text, date) from public;
grant execute on function public.agent_read(text, text, date) to anon, authenticated;
