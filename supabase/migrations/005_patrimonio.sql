-- Gastos · migración 005: patrimonio (cuentas e inversiones) y su evolución mensual
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

-- Lo que tenés: cuentas (saldo), CEDEARs/acciones (nominales × precio), fondos y otros (valor)
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null check (kind in ('cuenta', 'cedear', 'fondo', 'otro')),
  -- CEDEARs/acciones: ticker y nominales; el precio se actualiza solo
  ticker text,
  quantity numeric,
  -- Cuentas, fondos y otros: valor cargado a mano (en su moneda)
  balance numeric,
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  -- Último precio conocido por nominal (si la cotización automática falla, se usa este)
  last_price numeric,
  price_at timestamptz,
  -- Fondos: rendimiento anual estimado (TNA %) para estimar el valor entre actualizaciones
  rate numeric,
  -- Dónde está (Balanz, Galicia…), solo para mostrar
  broker text,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Foto del total de cada mes (se guarda sola; alimenta el gráfico de evolución)
create table if not exists public.asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  period text not null,
  total numeric not null,
  cash numeric not null default 0,
  invested numeric not null default 0,
  mep numeric,
  detail jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, period)
);

alter table public.assets enable row level security;
alter table public.asset_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['assets', 'asset_snapshots'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
