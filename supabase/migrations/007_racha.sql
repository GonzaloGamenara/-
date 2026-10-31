-- Gastos · migración 007: racha de carga (días seguidos cargando movimientos)
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

-- Un día cuenta si cargaste algo a mano ese día ('carga') o marcaste que no gastaste nada ('sin_gastos').
-- Los fijos automáticos y lo importado desde archivos no suman: la racha premia el hábito de cargar.
create table if not exists public.streak_days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  kind text not null default 'carga' check (kind in ('carga', 'sin_gastos')),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.streak_days enable row level security;
drop policy if exists "own rows" on public.streak_days;
create policy "own rows" on public.streak_days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Arranque: los días en que ya cargaste movimientos a mano (hora de Argentina), sin contar los fijos
insert into public.streak_days (user_id, day, kind)
select distinct t.user_id, (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'carga'
from public.transactions t
where t.recurring_id is null
on conflict (user_id, day) do nothing;
