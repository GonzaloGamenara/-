"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** /demo: entra al modo demo (lo activa lib/supabase al cargar esta ruta) y muestra el panel principal */
export default function Demo() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
