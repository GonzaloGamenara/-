# Gastos

PWA para anotar gastos e ingresos en segundos. Next.js 16 · React 19 · Tailwind 4 · Supabase · Vercel.

- Carga rápida: botón **+**, teclado numérico propio, categorías más usadas primero, "seguir cargando".
- Fijos mensuales (sueldo, beca, alquiler…) que se cargan solos el día elegido.
- Resumen del mes: gastado, ingresos, balance, proyección a fin de mes, fijos vs variables, dona por categoría, comparación con el mes anterior.
- Funciona offline: lo que anotás sin conexión se sube solo al volver internet.
- Exporta a CSV. Instalable en el celular.

## Puesta en marcha

### 1. Supabase
1. Crear proyecto en supabase.com.
2. **SQL Editor** → pegar `supabase/schema.sql` → Run.
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
3. Deploy. Después, en Supabase → *Authentication → URL Configuration*, poné la URL de Vercel como *Site URL*.

### 4. Instalar en el celular
Abrí la URL en Chrome/Safari → "Agregar a pantalla de inicio".

## Estructura
- `lib/store.tsx` datos, mutaciones optimistas, cola offline, generación de fijos
- `lib/stats.ts` métricas del mes
- `components/QuickAdd.tsx` carga rápida
- `public/sw.js` service worker
