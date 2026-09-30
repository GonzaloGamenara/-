import { money } from "./format";

export interface DebtItem {
  label: string;
  amount: number;
}

/** Mensaje para pedirle a alguien lo que te debe, con tu alias. */
export function debtMessage(name: string, items: DebtItem[], alias: string) {
  const total = items.reduce((a, i) => a + i.amount, 0);
  const detail =
    items.length === 1
      ? `De ${items[0].label} te toca ${money(total)}.`
      : `Te paso el detalle:\n${items.map((i) => `• ${i.label}: ${money(i.amount)}`).join("\n")}\nTotal: ${money(total)}.`;
  const pay = alias ? `\n\nPodés transferirme al alias *${alias}* 🙌` : "";
  return `¡Hola ${name}! ${detail}${pay}`;
}

/** Abre el menú de compartir del celu (WhatsApp, etc.); si no hay, WhatsApp directo. */
export async function shareText(text: string) {
  const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ text });
      return "shared" as const;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled" as const;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  return "whatsapp" as const;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
