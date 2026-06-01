// Configuración de los cines que mostramos en la cartelera.
// El "color" se usa como acento visual para distinguir cada cine de un vistazo.
export const CINEMAS = [
  {
    id: 'cinesur-bahia-cadiz',
    name: 'mk2 Cinesur Bahía de Cádiz',
    short: 'Cinesur Bahía',
    city: 'Cádiz',
    venue: 'C.C. Bahía de Cádiz',
    color: '#e11d48', // rosa/rojo
    website: 'https://www.mk2cines.es/es/bahia-de-cadiz-cadiz',
  },
  {
    id: 'yelmo-bahia-sur',
    name: 'Yelmo Premium Bahía Sur',
    short: 'Yelmo Bahía Sur',
    city: 'San Fernando',
    venue: 'C.C. Bahía Sur',
    color: '#2563eb', // azul
    website: 'https://www.yelmocines.es/cartelera/cadiz/bahia-sur',
  },
  {
    id: 'yelmo-jerez',
    name: 'Yelmo Cines Jerez',
    short: 'Yelmo Jerez',
    city: 'Jerez de la Frontera',
    venue: 'C.C. Área Sur',
    color: '#7c3aed', // morado
    website: 'https://www.yelmocines.es/cartelera/cadiz/jerez',
  },
  {
    id: 'arte-siete-puerto',
    name: 'Arte Siete El Puerto',
    short: 'Arte Siete',
    city: 'El Puerto de Santa María',
    venue: 'C.C. Vistahermosa',
    color: '#059669', // verde
    website: 'https://www.cinesartesiete.com/',
  },
];

export const CINEMA_BY_ID = Object.fromEntries(CINEMAS.map((c) => [c.id, c]));

export function getCinema(id) {
  return CINEMA_BY_ID[id];
}
