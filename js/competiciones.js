// Importación del calendario de competiciones de la federación.
//
// Mismo planteamiento que con los rankings: el navegador no puede leer la web
// de la federación, así que el calendario se descarga antes con
// herramientas/traer-competiciones.js y viaja dentro de Teseo.
//
// A diferencia de los rankings, cada fichero trae una temporada entera con
// todas las categorías y ambos géneros: son unas ochenta competiciones, y no
// merece la pena partirlo.
//
// La parte de decidir qué importar es pura: recibe listas, devuelve un plan.

import { normalizar } from './constantes.js';

/** ¿Está este campo vacío? */
function vacio(valor) {
  return valor === undefined || valor === null || valor === '';
}

/**
 * Clave para reconocer la misma competición cuando no hay identificador.
 * Un mismo torneo se reparte en varias competiciones, una por categoría y
 * género, así que hacen falta los cuatro datos.
 */
function clave(competicion) {
  return [
    normalizar(competicion.nombre),
    competicion.fecha || '',
    competicion.categoria || '',
    competicion.genero || '',
  ].join('|');
}

// --- Lectura de los ficheros empaquetados -----------------------------

/** Qué temporadas de calendario trae Teseo. */
export async function listarCalendarios() {
  try {
    const respuesta = await fetch('./datos/competiciones.json', { cache: 'no-cache' });
    if (!respuesta.ok) return [];
    return await respuesta.json();
  } catch {
    return [];
  }
}

export async function cargarCalendario(fichero) {
  const respuesta = await fetch('./datos/' + fichero, { cache: 'no-cache' });
  if (!respuesta.ok) throw new Error('No se pudo leer el calendario ' + fichero);
  return respuesta.json();
}

// --- Decidir qué importar ---------------------------------------------

/** Convierte una fila del calendario en una ficha de competición. */
export function fichaDesdeCalendario(fila, calendario) {
  return {
    nombre: fila.nombre,
    fecha: fila.fecha,
    categoria: fila.categoria,
    genero: fila.genero,
    poblacion: fila.poblacion,
    temporada: calendario.temporada,
    idRfee: fila.idRfee,
    notas: '',
    origen: 'rfee',
  };
}

/**
 * Decide qué competiciones hay que añadir.
 *
 * @param {Array} candidatas fichas ya construidas y filtradas
 * @param {Array} locales    las competiciones ya guardadas
 * @returns {{nuevas: Array, yaEstan: number}}
 */
export function planificarImportacion(candidatas, locales) {
  const porIdRfee = new Set(locales.filter((c) => !vacio(c.idRfee)).map((c) => c.idRfee));
  const porClave = new Set(locales.map(clave));

  const nuevas = [];
  let yaEstan = 0;

  for (const ficha of candidatas) {
    const conocida = (!vacio(ficha.idRfee) && porIdRfee.has(ficha.idRfee))
                  || porClave.has(clave(ficha));
    if (conocida) yaEstan++;
    else nuevas.push(ficha);
  }

  return { nuevas, yaEstan };
}

/** Cómo se lee una competición de un vistazo. */
export function resumirCompeticion(competicion) {
  if (!competicion) return '';
  return [competicion.categoria, competicion.poblacion].filter(Boolean).join(' · ');
}
