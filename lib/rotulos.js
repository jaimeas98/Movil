// Cómo se nombra cada cine en la interfaz, según el sitio del que se dispone.
//
// lib/cinemas/config.js trae el nombre comercial y uno corto ("Yelmo Bahía
// Sur"), pero en el interruptor del móvil caben diez letras y no catorce, y en
// el pie de cada grupo de entradas sobra "de la Frontera". Esto no toca los
// datos: solo decide el rótulo.

const INTERRUPTOR = {
  'cinesur-bahia-cadiz': 'Cinesur',
  'yelmo-bahia-sur': 'Bahía Sur',
  'yelmo-jerez': 'Área Sur',
  'arte-siete-puerto': 'Arte Siete',
};

const LUGAR = {
  'Jerez de la Frontera': 'Jerez',
  'El Puerto de Santa María': 'El Puerto',
};

export function nombreInterruptor(cine) {
  return INTERRUPTOR[cine.id] ?? cine.short ?? cine.name;
}

export function lugarCorto(cine) {
  return LUGAR[cine.city] ?? cine.city ?? '';
}
