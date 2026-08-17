// Catálogos de la aplicación.
//
// Todo lo que es "una lista de opciones fijas" vive aquí, en un solo sitio.
// Así, si mañana quieres añadir una acción ofensiva o cambiar un nombre, se
// toca este fichero y ya aparece en los botones y en las estadísticas.
//
// Cada opción tiene un `id`, que es lo que se guarda en la base de datos, y
// una `etiqueta`, que es lo que se ve en pantalla. Nunca cambies un `id` de
// algo ya guardado: las etiquetas viejas dejarían de encontrarse.

export const ACCIONES_OFENSIVAS = [
  { id: 'fondo', etiqueta: 'Fondo' },
  { id: 'flecha', etiqueta: 'Flecha' },
  { id: 'ataque-brazo', etiqueta: 'Ataque al brazo' },
  { id: 'coupe', etiqueta: 'Coupé' },
  { id: 'punta-linea', etiqueta: 'Punta en línea' },
];

export const ACCIONES_DEFENSIVAS = [
  { id: 'parada', etiqueta: 'Parada' },
  { id: 'esquiva', etiqueta: 'Esquiva / retirada' },
  { id: 'contraataque', etiqueta: 'Contraataque' },
];

export const RESULTADOS = [
  { id: 'favor', etiqueta: 'Tocado a favor' },
  { id: 'contra', etiqueta: 'Tocado en contra' },
  { id: 'doble', etiqueta: 'Doble' },
  { id: 'nada', etiqueta: 'Nada' },
];

/** Resultados en los que tiene sentido preguntar dónde y en qué zona. */
export const RESULTADOS_CON_TOCADO = ['favor', 'contra', 'doble'];

export const ZONAS_CUERPO = [
  { id: 'mano', etiqueta: 'Mano' },
  { id: 'brazo', etiqueta: 'Brazo' },
  { id: 'torso', etiqueta: 'Torso' },
  { id: 'pierna', etiqueta: 'Pierna' },
  { id: 'mascara', etiqueta: 'Máscara' },
];

export const ZONAS_PISTA = [
  { id: 'centro', etiqueta: 'Centro' },
  { id: 'campo-propio', etiqueta: 'Mi campo' },
  { id: 'campo-rival', etiqueta: 'Campo del rival' },
  { id: 'extremo-propio', etiqueta: 'Mi extremo' },
  { id: 'extremo-rival', etiqueta: 'Extremo del rival' },
];

export const MANOS = [
  { id: 'diestro', etiqueta: 'Diestro' },
  { id: 'zurdo', etiqueta: 'Zurdo' },
];

export const TIPOS_DE_SESION = [
  { id: 'entrenamiento', etiqueta: 'Entrenamiento' },
  { id: 'competicion', etiqueta: 'Competición' },
  { id: 'amistoso', etiqueta: 'Amistoso' },
];

// La fase es secundaria y opcional. Se ofrece como lista para no tener que
// escribirla a mano, que es incómodo de pie en la sala.
export const FASES = [
  { id: 'poule', etiqueta: 'Poule' },
  { id: 't64', etiqueta: 'Tablón de 64' },
  { id: 't32', etiqueta: 'Tablón de 32' },
  { id: 't16', etiqueta: 'Tablón de 16' },
  { id: 'cuartos', etiqueta: 'Cuartos' },
  { id: 'semifinal', etiqueta: 'Semifinal' },
  { id: 'final', etiqueta: 'Final' },
];

/** Busca la etiqueta legible de un id dentro de un catálogo. */
export function etiquetaDe(catalogo, id) {
  if (!id) return '';
  const encontrado = catalogo.find((opcion) => opcion.id === id);
  return encontrado ? encontrado.etiqueta : id;
}
