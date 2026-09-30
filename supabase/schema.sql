-- Gastos · esquema de base de datos
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  emoji      text not null default '🏷️',
  color      text not null default '#8b5cf6',
  kind       text not null check (kind in ('expense', 'income')),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- Movimientos fijos que se repiten cada mes (alquiler, sueldo, beca, suscripciones…)
create table if not exists public.recurring (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('expense', 'income')),
  name        text not null,
  amount      numeric(14,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  day         int  not null default 1 check (day between 1 and 31),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('expense', 'income')),
  amount       numeric(14,2) not null check (amount > 0),
  category_id  uuid references public.categories(id) on delete set null,
  note         text,
  occurred_on  date not null default current_date,
  recurring_id uuid references public.recurring(id) on delete set null,
  period       text,  -- 'YYYY-MM' cuando viene de un fijo (evita duplicarlo)
  created_at   timestamptz not null default now(),
  unique (recurring_id, period)
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index if not exists categories_user_idx on public.categories (user_id);
create index if not exists recurring_user_idx on public.recurring (user_id);

-- Seguridad: cada usuario ve y modifica únicamente lo suyo.
alter table public.categories   enable row level security;
alter table public.recurring    enable row level security;
alter table public.transactions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categories', 'recurring', 'transactions'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
