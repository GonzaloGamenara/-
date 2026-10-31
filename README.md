# Gastos

PWA para anotar gastos e ingresos en segundos. Next.js 16 · React 19 · Tailwind 4 · Supabase · Vercel.

- Carga rápida: botón **+**, teclado numérico propio, categorías más usadas primero, "seguir cargando".
- Fijos mensuales (sueldo, beca, alquiler…) que se cargan solos el día elegido.
- Tarjetas con día de pago fijo: compras en 1 pago o en cuotas (incluso planes ya empezados) y suscripciones, cada una con su categoría, sumadas al resumen del mes.
- Cuentas compartidas: cada uno carga lo que pagó, la app calcula quién le debe a quién, y le pedís con tu alias por WhatsApp. En tus métricas cuenta solo tu parte.
- Resumen del mes: gastado, ingresos, balance, proyección a fin de mes, fijos vs variables, dona por categoría, comparación con el mes anterior.
- Funciona offline: lo que anotás sin conexión se sube solo al volver internet.
- Patrimonio: cuentas, CEDEARs, fondos y otros; los precios de los CEDEARs y el dólar MEP se actualizan solos, y cada mes queda la foto para ver la evolución.
- Asesor: Claude con todos tus datos como contexto y búsqueda web para tasas y precios del día.
- Importar desde un archivo (movimientos, correcciones, patrimonio) con vista previa y sin duplicar.
- Exporta para tu agente de IA (Markdown + JSON) y a CSV. Instalable en el celular.

## Puesta en marcha

### 1. Supabase
1. Crear proyecto en supabase.com.
2. **SQL Editor** → pegar `supabase/schema.sql` → Run. (Si ya lo habías corrido antes, corré también las migraciones de `supabase/migrations/` que falten, en orden.)
3. **Authentication → Providers → Email**: desactivar *Confirm email* (así podés entrar directo tras registrarte).
4. **Project Settings → API**: copiar *Project URL* y la key *anon/publishable*.

### 2. Local
```bash
cp .env.example .env.local   # completar las dos variables
npm install
npm run dev
```

### 3. Vercel
1. Importar este repo en vercel.com (framework: Next.js, sin configuración extra).
2. En *Environment Variables* cargar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Para el asesor, además `ANTHROPIC_API_KEY` (una clave de console.anthropic.com; se cobra por uso) y `ASESOR_EMAILS` (tu email: solo esas cuentas pueden usarlo).
3. Deploy. Después, en Supabase → *Authentication → URL Configuration*, poné la URL de Vercel como *Site URL*.

### 4. Instalar en el celular
Abrí la URL en Chrome/Safari → "Agregar a pantalla de inicio".

## Estructura
- `lib/store.tsx` datos, mutaciones optimistas, cola offline, generación de fijos
- `lib/stats.ts` métricas del mes
- `components/QuickAdd.tsx` carga rápida
- `public/sw.js` service worker
