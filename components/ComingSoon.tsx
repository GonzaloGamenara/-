import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "./Icons";

/** Pantalla de una función que todavía está en desarrollo. */
export function ComingSoon({
  icon,
  title,
  pitch,
  features,
  preview,
}: {
  icon: ReactNode;
  title: string;
  pitch: string;
  features: { title: string; text: string }[];
  preview: ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <header className="rise flex items-center gap-2 pt-1">
        <Link href="/ajustes" aria-label="Volver" className="press -ml-1 grid size-9 place-items-center rounded-full bg-surface">
          <ChevronLeft width={18} height={18} />
        </Link>
        <span className="text-sm text-muted">Perfil</span>
      </header>

      <section className="rise grid gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-inset">{icon}</span>
          <span className="rounded-full bg-accent2/15 px-2.5 py-1 text-xs font-semibold text-accent2">En desarrollo</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted">{pitch}</p>
      </section>

      <section className="rise pointer-events-none select-none" aria-hidden style={{ animationDelay: "60ms" }}>
        <div className="relative">
          <div className="opacity-70 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">{preview}</div>
          <span className="absolute -top-2.5 right-5 z-10 rounded-full bg-fg px-3 py-1 text-[11px] font-semibold text-bg">
            Vista previa
          </span>
        </div>
      </section>

      <section className="glass rise rounded-3xl p-5" style={{ animationDelay: "120ms" }}>
        <h2 className="mb-3 text-sm font-semibold">Lo que va a hacer</h2>
        <ul className="grid gap-3">
          {features.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent2" />
              <span>
                <span className="block text-[15px] font-medium">{f.title}</span>
                <span className="text-sm text-muted">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
