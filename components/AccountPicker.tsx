"use client";

import { useStore } from "@/lib/store";

/** Elegir una de tus cuentas (vacío = la principal). No aparece si tenés una sola o falta la migración 008. */
export function AccountPicker({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (id: string) => void }) {
  const { accounts, accountsReady, defaultAccount } = useStore();
  if (!accountsReady || accounts.length < 2) return null;
  const current = value ?? defaultAccount;
  return (
    <div className="grid gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      <div className="hide-scroll -mx-5 flex gap-1.5 overflow-x-auto px-5 text-sm">
        {accounts.map((a) => (
          <button
            type="button"
            key={a.id}
            onClick={() => onChange(a.id)}
            aria-pressed={current === a.id}
            className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium ${current === a.id ? "bg-fg text-bg" : "bg-inset text-muted"}`}
          >
            <span className="text-[13px]">🏦</span>
            {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}
