-- Gastos · migración 003: cuentas compartidas (quién pagó qué y quién le debe a quién)
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

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
