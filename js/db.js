// Base de datos local (IndexedDB).
//
// Todo lo que Teseo guarda vive en el propio móvil, dentro del navegador.
// No hay servidor y nada de esto sale del teléfono.
//
// Cómo está organizado
// --------------------
//   ajustes       una sola ficha con la configuración; ahora mismo sólo
//                 apunta a cuál de los tiradores eres tú.
//   tiradores     tú y todos los rivales, con la misma ficha. Los rivales se
//                 repiten mucho entre torneos, por eso se guardan aparte.
//   asaltos       un combate contra un rival, con su contexto.
//   tiempos       cada asalto tiene uno o varios tiempos (en poule uno, en
//                 directas dos o tres), y cada tiempo tiene su propio vídeo.
//   videoTrozos   los vídeos, partidos en bloques de 8 MB.
//   intercambios  las etiquetas. Cada una cuelga de un tiempo.
//
// Por qué los vídeos van troceados
// --------------------------------
// Guardar un fichero de la galería de una sola vez falló en las pruebas con
// un vídeo de 156 MB. Leerlo en bloques y envolver cada bloque en un dato
// nuevo, ya independiente del fichero original, va bien y además nos dice en
// qué bloque falla si algo va mal.

import { nombreCompleto } from './constantes.js';

const NOMBRE_BD = 'teseo';
const VERSION_BD = 1;
const TAMANO_TROZO = 8 * 1024 * 1024;

export const ALMACENES = {
  ajustes: 'ajustes',
  tiradores: 'tiradores',
  asaltos: 'asaltos',
  tiempos: 'tiempos',
  videoTrozos: 'videoTrozos',
  intercambios: 'intercambios',
};

let conexion = null;

/** Abre la base de datos, creándola la primera vez. */
export function abrir() {
  if (conexion) return Promise.resolve(conexion);

  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);

    // Sólo se ejecuta cuando la base de datos no existe o sube de versión.
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;

      if (!bd.objectStoreNames.contains(ALMACENES.ajustes)) {
        bd.createObjectStore(ALMACENES.ajustes);
      }

      if (!bd.objectStoreNames.contains(ALMACENES.tiradores)) {
        bd.createObjectStore(ALMACENES.tiradores, { keyPath: 'id', autoIncrement: true });
      }

      if (!bd.objectStoreNames.contains(ALMACENES.asaltos)) {
        const almacen = bd.createObjectStore(ALMACENES.asaltos, { keyPath: 'id', autoIncrement: true });
        almacen.createIndex('por-rival', 'rivalId');
        almacen.createIndex('por-fecha', 'fecha');
      }

      if (!bd.objectStoreNames.contains(ALMACENES.tiempos)) {
        const almacen = bd.createObjectStore(ALMACENES.tiempos, { keyPath: 'id', autoIncrement: true });
        almacen.createIndex('por-asalto', 'asaltoId');
      }

      if (!bd.objectStoreNames.contains(ALMACENES.videoTrozos)) {
        bd.createObjectStore(ALMACENES.videoTrozos);
      }

      if (!bd.objectStoreNames.contains(ALMACENES.intercambios)) {
        const almacen = bd.createObjectStore(ALMACENES.intercambios, { keyPath: 'id', autoIncrement: true });
        almacen.createIndex('por-tiempo', 'tiempoId');
        almacen.createIndex('por-asalto', 'asaltoId');
      }
    };

    peticion.onsuccess = () => {
      conexion = peticion.result;
      resolver(conexion);
    };
    peticion.onerror = () => rechazar(peticion.error);
  });
}

/**
 * Ejecuta una operación sobre uno o varios almacenes.
 * Cada llamada abre y cierra su propia transacción, que es lo más sencillo
 * de razonar aunque sea un pelín menos rápido.
 */
async function operar(almacenes, modo, accion) {
  const bd = await abrir();
  return new Promise((resolver, rechazar) => {
    const transaccion = bd.transaction(almacenes, modo);
    let resultado;
    try {
      resultado = accion(transaccion);
    } catch (error) {
      rechazar(error);
      return;
    }
    // Ojo: cuando lo pedido no existe, `resultado.result` es undefined. Hay
    // que comprobar el tipo y no usar ?? con el propio objeto de la petición,
    // o acabaríamos devolviendo la petición en vez de "no hay nada".
    transaccion.oncomplete = () => resolver(
      resultado instanceof IDBRequest ? resultado.result : resultado);
    transaccion.onerror = () => rechazar(transaccion.error);
    transaccion.onabort = () => rechazar(transaccion.error);
  });
}

// --- Operaciones corrientes -------------------------------------------

/** Guarda un objeto. Si no trae id, se le asigna uno nuevo. */
export function guardar(almacen, objeto) {
  return operar(almacen, 'readwrite', (t) => t.objectStore(almacen).put(objeto));
}

/** Guarda un objeto bajo una clave concreta (para el almacén de ajustes). */
export function guardarConClave(almacen, clave, objeto) {
  return operar(almacen, 'readwrite', (t) => t.objectStore(almacen).put(objeto, clave));
}

export function obtener(almacen, clave) {
  return operar(almacen, 'readonly', (t) => t.objectStore(almacen).get(clave));
}

export function listar(almacen) {
  return operar(almacen, 'readonly', (t) => t.objectStore(almacen).getAll());
}

/** Devuelve todos los objetos cuyo índice vale lo que se pide. */
export function listarPor(almacen, indice, valor) {
  return operar(almacen, 'readonly', (t) =>
    t.objectStore(almacen).index(indice).getAll(valor));
}

export function borrar(almacen, clave) {
  return operar(almacen, 'readwrite', (t) => t.objectStore(almacen).delete(clave));
}

// --- Perfil propio ----------------------------------------------------

/** Devuelve tu ficha de tirador, o null si todavía no la has creado. */
export async function obtenerPerfilPropio() {
  const id = await obtener(ALMACENES.ajustes, 'perfilPropioId');
  if (id === undefined) return null;
  return (await obtener(ALMACENES.tiradores, id)) || null;
}

/** Guarda tu ficha y la marca como la tuya. */
export async function guardarPerfilPropio(perfil) {
  const id = await guardar(ALMACENES.tiradores, perfil);
  await guardarConClave(ALMACENES.ajustes, 'perfilPropioId', id);
  return id;
}

/** Los tiradores que no eres tú, es decir, los rivales. */
export async function listarRivales() {
  const propioId = await obtener(ALMACENES.ajustes, 'perfilPropioId');
  const todos = await listar(ALMACENES.tiradores);
  return todos
    .filter((tirador) => tirador.id !== propioId)
    // Por el nombre tal y como se muestra, que con apellidos delante no es
    // lo mismo que el nombre de pila.
    .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
}

// --- Vídeos -----------------------------------------------------------

/**
 * Comprueba que el fichero se deja leer de verdad, leyendo un poco del
 * principio y otro poco del final.
 *
 * Hace falta porque un vídeo que Google Fotos ha subido a la nube y del que
 * ha liberado el espacio en el móvil parece estar ahí —se ve la miniatura y
 * hasta la duración— pero sus bytes no se pueden leer.
 */
export async function comprobarLegible(fichero) {
  const muestra = 64 * 1024;
  try {
    await fichero.slice(0, muestra).arrayBuffer();
    await fichero.slice(Math.max(0, fichero.size - muestra)).arrayBuffer();
    return { legible: true };
  } catch (error) {
    return { legible: false, error };
  }
}

/** Lee un trozo del fichero, reintentando si falla. */
async function leerTrozo(fichero, desde, hasta, intentos = 3) {
  for (let intento = 1; ; intento++) {
    try {
      return await fichero.slice(desde, hasta).arrayBuffer();
    } catch (error) {
      if (intento >= intentos) throw error;
      await new Promise((seguir) => setTimeout(seguir, 400 * intento));
    }
  }
}

/**
 * Copia un vídeo al almacenamiento de la aplicación, en bloques.
 * @param {number} tiempoId a qué tiempo pertenece
 * @param {File} fichero el vídeo elegido en la galería
 * @param {(hechos:number, total:number) => void} alProgresar
 * @returns {Promise<number>} cuántos trozos ocupó
 */
export async function guardarVideo(tiempoId, fichero, alProgresar = () => {}) {
  const totalTrozos = Math.ceil(fichero.size / TAMANO_TROZO);

  for (let i = 0; i < totalTrozos; i++) {
    const desde = i * TAMANO_TROZO;
    const hasta = Math.min(desde + TAMANO_TROZO, fichero.size);
    const datos = await leerTrozo(fichero, desde, hasta);

    await operar(ALMACENES.videoTrozos, 'readwrite', (t) =>
      t.objectStore(ALMACENES.videoTrozos)
        .put(new Blob([datos], { type: fichero.type }), `${tiempoId}#${i}`));

    alProgresar(i + 1, totalTrozos);
  }

  return totalTrozos;
}

/** Recompone el vídeo de un tiempo a partir de sus trozos. */
export async function leerVideo(tiempo) {
  const trozos = [];
  for (let i = 0; i < tiempo.totalTrozos; i++) {
    const trozo = await obtener(ALMACENES.videoTrozos, `${tiempo.id}#${i}`);
    if (!trozo) throw new Error(`Falta el trozo ${i} de ${tiempo.totalTrozos}: la copia está incompleta.`);
    trozos.push(trozo);
  }
  return new File(trozos, tiempo.nombreVideo, { type: tiempo.tipoVideo });
}

/** Borra los trozos del vídeo de un tiempo, conservando sus etiquetas. */
export async function borrarVideo(tiempo) {
  for (let i = 0; i < tiempo.totalTrozos; i++) {
    await borrar(ALMACENES.videoTrozos, `${tiempo.id}#${i}`);
  }
}

// --- Borrados en cascada ----------------------------------------------

/** Borra un tiempo con su vídeo y sus intercambios. */
export async function borrarTiempo(tiempo) {
  const intercambios = await listarPor(ALMACENES.intercambios, 'por-tiempo', tiempo.id);
  for (const intercambio of intercambios) {
    await borrar(ALMACENES.intercambios, intercambio.id);
  }
  await borrarVideo(tiempo);
  await borrar(ALMACENES.tiempos, tiempo.id);
}

/** Borra un asalto entero: sus tiempos, sus vídeos y sus etiquetas. */
export async function borrarAsalto(asaltoId) {
  const tiempos = await listarPor(ALMACENES.tiempos, 'por-asalto', asaltoId);
  for (const tiempo of tiempos) {
    await borrarTiempo(tiempo);
  }
  await borrar(ALMACENES.asaltos, asaltoId);
}

/**
 * Borra TODO: perfil, rivales, asaltos, vídeos y etiquetas. No se puede
 * deshacer y no hay copia en ninguna parte.
 *
 * Existe porque desde los ajustes de Android no siempre es evidente cómo
 * vaciar los datos de una aplicación instalada desde el navegador.
 */
export async function borrarTodo() {
  if (conexion) {
    conexion.close();
    conexion = null;
  }

  await new Promise((resolver, rechazar) => {
    const peticion = indexedDB.deleteDatabase(NOMBRE_BD);
    peticion.onsuccess = () => resolver();
    peticion.onerror = () => rechazar(peticion.error);
    // Si otra pestaña tiene la base abierta, el borrado se queda esperando.
    // Seguimos igualmente: se completará al cerrarla.
    peticion.onblocked = () => resolver();
  });
}

// --- Espacio ----------------------------------------------------------

export async function estimarEspacio() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  const persistente = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  return { usado: usage, maximo: quota, persistente };
}

/**
 * Pide al navegador que no borre nuestros datos si le falta espacio.
 * Chrome lo concede cuando la aplicación está instalada en la pantalla de
 * inicio, que es como la van a usar en el club.
 */
export async function pedirPersistencia() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  return navigator.storage.persist();
}
