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

// Los identificadores no cambian nunca aunque cambien las etiquetas: hay
// asaltos guardados que dependen de ellos.
//
// Algunas opciones cambian de palabra según el género de la persona. Se
// guardan las dos formas y etiquetaDe() elige. Como no hay asaltos entre
// hombres y mujeres, el género de todos los rivales es el del propio
// tirador, así que basta con saber el suyo.
export const MANOS = [
  { id: 'diestro', etiqueta: 'Diestro/a', M: 'Diestro', F: 'Diestra' },
  { id: 'zurdo', etiqueta: 'Zurdo/a', M: 'Zurdo', F: 'Zurda' },
  { id: 'desconocido', etiqueta: 'Desconocido', M: 'Desconocido', F: 'Desconocida' },
];

// La empuñadura es femenina en sí misma, así que no depende de la persona.
export const EMPUNADURAS = [
  { id: 'francesa', etiqueta: 'Francesa' },
  { id: 'pistola', etiqueta: 'Pistola' },
  { id: 'desconocida', etiqueta: 'Desconocida' },
];

// La altura del rival no se puede saber con exactitud, así que se compara a
// ojo con la propia.
export const ESTATURAS = [
  { id: 'similar', etiqueta: 'Similar' },
  { id: 'mas-alta', etiqueta: 'Más alto/a', M: 'Más alto', F: 'Más alta' },
  { id: 'mas-baja', etiqueta: 'Más bajo/a', M: 'Más bajo', F: 'Más baja' },
];

export const ESTATURA_POR_DEFECTO = 'similar';

export const GENEROS = [
  { id: 'M', etiqueta: 'Masculino' },
  { id: 'F', etiqueta: 'Femenino' },
];

// Las categorías de la federación, de la más joven a la de más edad. El
// tirador dice en cuáles compite —normalmente una o dos, porque se suele
// tirar en la propia y en la de arriba— y con eso Teseo ya sabe qué rivales
// y qué competiciones traerle sin volver a preguntárselo.
export const CATEGORIAS = [
  { id: 'M9', etiqueta: 'M9' },
  { id: 'M11', etiqueta: 'M11' },
  { id: 'M13', etiqueta: 'M13' },
  { id: 'M14', etiqueta: 'M14' },
  { id: 'M15', etiqueta: 'M15' },
  { id: 'M17', etiqueta: 'M17' },
  { id: 'M20', etiqueta: 'M20' },
  { id: 'M23', etiqueta: 'M23' },
  { id: 'ABS', etiqueta: 'Absoluta' },
  { id: 'VET30', etiqueta: 'VET30' },
  { id: 'VET40', etiqueta: 'VET40' },
  { id: 'VET50', etiqueta: 'VET50' },
  { id: 'VET60', etiqueta: 'VET60' },
  { id: 'VET70', etiqueta: 'VET70' },
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
  { id: 't256', etiqueta: 'Tablón de 256' },
  { id: 't128', etiqueta: 'Tablón de 128' },
  { id: 't64', etiqueta: 'Tablón de 64' },
  { id: 't32', etiqueta: 'Tablón de 32' },
  { id: 't16', etiqueta: 'Tablón de 16' },
  { id: 'cuartos', etiqueta: 'Cuartos' },
  { id: 'semifinal', etiqueta: 'Semifinal' },
  { id: 'final', etiqueta: 'Final' },
];

// Tramos del asalto. Se reparten en tercios sobre el asalto COMPLETO,
// encadenando sus tiempos uno detrás de otro: el final de un asalto a tres
// tiempos es el último tercio del tercero, no el de cada uno.
export const TRAMOS = [
  { id: 'principio', etiqueta: 'Principio' },
  { id: 'medio', etiqueta: 'Medio' },
  { id: 'final', etiqueta: 'Final' },
];

/**
 * Busca la etiqueta legible de un id dentro de un catálogo.
 * Si se le pasa el género ('M' o 'F') y la opción tiene forma masculina y
 * femenina, devuelve la que toca: "Diestra" en vez de "Diestro/a".
 */
export function etiquetaDe(catalogo, id, genero = null) {
  if (!id) return '';
  const encontrado = catalogo.find((opcion) => opcion.id === id);
  if (!encontrado) return id;
  if (genero && encontrado[genero]) return encontrado[genero];
  return encontrado.etiqueta;
}

/**
 * Devuelve el catálogo con las etiquetas ya resueltas para un género, listo
 * para pasárselo a un desplegable o a una fila de botones.
 */
export function opcionesPara(catalogo, genero = null) {
  return catalogo.map((opcion) => ({
    id: opcion.id,
    etiqueta: genero && opcion[genero] ? opcion[genero] : opcion.etiqueta,
  }));
}

/**
 * Cómo se muestra el nombre de un tirador.
 *
 * Los que vienen de la federación traen nombre y apellidos por separado, y se
 * leen mejor con los apellidos delante. Los que diste de alta a mano tienen
 * sólo el nombre, y se dejan tal cual.
 */
export function nombreCompleto(tirador) {
  if (!tirador) return '';
  const nombre = (tirador.nombre || '').trim();
  const apellidos = (tirador.apellidos || '').trim();
  if (!apellidos) return nombre;
  if (!nombre) return apellidos;
  return `${apellidos}, ${nombre}`;
}

/**
 * Deja un texto en una forma comparable: sin acentos, sin mayúsculas y sin
 * espacios de más. Sirve para saber si "José Pérez" y "JOSE PEREZ" son la
 * misma persona.
 */
export function normalizar(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
