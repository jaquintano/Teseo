// Catálogos de la aplicación.
//
// Todo lo que es "una lista de opciones fijas" vive aquí, en un solo sitio.
// Así, si mañana quieres añadir una acción ofensiva o cambiar un nombre, se
// toca este fichero y ya aparece en los botones y en las estadísticas.
//
// Cada opción tiene un `id`, que es lo que se guarda en la base de datos, y
// una `etiqueta`, que es lo que se ve en pantalla. Nunca cambies un `id` de
// algo ya guardado: las etiquetas viejas dejarían de encontrarse.

// La acción final de un intercambio
// ---------------------------------
// De cada intercambio se apunta cómo lo acabó cada uno: la acción final
// propia y la del rival, con la misma estructura las dos. De la frase de
// armas —lo que pasó ANTES del último movimiento— no se apunta nada: en un
// primer nivel, preguntar toda la conversación de hierros es largo y se acaba
// dejando en blanco, que es peor que no preguntarlo.
//
// El árbol tiene dos ramas y sólo se pregunta lo que cuelga de la elegida:
//
//   Ofensiva   → qué acción, con qué se remató y en qué línea acabó
//   Defensiva  → qué hizo: distancia, parada o nada
//
// El contraataque fue un tipo aparte hasta v75. Es una acción como las
// demás: acaba en un ataque simple y busca el tocado, así que vive entre las
// ofensivas y no en una rama para él solo.

export const TIPOS_DE_ACCION = [
  { id: 'ofensiva', etiqueta: 'Ofensiva' },
  { id: 'defensiva', etiqueta: 'Defensiva' },
];

// Casi todas las ofensivas rematan en un ataque simple, y de ése se pregunta
// cómo se llegó. La lista de variantes dice cuáles caben en cada una: la
// flecha no sale de una toma de hierro ni de un ligamento, y el coupé sólo
// tiene sentido en el ataque simple a secas. Las tres últimas no rematan en
// ataque simple, así que no preguntan nada.
export const ACCIONES_OFENSIVAS = [
  { id: 'ataque-simple', etiqueta: 'Ataque simple',
    variantes: ['flecha', 'fondo', 'coupe', 'directo'] },
  { id: 'toma-de-hierro', etiqueta: 'Toma de hierro + ataque simple',
    variantes: ['fondo', 'directo'] },
  { id: 'finta', etiqueta: 'Finta + ataque simple',
    variantes: ['flecha', 'fondo', 'directo'] },
  { id: 'pase', etiqueta: 'Pase + ataque simple',
    variantes: ['flecha', 'fondo', 'directo'] },
  { id: 'batimiento', etiqueta: 'Batimiento + ataque simple',
    variantes: ['flecha', 'fondo', 'directo'] },
  { id: 'ligamento', etiqueta: 'Ligamento + ataque simple',
    variantes: ['fondo', 'directo'] },

  // Las dos que salen de una reacción al ataque del otro: se para o se
  // contraataca, y de ahí sale el tocado.
  { id: 'parada', etiqueta: 'Parada + ataque simple',
    variantes: ['flecha', 'fondo', 'directo'] },
  { id: 'contraataque', etiqueta: 'Contraataque + ataque simple',
    variantes: ['flecha', 'fondo', 'coupe', 'directo'] },

  { id: 'cuerpo-a-cuerpo', etiqueta: 'Cuerpo a cuerpo', variantes: [] },
  { id: 'remise', etiqueta: 'Remise', variantes: [] },
  { id: 'reprise', etiqueta: 'Reprise', variantes: [] },
];

export const VARIANTES_DE_ATAQUE = [
  { id: 'flecha', etiqueta: 'Flecha' },
  { id: 'fondo', etiqueta: 'Fondo' },
  { id: 'coupe', etiqueta: 'Coupé' },
  { id: 'directo', etiqueta: 'Directo' },
];

/** Las variantes que admite una acción ofensiva. Vacío si no admite ninguna. */
export function variantesDe(accionId) {
  const accion = ACCIONES_OFENSIVAS.find((a) => a.id === accionId);
  if (!accion) return [];
  return VARIANTES_DE_ATAQUE.filter((v) => accion.variantes.includes(v.id));
}

// En qué línea acabó la acción. "Sin info" es una respuesta de verdad y no un
// hueco: muchas veces el vídeo no deja verlo, y eso no es lo mismo que
// dejarlo sin contestar.
export const LINEAS = [
  { id: 'sin-info', etiqueta: 'Sin info' },
  { id: 'cuarta', etiqueta: '4ª' },
  { id: 'sexta', etiqueta: '6ª' },
  { id: 'septima', etiqueta: '7ª' },
  { id: 'octava', etiqueta: '8ª' },
];

// La parada de aquí es la que se queda en nada: paraste y ahí acabó la cosa.
// La que remata en tocado es "Parada + ataque simple" y vive entre las
// ofensivas, que es donde está el resto de lo que busca el tocado.
export const ACCIONES_DEFENSIVAS = [
  { id: 'distancia', etiqueta: 'Distancia' },
  { id: 'parada', etiqueta: 'Parada sin respuesta' },
  { id: 'sin-reaccion', etiqueta: 'Sin reacción' },
];

/** Una acción final en blanco, que es como nacen los intercambios. */
export function accionVacia() {
  return { tipo: null, accion: null, variante: null, linea: null };
}

// Cómo iba el marcador al empezar un intercambio. No se juega igual ganando
// que perdiendo, así que las estadísticas se pueden mirar por separado.
export const SITUACIONES = [
  { id: 'ganando', etiqueta: 'Ganando' },
  { id: 'empate', etiqueta: 'Empate' },
  { id: 'perdiendo', etiqueta: 'Perdiendo' },
];

export const RESULTADOS = [
  { id: 'favor', etiqueta: 'Tocado a favor' },
  { id: 'contra', etiqueta: 'Tocado en contra' },
  { id: 'doble', etiqueta: 'Doble' },
  // El identificador sigue siendo 'nada': está guardado en los intercambios
  // que ya existen y se usa por su id en las cuentas. Lo que cambia es cómo
  // se llama, que "Nulo" es lo que se dice en la pista.
  { id: 'nada', etiqueta: 'Nulo' },
];

/** Resultados en los que tiene sentido preguntar dónde y en qué zona. */
export const RESULTADOS_CON_TOCADO = ['favor', 'contra', 'doble'];

// Tu color en el asalto
// ---------------------
// En espada cada tirador tiene una lámpara, verde o roja, y en un asalto no
// cambia: te enchufas a un lado de la pista y ahí te quedas. Por eso el dato
// cuelga del asalto y no de cada tiempo.
//
// Sirve para dos cosas distintas. Una, para que la detección automática sepa
// de quién es cada encendido. Y otra, para pintar: la marca de un intercambio
// lleva el color de la LÁMPARA que se encendió, no el del resultado. Si tú
// eres el rojo, tus tocados salen en rojo, que es lo que has visto en la
// pista y lo que el ojo espera.

export const COLORES_LAMPARA = [
  { id: 'verde', etiqueta: 'Verde' },
  { id: 'rojo', etiqueta: 'Rojo' },
];

// Pero al usuario NO se le pregunta el color, sino de qué lado de la pista
// estaba, que es lo que siempre se sabe: el aparato puede quedar de espaldas,
// tapado o directamente no verse en el vídeo, y entonces "¿eras el verde?" no
// hay quien lo conteste. El lado se ve siempre.
//
// La correspondencia es fija: izquierda es rojo y derecha es verde. Se guarda
// el color, que es lo que necesitan la detección automática y el pintado; el
// lado es sólo la forma de preguntarlo.
export const LADOS_DE_LA_PISTA = [
  { id: 'izquierda', etiqueta: 'Izquierda', color: 'rojo' },
  { id: 'derecha', etiqueta: 'Derecha', color: 'verde' },
];

/** La misma pregunta en todas las pantallas, que si no parecen dos cosas. */
export const PREGUNTA_LADO = '¿En qué lado de la pista estabas?';

/** El color de lámpara que le toca a un lado. */
export function colorDelLado(lado) {
  const ficha = LADOS_DE_LA_PISTA.find((l) => l.id === lado);
  return ficha ? ficha.color : null;
}

/** Y al revés, para enseñar el lado de un asalto ya contestado. */
export function ladoDelColor(color) {
  const ficha = LADOS_DE_LA_PISTA.find((l) => l.color === color);
  return ficha ? ficha.id : null;
}

/**
 * De qué color fue la lámpara de un intercambio.
 *
 * Los que no son un tocado de nadie —el doble, el nulo, el que aún no está
 * etiquetado— se devuelven tal cual: tienen su propio color y no son de
 * ninguna lámpara.
 *
 * @param {string} resultado 'favor', 'contra', 'doble', 'nada' o nada
 * @param {?string} miColor 'verde' o 'rojo'; sin él se supone verde, que es
 *                          lo que hacía Teseo antes de preguntarlo
 */
export function colorDeLaLampara(resultado, miColor) {
  const mia = miColor === 'rojo' ? 'rojo' : 'verde';
  const suya = mia === 'rojo' ? 'verde' : 'rojo';
  if (resultado === 'favor') return mia;
  if (resultado === 'contra') return suya;
  return resultado || 'vacio';
}

// Dónde cayó el tocado. Se pregunta de los dos lados: en un tocado a favor,
// dónde tocaste tú; en uno en contra, dónde te tocaron; en un doble, las dos
// cosas.
export const ZONAS_TOCADAS = [
  { id: 'careta', etiqueta: 'Careta' },
  { id: 'mano', etiqueta: 'Mano' },
  { id: 'brazo', etiqueta: 'Brazo' },
  { id: 'torso', etiqueta: 'Torso' },
  { id: 'pierna', etiqueta: 'Pierna' },
  { id: 'pie', etiqueta: 'Pie' },
  { id: 'espalda', etiqueta: 'Espalda' },
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

export const GENEROS = [
  { id: 'M', etiqueta: 'Masculino' },
  { id: 'F', etiqueta: 'Femenino' },
];

// Con qué llega rellena la ficha propia antes de que nadie toque nada. No es
// una regla de la esgrima: es por dónde empieza casi todo el que abre Teseo,
// y se cambia con un toque.
export const GENERO_POR_DEFECTO = 'F';

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

export const CATEGORIA_POR_DEFECTO = 'M17';

// La fase es secundaria y opcional. Se ofrece como lista para no tener que
// escribirla a mano, que es incómodo de pie en la sala.
// En espada no hay empates. Si al acabar el tiempo van iguales se tira un
// minuto más —la prioridad— y se sortea a quién se le da: si ese minuto pasa
// sin tocados, el punto y el asalto son suyos.
export const PRIORIDADES = [
  { id: 'yo', etiqueta: 'Yo' },
  { id: 'rival', etiqueta: 'Mi rival' },
];

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
/**
 * Si un texto cumple lo que se ha escrito en un buscador.
 *
 * Cada palabra tiene que aparecer, pero en el orden que sea: los tiradores se
 * guardan como los publica la federación —"USEROS MARTÍN, MARÍA"— y nadie
 * escribe eso; se escribe "maría useros". Por lo mismo, las comas cuentan
 * como espacios.
 */
export function coincide(texto, busqueda) {
  const palabras = normalizar(busqueda).split(' ').filter(Boolean);
  if (palabras.length === 0) return true;

  const donde = normalizar(String(texto).replace(/,/g, ' '));
  return palabras.every((palabra) => donde.includes(palabra));
}

export function normalizar(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
