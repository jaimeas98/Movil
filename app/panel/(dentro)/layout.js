// Las páginas del panel que necesitan sesión (todas menos /panel/entrar).
// La puerta de verdad es middleware.js; esta es la segunda: si el middleware
// se desconfigurara, la página seguiría siendo un 404 sin la cookie.
import { exigirSesion } from '@/lib/panel/sesion.js';

// Cada visita se comprueba de nuevo: nada de esto se puede servir de caché.
export const dynamic = 'force-dynamic';

export default async function LayoutConSesion({ children }) {
  await exigirSesion();
  return children;
}
