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

-- ---------------------------------------------------------------
-- Tarjetas, cuotas y gastos divididos (igual a migrations/002)
-- Tarjetas: cada una con su día de pago fijo mensual
create table if not exists public.cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#7c5cff',
  due_day    int  not null default 10 check (due_day between 1 and 31),
  created_at timestamptz not null default now()
);

-- Compras hechas con tarjeta (1 pago o en cuotas). Cada cuota es un movimiento.
create table if not exists public.purchases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id          uuid references public.cards(id) on delete cascade,
  description      text not null,
  category_id      uuid references public.categories(id) on delete set null,
  total_amount     numeric(14,2) not null check (total_amount > 0),
  installments     int  not null default 1 check (installments between 1 and 72),
  first_period     text not null,            -- 'YYYY-MM' en que se paga la cuota 1
  from_installment int  not null default 1,  -- desde qué cuota se registra (planes ya empezados)
  purchased_on     date not null default current_date,
  created_at       timestamptz not null default now()
);

alter table public.transactions add column if not exists card_id     uuid references public.cards(id) on delete set null;
alter table public.transactions add column if not exists purchase_id uuid references public.purchases(id) on delete cascade;
alter table public.transactions add column if not exists installment int;
-- Si el gasto está dividido: lo que te toca a vos (las métricas usan esto)
alter table public.transactions add column if not exists my_share    numeric(14,2) check (my_share >= 0);

-- Suscripciones pagadas con tarjeta = fijos con card_id
alter table public.recurring add column if not exists card_id uuid references public.cards(id) on delete set null;

-- Partes de otras personas en un gasto dividido ("te deben")
create table if not exists public.splits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  purchase_id    uuid references public.purchases(id) on delete cascade,
  name           text not null,
  amount         numeric(14,2) not null check (amount >= 0),
  settled_on     date,
  created_at     timestamptz not null default now(),
  check (transaction_id is not null or purchase_id is not null)
);

create index if not exists transactions_card_idx on public.transactions (card_id, occurred_on);
create index if not exists transactions_purchase_idx on public.transactions (purchase_id);
create index if not exists purchases_card_idx on public.purchases (card_id);
create index if not exists splits_user_idx on public.splits (user_id, settled_on);

alter table public.cards     enable row level security;
alter table public.purchases enable row level security;
alter table public.splits    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cards', 'purchases', 'splits'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Cuentas compartidas (igual a migrations/003)
-- Una cuenta compartida: "Asado del sábado", "Viaje a Córdoba"…
create table if not exists public.shared_groups (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  category_id    uuid references public.categories(id) on delete set null,
  occurred_on    date not null default current_date,
  -- Tu parte de lo consumido se refleja como un movimiento tuyo (para las métricas)
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.shared_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id   uuid not null references public.shared_groups(id) on delete cascade,
  name       text not null,
  is_me      boolean not null default false,
  created_at timestamptz not null default now()
);

-- Cada gasto: quién lo pagó, cuánto, en qué y entre quiénes se reparte (null = todos)
create table if not exists public.shared_expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id    uuid not null references public.shared_groups(id) on delete cascade,
  payer_id    uuid not null references public.shared_members(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  description text,
  among       uuid[],
  created_at  timestamptz not null default now()
);

-- Pagos entre personas para saldar la cuenta
create table if not exists public.shared_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id   uuid not null references public.shared_groups(id) on delete cascade,
  from_id    uuid not null references public.shared_members(id) on delete cascade,
  to_id      uuid not null references public.shared_members(id) on delete cascade,
  amount     numeric(14,2) not null check (amount > 0),
  paid_on    date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists shared_members_group_idx  on public.shared_members (group_id);
create index if not exists shared_expenses_group_idx on public.shared_expenses (group_id);
create index if not exists shared_payments_group_idx on public.shared_payments (group_id);

alter table public.shared_groups   enable row level security;
alter table public.shared_members  enable row level security;
alter table public.shared_expenses enable row level security;
alter table public.shared_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['shared_groups', 'shared_members', 'shared_expenses', 'shared_payments'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
