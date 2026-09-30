-- Gastos · migración 004: link público (solo lectura) para compartir una cuenta dividida
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

-- Código secreto del link (si es null, la cuenta no está compartida)
alter table public.shared_groups add column if not exists share_token uuid unique;

-- Devuelve SOLO la cuenta de ese link (nombre, personas, gastos, pagos y el alias de quien la armó).
-- security definer: la consulta corre con permisos del dueño, pero únicamente filtra por el token.
create or replace function public.shared_group_public(p_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'name', g.name,
    'occurred_on', g.occurred_on,
    'owner_name', (select u.raw_user_meta_data->>'name' from auth.users u where u.id = g.user_id),
    'alias', (select u.raw_user_meta_data->>'alias' from auth.users u where u.id = g.user_id),
    'members', (
      select coalesce(json_agg(json_build_object('id', m.id, 'name', m.name, 'is_me', m.is_me) order by m.created_at), '[]'::json)
      from public.shared_members m where m.group_id = g.id
    ),
    'expenses', (
      select coalesce(json_agg(json_build_object('id', e.id, 'payer_id', e.payer_id, 'amount', e.amount,
        'description', e.description, 'among', e.among) order by e.created_at), '[]'::json)
      from public.shared_expenses e where e.group_id = g.id
    ),
    'payments', (
      select coalesce(json_agg(json_build_object('id', p.id, 'from_id', p.from_id, 'to_id', p.to_id,
        'amount', p.amount, 'paid_on', p.paid_on) order by p.created_at), '[]'::json)
      from public.shared_payments p where p.group_id = g.id
    )
  )
  from public.shared_groups g
  where p_token is not null and g.share_token = p_token;
$$;

revoke all on function public.shared_group_public(uuid) from public;
grant execute on function public.shared_group_public(uuid) to anon, authenticated;
