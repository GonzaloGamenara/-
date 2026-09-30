import { ComingSoon } from "@/components/ComingSoon";
import { CardIcon } from "@/components/Icons";

const ROWS = [
  { emoji: "🛒", name: "Supermercado", cuota: "1/1", amount: "$ 48.300" },
  { emoji: "📱", name: "Celular", cuota: "4/12", amount: "$ 37.500" },
  { emoji: "👟", name: "Zapatillas", cuota: "2/3", amount: "$ 29.900" },
  { emoji: "📺", name: "Spotify", cuota: "1/1", amount: "$ 9.000" },
];

export default function Tarjetas() {
  return (
    <ComingSoon
      icon={<CardIcon width={24} height={24} />}
      title="Tarjetas y cuotas"
      pitch="Cargá cada compra de la tarjeta, en 1 pago o en cuotas, y mirá el resumen del mes desglosado por concepto y categoría."
      preview={
        <div className="glass rounded-[28px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">Resumen · cierra el 24</p>
              <p className="num text-3xl font-semibold">$ 124.700</p>
            </div>
            <div
              className="h-10 w-16 rounded-lg"
              style={{ background: "linear-gradient(135deg, #7c5cff, #5eead4)" }}
            />
          </div>
          <ul className="mt-4 grid gap-2.5">
            {ROWS.map((r) => (
              <li key={r.name} className="flex items-center gap-3 text-sm">
                <span className="grid size-9 place-items-center rounded-xl bg-inset">{r.emoji}</span>
                <span className="flex-1">{r.name}</span>
                <span className="rounded-full bg-inset px-2 py-0.5 text-[11px] text-muted">{r.cuota}</span>
                <span className="num w-20 text-right font-medium">{r.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      }
      features={[
        { title: "Tus tarjetas", text: "Cada una con su día de cierre y de vencimiento." },
        { title: "Compras en cuotas", text: "Cargás el total y la cantidad de cuotas; cada mes aparece la cuota que corresponde (4/12)." },
        { title: "Resumen desglosado", text: "El total de la tarjeta separado en conceptos, así las métricas muestran en qué gastás y no solo “Tarjeta”." },
        { title: "Lo que ya comprometiste", text: "Cuánto de los próximos meses ya está gastado en cuotas." },
      ]}
    />
  );
}
