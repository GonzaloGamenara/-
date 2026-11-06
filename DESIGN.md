# Gastos · contrato de diseño

La app es una libreta de cuentas de todos los días: se abre muchas veces por día, casi siempre para
anotar algo rápido o mirar cuánto queda. De ahí sale todo: **"libreta en birome"**.

- **Papel** (claro) o **grafito** (oscuro) de fondo, superficies planas con una línea fina, como una hoja.
- **Azul birome** para la acción principal y los links: la tinta con la que se escribe la libreta
  (y la birome es un invento argentino).
- **Rojo de debe** para gastos y **verde de haber** para ingresos, como en contabilidad.
- El detalle propio es el **fueguito** de la racha. No se agregan otros adornos.

Este archivo es la fuente de verdad. Si algo nuevo necesita un token que no existe, se agrega acá
primero; no se inventan valores sueltos en un componente.

## Color

Tokens en `app/globals.css` (`:root`, claro según el sistema). En Tailwind: `bg-bg`, `bg-surface`,
`text-muted`, `border-line`, `bg-accent`, `text-exp`, etc.

| Token | Rol | Claro | Oscuro |
|---|---|---|---|
| `--bg` | Fondo (papel / grafito) | `#f4f4f1` | `#111317` |
| `--surface` | Tarjetas y hojas | `#ffffff` | `#171a1f` |
| `--inset` | Campos, chips, fondo de íconos, hover de filas | `#ededea` | `#22262d` |
| `--line` | Bordes y separadores | `#e0e0db` | `#2b3038` |
| `--fg` | Texto (tinta) | `#16181d` | `#eceef1` |
| `--muted` | Texto secundario (AA sobre bg y surface) | `#5c626d` | `#9aa1ac` |
| `--accent` / `--accent-ink` | Acción principal (azul birome) y su texto | `#2b44c9` / blanco | `#7d92ff` / `#0c1024` |
| `--accent-2` | Links y foco | `#2b44c9` | `#9eaeff` |
| `--exp` / `--on-exp` | Gasto (debe) | `#c0283a` | `#ff7686` |
| `--inc` / `--on-inc` | Ingreso (haber) | `#1c7a4b` | `#52c78e` |
| `--warn` | Cerca del techo, avisos | `#a8640f` | `#e2a64c` |
| `--chart-1..4` | Series de gráficos (día a día, tarjeta, fijos, compartidos) | azul, ocre, gris, verde agua | ídem aclarados |

Reglas:
- Rojo y verde **solo** significan gasto/ingreso o malo/bueno (techo pasado, ahorro). Nunca decoración.
- Los colores de las categorías los elige el usuario: se usan tal cual, al 22% de fondo detrás del emoji.
- Sin degradés, sin brillos de fondo, sin manchas de color detrás de los números.

## Tipografía

Geist Sans para todo, Geist Mono solo para código (tokens, URLs). Montos con `.num` (cifras tabulares).

| Uso | Clase |
|---|---|
| Monto principal de una pantalla | `num text-[clamp(2.25rem,11vw,3rem)] font-semibold` |
| Título de pantalla | `text-2xl font-semibold tracking-tight` |
| Título de sección | `text-sm font-semibold` (o `font-semibold` dentro de una tarjeta) |
| Texto | `text-[15px]` en filas, `text-sm` en párrafos |
| Secundario | `text-xs text-muted` |
| Mínimo | `text-xs` (12 px). `text-[11px]` solo en ejes de gráficos, calendario de la racha, etiquetas de la barra del celu y fichas de categoría |

## Forma y espacio

- Radios: **tarjetas `rounded-2xl`** (16 px) · campos, botones grandes y fondos de ícono **`rounded-xl`** (12 px) ·
  fichas y pastillas **`rounded-full`** · hojas **`rounded-t-3xl`** (24 px).
- Espacio: entre bloques `gap-4` (celu) / `gap-6` (columnas de escritorio); dentro de una tarjeta `p-4` o `p-5`.
- Filas de lista: `px-4 py-3`, ícono `size-10 rounded-xl`, separador `divide-y divide-line`.

## Jerarquía

- `.glass` = superficie plana con línea fina. Es el default para todo bloque.
- `.elevated` (sombra suave) **solo** en el resumen principal de cada pantalla: el gasto del mes en Inicio,
  "Hoy podés gastar", el total de Patrimonio, el ahorro del Cierre, los totales de Plan y Suscripciones.
- Listas largas (movimientos) sin tarjeta: filas sobre el fondo.

## Movimiento

- El contenido aparece al instante (`.rise` no anima).
- Se anima solo lo que comunica algo: hojas que suben (`sheet-in`), avisos (`pop`, `fade-in`), el fueguito.
- `prefers-reduced-motion` apaga todo.

## Interacción

- Todo lo tocable tiene manito (`cursor: pointer`) y foco visible (`outline` en `--accent-2`).
- Filas tocables: clase `.row-hover` (se marcan al pasar el mouse en escritorio) y `.press` (se achican al tocar).
- Atajos de escritorio (`lib/keys.ts`, nunca mientras escribís o con una hoja abierta):
  **N** gasto · **I** ingreso · **← →** mes · **/** buscar en Movimientos · **Esc** cierra hojas.

## Íconos

- Interfaz: íconos de línea de `components/Icons.tsx` (24×24, trazo 1.8, puntas redondeadas).
  Si falta uno, se dibuja ahí con el mismo estilo.
- Emojis **solo** para contenido que elige el usuario: categorías y tipos de patrimonio.

## Escritorio (≥ 1024 px)

- Barra lateral fija de 15.5 rem: nombre, botón **Anotar** (sólido, con su atajo), secciones y atajos.
- Contenido: Inicio, Patrimonio y Cierre a dos columnas (hasta 72 rem); el resto a 46 rem de ancho de lectura.
- Inicio: a la izquierda el mes, a la derecha el día. En el celu se mantiene el orden de una columna (`order-*`).
- Hojas: ventana centrada (`sm:items-center`), no desde abajo.

## No

- Degradés, vidrio esmerilado, brillos o "auroras" de fondo.
- Negro puro con un acento neón; crema con terracota; mayúsculas monoespaciadas como adorno.
- Una palabra del título en color de acento, numeraciones 01/02/03 decorativas.
- Sombras en todas las tarjetas.
