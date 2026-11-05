-- Gastos · migración 011: día de cierre de cada tarjeta
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).
-- Con el día de cierre, una compra posterior al cierre va sola al resumen siguiente.

alter table public.cards add column if not exists closing_day int check (closing_day between 1 and 31);
