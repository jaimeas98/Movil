import Entrar from '@/components/panel/Entrar.jsx';

// Sin JavaScript, un fallo vuelve aquí con ?mal=1 (303 del servidor).
export default function PaginaEntrar({ searchParams }) {
  return <Entrar mal={searchParams?.mal === '1'} />;
}
