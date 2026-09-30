# Roadmap

## 1. Tarjetas y cuotas (próximo)

**Objetivo:** que el resumen de la tarjeta no sea un solo gasto "Tarjeta", sino la suma de
compras con su categoría, para que las métricas muestren en qué se gasta de verdad.
Una compra en 1 pago también se carga como compra de tarjeta.

### Modelo de datos
```sql
create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,            -- "Visa Galicia"
  color text not null default '#7c5cff',
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  created_at timestamptz not null default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid references cards on delete set null,
  description text not null,
  category_id uuid references categories on delete set null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  installments int not null default 1 check (installments between 1 and 60),
  purchased_on date not null,
  created_at timestamptz not null default now()
);

alter table transactions
  add column purchase_id uuid references purchases on delete cascade,
  add column installment int,        -- 4 (de 12)
  add column card_id uuid references cards on delete set null;
```
- Al crear una compra se generan N `transactions` (una por cuota) con `purchase_id`,
  `installment` y la fecha del **mes de resumen** en que cae cada cuota (según `closing_day`).
- Las métricas no cambian: cada cuota es un gasto con su categoría en su mes.
- **Resumen de tarjeta** = transacciones con ese `card_id` en el período del resumen.
- **Comprometido a futuro** = suma de cuotas con fecha posterior al mes actual.
- Montos: `total / cuotas` redondeado a centavos; la diferencia de redondeo va a la última cuota.

### UI
- Carga rápida: opción "Con tarjeta" (tarjeta + cuotas) en la hoja del botón +.
- Pantalla Tarjetas: resumen del período por tarjeta, desglose por compra y cuota (4/12),
  cierre y vencimiento, y total comprometido de los próximos meses.
- Editar/borrar una compra actualiza o borra todas sus cuotas.

## 2. Dividir gastos

**Objetivo:** pagar algo de varios y que en las métricas cuente solo la parte propia,
llevando la cuenta de quién debe.

### Modelo de datos
```sql
create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null
);

create table splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  transaction_id uuid not null references transactions on delete cascade,
  person_id uuid references people on delete cascade,  -- null = mi parte
  amount numeric(14,2) not null check (amount >= 0),
  settled_on date                                       -- cuándo me pagó
);
```
- La transacción guarda el total pagado; las métricas de gasto usan **mi parte**
  (la fila de `splits` con `person_id` null, o el total si no está dividida).
- Reparto: partes iguales, por monto o por porcentaje (siempre suma el total).
- "Te deben" = suma de partes de otras personas sin `settled_on`, por persona.
- Al marcar como cobrado se puede registrar opcionalmente como ingreso "Reintegro".
- Compatible con cuotas: se divide la compra y cada cuota hereda la proporción.

## Mientras tanto
Las pantallas `/tarjetas` y `/dividir` existen como "En desarrollo" (se entra desde Perfil).
