-- Gastos · migración 006: techos (presupuesto) por categoría o grupo de categorías
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

-- Un techo: mensual obligatorio; semanal, máximo por movimiento y días permitidos opcionales
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  monthly numeric not null check (monthly > 0),
  weekly numeric check (weekly > 0),
  max_per_tx numeric check (max_per_tx > 0),
  -- Días permitidos (1 = lunes … 7 = domingo); null = todos
  allowed_days smallint[],
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Categorías de cada techo. Una categoría puede estar en un solo techo (así nunca se cuenta dos veces)
create table if not exists public.budget_categories (
  category_id uuid primary key references public.categories on delete cascade,
  budget_id uuid not null references public.budgets on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade
);
create index if not exists budget_categories_budget_idx on public.budget_categories (budget_id);

-- Foto mensual de los techos: cada mes cerrado queda con el techo que tenía
create table if not exists public.budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  period text not null,
  config jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

alter table public.budgets enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['budgets', 'budget_categories', 'budget_snapshots'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
