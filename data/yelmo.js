// Instantánea de la cartelera de Yelmo, recogida desde una máquina doméstica.
//
// Lo genera scripts/recolector-yelmo.mjs — NO se edita a mano.
//
// Es un módulo JavaScript y no un .json a propósito: importar JSON exige un
// atributo especial en Node y depende de que el empaquetador lo soporte. Así
// funciona igual en los dos sitios, sin depender de nada.
export default {
  generatedAt: null,
  cines: {},
};
