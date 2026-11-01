-- Gastos · migración 009: fijos que se cobran el último día hábil del mes (ej: el sueldo)
-- Pegalo completo en Supabase → SQL Editor → Run. Es idempotente (podés correrlo de nuevo).

alter table public.recurring add column if not exists last_business_day boolean not null default false;
