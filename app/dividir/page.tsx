import { ComingSoon } from "@/components/ComingSoon";
import { SplitIcon } from "@/components/Icons";

export default function Dividir() {
  return (
    <ComingSoon
      icon={<SplitIcon width={24} height={24} />}
      title="Dividir gastos"
      pitch="Pagaste vos pero era de varios: registrá solo tu parte en tus métricas y llevá la cuenta de quién te debe."
      preview={
        <div className="glass rounded-[28px] p-5">
          <p className="text-xs text-muted">Asado del sábado · pagaste vos</p>
          <p className="num text-3xl font-semibold">$ 60.000</p>
          <div className="mt-4 grid gap-2.5 text-sm">
            {[
              { n: "Vos", a: "$ 15.000", s: "tu parte" },
              { n: "Juli", a: "$ 15.000", s: "te debe" },
              { n: "Tomi", a: "$ 15.000", s: "✓ pagó" },
              { n: "Caro", a: "$ 15.000", s: "te debe" },
            ].map((p) => (
              <div key={p.n} className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-inset font-semibold">{p.n[0]}</span>
                <span className="flex-1">{p.n}</span>
                <span className="rounded-full bg-inset px-2 py-0.5 text-[11px] text-muted">{p.s}</span>
                <span className="num w-20 text-right font-medium">{p.a}</span>
              </div>
            ))}
          </div>
        </div>
      }
      features={[
        { title: "Partes iguales o a medida", text: "Por partes iguales, por monto o por porcentaje." },
        { title: "Tus métricas, reales", text: "En “En qué gastás” cuenta solo tu parte, no el total que pagaste." },
        { title: "Quién te debe", text: "Saldo por persona y marcar como cobrado cuando te pagan." },
        { title: "Combinable con tarjeta", text: "Una compra en cuotas también se puede dividir." },
      ]}
    />
  );
}
