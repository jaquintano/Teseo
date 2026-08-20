// Importación de rankings de la federación.
//
// Los rankings no se piden a la web de la federación desde aquí: el navegador
// no lo permite. Vienen empaquetados dentro de Teseo, en la carpeta datos/,
// descargados antes con herramientas/traer-ranking.js. Para la aplicación son
// ficheros propios, así que además funcionan sin cobertura.
//
// Este módulo hace dos cosas: leer esos ficheros y decidir qué hay que
// añadir o completar. La parte de decidir es pura —recibe listas, devuelve un
// plan— y no toca ni la pantalla ni la base de datos.

import { normalizar } from './constantes.js';

/** Los campos que la federación puede rellenar. Ni mano, ni altura, ni notas. */
const CAMPOS_DE_LA_FEDERACION = [
  'apellidos', 'fechaNacimiento', 'club', 'idRfee', 'categoriaRfee', 'temporadaRfee',
];

/** ¿Está este campo vacío? Un 0 o un false contarían como puestos. */
function vacio(valor) {
  return valor === undefined || valor === null || valor === '';
}

/**
 * Clave para reconocer a la misma persona escrita de otra manera.
 * Las palabras se ordenan, así que "Jimena Moral Hojas" y "Moral Hojas,
 * Jimena" dan lo mismo.
 */
function claveNombre(tirador) {
  const texto = [tirador.nombre, tirador.apellidos].filter(Boolean).join(' ');
  return normalizar(texto.replace(/,/g, ' ')).split(' ').filter(Boolean).sort().join(' ');
}

// --- Lectura de los ficheros empaquetados -----------------------------

/** Qué rankings trae Teseo. Devuelve [] si todavía no hay ninguno. */
export async function listarRankings() {
  try {
    const respuesta = await fetch('./datos/rankings.json', { cache: 'no-cache' });
    if (!respuesta.ok) return [];
    return await respuesta.json();
  } catch {
    return [];
  }
}

/** Carga un ranking concreto. */
export async function cargarRanking(fichero) {
  const respuesta = await fetch('./datos/' + fichero, { cache: 'no-cache' });
  if (!respuesta.ok) throw new Error('No se pudo leer el ranking ' + fichero);
  return respuesta.json();
}

// --- Decidir qué importar ---------------------------------------------

/** Construye una ficha de tirador nueva a partir de una fila del ranking. */
export function fichaDesdeRfee(fila, ranking) {
  return {
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    fechaNacimiento: fila.fechaNacimiento,
    // El club llega como código de la federación (CETC-M, ECC-BU...). Se
    // guarda tal cual y se puede corregir a mano.
    club: fila.club,
    // La federación no publica la mano. Se pide al usuario.
    mano: null,
    altura: null,
    notas: '',
    idRfee: fila.idRfee,
    categoriaRfee: ranking.categoria,
    temporadaRfee: ranking.temporada,
    origen: 'rfee',
  };
}

/**
 * Decide qué hacer con cada tirador del ranking.
 *
 * @param {Array} ranking       el fichero de ranking entero
 * @param {Array} locales       los tiradores que ya hay guardados
 * @returns {{nuevos: Array, completables: Array, sinCambios: number}}
 *          `completables` son los que ya tienes y a los que se les puede
 *          rellenar algún hueco, con la lista de qué se les rellenaría.
 */
export function planificarImportacion(ranking, locales) {
  const porIdRfee = new Map();
  const porNombre = new Map();

  for (const local of locales) {
    if (!vacio(local.idRfee)) porIdRfee.set(local.idRfee, local);
    const clave = claveNombre(local);
    if (clave) {
      // Si dos locales se llaman igual, no nos fiamos de esa vía.
      porNombre.set(clave, porNombre.has(clave) ? null : local);
    }
  }

  const nuevos = [];
  const completables = [];
  let sinCambios = 0;

  for (const fila of ranking.tiradores) {
    const ficha = fichaDesdeRfee(fila, ranking);

    // Primero por identificador de la federación, que es inequívoco.
    // Si no, por nombre, y sólo cuando no haya ambigüedad.
    let local = porIdRfee.get(fila.idRfee) || null;
    if (!local) {
      const encontrado = porNombre.get(claveNombre(ficha));
      if (encontrado) local = encontrado;
    }

    if (!local) {
      nuevos.push(ficha);
      continue;
    }

    // Ya lo tienes: sólo se rellena lo que esté vacío.
    const cambios = CAMPOS_DE_LA_FEDERACION
      .filter((campo) => vacio(local[campo]) && !vacio(ficha[campo]))
      // Excepción: los apellidos. Si diste de alta a alguien escribiendo el
      // nombre entero en un solo campo, añadirle aparte los apellidos haría
      // que se mostrara dos veces ("MORAL HOJAS, Moral Hojas Jimena"). Se
      // queda como lo escribiste; el enlace con la federación lo da el
      // identificador, no el nombre.
      .filter((campo) => campo !== 'apellidos' || vacio(local.nombre));

    if (cambios.length === 0) {
      sinCambios++;
    } else {
      completables.push({ local, ficha, cambios });
    }
  }

  return { nuevos, completables, sinCambios };
}

/**
 * Devuelve la ficha local con los huecos rellenos. No modifica la original y
 * no toca nunca mano, altura ni notas.
 */
export function rellenarHuecos(local, ficha, cambios) {
  const resultado = { ...local };
  for (const campo of cambios) resultado[campo] = ficha[campo];
  return resultado;
}
