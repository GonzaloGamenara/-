/** Atajos de teclado de escritorio: no se disparan mientras escribís, con modificadores o con una hoja abierta */
export function plainKey(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
  return !document.querySelector('[role="dialog"]');
}
