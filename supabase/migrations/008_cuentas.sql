-- Gastos · migración 008: cada movimiento sale de una cuenta y los saldos se estiman solos
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

-- De qué cuenta salió (o a cuál entró) cada movimiento. Si está vacío, cuenta la principal.
alter table public.transactions add column if not exists account_id uuid references public.assets(id) on delete set null;
-- Los fijos y las tarjetas también tienen su cuenta (de dónde se paga / se debita el resumen)
alter table public.recurring add column if not exists account_id uuid references public.assets(id) on delete set null;
alter table public.cards add column if not exists account_id uuid references public.assets(id) on delete set null;

-- Cuándo confirmaste el saldo de la cuenta: desde ahí la app suma y resta tus movimientos
alter table public.assets add column if not exists balance_at timestamptz;
-- La cuenta principal (de donde salen los movimientos por defecto)
alter table public.assets add column if not exists is_default boolean not null default false;
-- Fondos u otros que podés usar en el día (ej: un fondo money market o LECAP con rescate inmediato)
alter table public.assets add column if not exists liquid boolean not null default false;

-- Los saldos que ya tenías cuentan como confirmados en su última actualización
update public.assets set balance_at = updated_at where kind = 'cuenta' and balance_at is null;

create index if not exists transactions_account_idx on public.transactions (user_id, account_id, occurred_on);
