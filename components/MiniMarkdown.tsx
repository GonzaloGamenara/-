import { Fragment, type ReactNode } from "react";

/**
 * Markdown mínimo para las respuestas del asesor: títulos, listas, tablas, negrita,
 * cursiva, código y links. Arma elementos de React (nunca HTML crudo).
 */
export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const size = h[1].length <= 2 ? "text-base" : "text-[15px]";
      blocks.push(
        <p key={key++} className={`mt-1 font-semibold ${size}`}>
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key++} className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border-b border-line px-1.5 py-1 text-left font-semibold">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j} className="num border-b border-line/60 px-1.5 py-1 align-top">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && (bullet.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (bullet.test(lines[i])) items.push(lines[i].replace(bullet, ""));
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key++} className={`grid gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-muted`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="border-line" />);
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^\s*\||^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(para.join("\n"))}</p>);
  }

  return <div className="grid gap-2.5 text-[15px] leading-relaxed">{blocks}</div>;
}

/** Negrita, cursiva, código y links dentro de una línea */
function inline(s: string): ReactNode {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(<Fragment key={k++}>{lines(s.slice(last, m.index))}</Fragment>);
    const t = m[0];
    if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k++} className="rounded bg-inset px-1 text-[13px]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]("));
      out.push(
        <a key={k++} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {label}
        </a>,
      );
    } else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(<Fragment key={k++}>{lines(s.slice(last))}</Fragment>);
  return out;
}

// "$ 780.018" no se corta entre el signo y el número
const lines = (s: string) =>
  s.split("\n").map((part, i, arr) => (
    <Fragment key={i}>
      {part.replace(/(\$|US\$|USD) (?=\d)/g, "$1\u00a0")}
      {i < arr.length - 1 && <br />}
    </Fragment>
  ));
