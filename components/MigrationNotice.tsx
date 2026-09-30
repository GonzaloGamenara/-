"use client";

import { useStore } from "@/lib/store";

/** Aviso si falta correr la migración de tarjetas/división en Supabase. */
export function MigrationNotice() {
  const { needsMigration } = useStore();
  if (!needsMigration) return null;
  return (
    <div className="glass rounded-3xl border-l-4 border-l-exp p-4 text-sm">
      <b>Falta un paso en Supabase.</b>
      <p className="mt-1 text-muted">
        Para usar tarjetas, cuotas y gastos divididos, corré el archivo{" "}
        <code className="text-fg">supabase/migrations/002_tarjetas_y_dividir.sql</code> en Supabase → SQL Editor → Run, y
        recargá la app.
      </p>
    </div>
  );
}
