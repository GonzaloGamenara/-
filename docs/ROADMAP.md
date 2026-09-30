# Roadmap

## Hecho
- **Tarjetas y cuotas** (`/tarjetas`, `/tarjetas/[id]`): tarjeta con día de pago fijo; compras en 1 pago o
  en cuotas (con "ya venía pagándola"), cada cuota es un movimiento con su categoría en el mes de pago;
  suscripciones = fijos con `card_id`; resumen desglosado por mes, planes activos y lo comprometido.
- **Gastos divididos** (`/dividir`): personas escritas en el momento; `transactions.my_share` guarda tu
  parte y las métricas la usan; `splits` guarda lo de cada persona y cuándo te pagó.
- Migración: `supabase/migrations/002_tarjetas_y_dividir.sql`.

## Ideas próximas
- Día de cierre de la tarjeta para sugerir automáticamente en qué resumen cae una compra.
- Presupuesto mensual por categoría con alerta al acercarse al límite.
- Recordatorio de vencimiento de tarjeta (notificación push de la PWA).
- Cobrar una división como ingreso "Reintegro" opcional.
- Gráfico de lo comprometido en cuotas mes a mes.
