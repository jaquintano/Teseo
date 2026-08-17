// Prueba de almacenamiento — SÓLO PARA LA FASE 1.
//
// Sirve para contestar con datos reales, en tu Android y en tu iPhone, a estas
// preguntas, de las que depende el diseño de la aplicación:
//
//   1. ¿Cuánto espacio me deja usar este teléfono?
//   2. ¿Cuánto tiempo sigue siendo legible el fichero que da la galería?
//   3. ¿Puedo guardar una copia del vídeo y volver a reproducirla?
//   4. ¿Sigue ahí la copia después de cerrar la app y reiniciar el móvil?
//
// La copia se guarda TROCEADA. Dos razones:
//   - Leer el fichero en trozos de 8 MB nos dice exactamente en qué punto
//     falla, si falla.
//   - Cada trozo se copia a memoria y se vuelve a envolver en un blob nuevo,
//     que ya no depende del fichero de la galería. Ese es el fallo que dio la
//     primera prueba: al guardar el fichero tal cual, el navegador intenta
//     leerlo en ese momento, y si el sistema ya le ha retirado el acceso,
//     revienta con "InvalidBlob".
//
// En la fase 3 este fichero desaparece y su parte útil se integra en db.js.

import { registrar, formatearBytes, pintarFicha } from './registro.js';
import { obtenerFichero, cargarFichero, alAbrirVideo } from './video.js';

const NOMBRE_BD = 'teseo-prueba';
const ALMACEN = 'videos';
const TAMANO_TROZO = 8 * 1024 * 1024;   // 8 MB

const fichaEspacio = document.getElementById('ficha-espacio');
const progreso = document.getElementById('progreso');

/** Abre (y crea si hace falta) la base de datos local. */
function abrirBD() {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, 1);
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore(ALMACEN);
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

/** Envuelve una operación de IndexedDB en una promesa. */
function operar(modo, accion) {
  return abrirBD().then((bd) => new Promise((resolver, rechazar) => {
    const transaccion = bd.transaction(ALMACEN, modo);
    const peticion = accion(transaccion.objectStore(ALMACEN));
    transaccion.oncomplete = () => { bd.close(); resolver(peticion?.result); };
    transaccion.onerror = () => { bd.close(); rechazar(transaccion.error); };
    transaccion.onabort = () => { bd.close(); rechazar(transaccion.error); };
  }));
}

function mostrarProgreso(texto) {
  progreso.textContent = texto;
}

/** Pregunta al navegador cuánto espacio hay usado y disponible. */
async function medirEspacio() {
  if (!navigator.storage || !navigator.storage.estimate) {
    pintarFicha(fichaEspacio, [['Espacio', 'este navegador no lo dice']]);
    registrar('Este navegador no soporta navigator.storage.estimate().', 'error');
    return;
  }

  const { usage, quota } = await navigator.storage.estimate();
  const persistente = navigator.storage.persisted
    ? await navigator.storage.persisted()
    : null;

  pintarFicha(fichaEspacio, [
    ['Usado por Teseo', formatearBytes(usage)],
    ['Máximo concedido', formatearBytes(quota)],
    ['Almacenamiento persistente', persistente === null ? 'no consultable' : (persistente ? 'sí' : 'no')],
  ]);

  registrar(`Espacio: ${formatearBytes(usage)} usados de ${formatearBytes(quota)} concedidos. ` +
            `Persistente: ${persistente === null ? 'no consultable' : persistente}.`);
}

/**
 * Pide al navegador que no borre nuestros datos cuando falte espacio.
 * Chrome suele concederlo si la app está instalada en la pantalla de inicio.
 * Safari de iPhone no soporta esta petición.
 */
async function pedirPersistencia() {
  if (!navigator.storage || !navigator.storage.persist) {
    registrar('Este navegador no permite pedir almacenamiento persistente ' +
              '(es el caso de Safari en iPhone).', 'error');
    return;
  }
  const concedido = await navigator.storage.persist();
  registrar(concedido
    ? 'Concedido: el navegador se compromete a no borrar los datos por falta de espacio.'
    : 'Denegado: el navegador podrá borrar los datos si necesita espacio.');
  await medirEspacio();
}

/**
 * Comprueba si el fichero de la galería sigue siendo legible, leyendo unos
 * pocos bytes del principio y del final. Es la prueba que nos dice si el
 * sistema le ha retirado el acceso a la aplicación.
 */
async function comprobarLegible() {
  const fichero = obtenerFichero();
  if (!fichero) {
    registrar('No hay ningún vídeo abierto.', 'error');
    return false;
  }

  const muestra = 64 * 1024;
  try {
    await fichero.slice(0, muestra).arrayBuffer();
    await fichero.slice(Math.max(0, fichero.size - muestra)).arrayBuffer();
    registrar('El fichero es legible: se han podido leer bytes del principio y del final.');
    return true;
  } catch (error) {
    registrar(`NO se puede leer el fichero: ${error.name} — ${error.message}`, 'error');
    registrar('Causa más probable: ese vídeo no está guardado entero en el móvil. ' +
              'Google Fotos conserva la ficha y la miniatura, pero los bytes están ' +
              'en la nube. Descárgalo al teléfono y vuelve a intentarlo, o elige el ' +
              'vídeo desde "Archivos" en vez de desde "Fotos".', 'error');
    return false;
  }
}

/**
 * Lee un trozo del fichero, reintentando si falla. Si el vídeo viene de la
 * nube, un fallo puede ser un tropiezo pasajero de la conexión.
 */
async function leerTrozo(fichero, desde, hasta, intentos = 3) {
  for (let intento = 1; ; intento++) {
    try {
      return await fichero.slice(desde, hasta).arrayBuffer();
    } catch (error) {
      if (intento >= intentos) throw error;
      registrar(`Fallo leyendo los bytes ${desde}–${hasta} (intento ${intento} de ` +
                `${intentos}): ${error.name}. Reintento…`);
      await new Promise((seguir) => setTimeout(seguir, 400 * intento));
    }
  }
}

/** Borra todo lo guardado, sin preguntar. Uso interno. */
function vaciarAlmacen() {
  return operar('readwrite', (almacen) => almacen.clear());
}

/**
 * Guarda una copia del vídeo abierto, troceada, dentro del almacenamiento
 * del navegador.
 */
async function guardarCopia() {
  const fichero = obtenerFichero();
  if (!fichero) {
    registrar('Primero abre un vídeo en el paso 1.', 'error');
    return false;
  }

  // Antes de lanzarnos a copiar 20 trozos, comprobamos que el fichero se deja
  // leer. Si el vídeo está en la nube y no en el móvil, esto lo detecta ya y
  // le damos al usuario un mensaje que se entienda.
  if (!await comprobarLegible()) {
    mostrarProgreso('No se puede leer este vídeo.');
    return false;
  }

  const totalTrozos = Math.ceil(fichero.size / TAMANO_TROZO);
  registrar(`Guardando copia de ${formatearBytes(fichero.size)} en ${totalTrozos} trozos…`);
  const empezado = performance.now();
  let trozoEnCurso = 0;

  try {
    await vaciarAlmacen();

    for (let i = 0; i < totalTrozos; i++) {
      trozoEnCurso = i;
      const desde = i * TAMANO_TROZO;
      const hasta = Math.min(desde + TAMANO_TROZO, fichero.size);

      const datos = await leerTrozo(fichero, desde, hasta);

      // Envolvemos los bytes en un blob nuevo, ya independiente del fichero
      // original de la galería.
      await operar('readwrite', (almacen) =>
        almacen.put(new Blob([datos], { type: fichero.type }), `trozo-${i}`));

      mostrarProgreso(`Guardando… ${i + 1} de ${totalTrozos} ` +
                      `(${Math.round(((i + 1) / totalTrozos) * 100)} %)`);
    }

    await operar('readwrite', (almacen) => almacen.put({
      nombre: fichero.name || '(sin nombre)',
      tamano: fichero.size,
      tipo: fichero.type,
      totalTrozos,
      guardadoEl: new Date().toISOString(),
    }, 'meta'));

    const segundos = ((performance.now() - empezado) / 1000).toFixed(1);
    const velocidad = (fichero.size / 1024 / 1024 / (segundos || 1)).toFixed(0);
    registrar(`Copia guardada correctamente en ${segundos} s (${velocidad} MB/s).`);
    mostrarProgreso('Copia guardada.');
    await medirEspacio();
    return true;

  } catch (error) {
    registrar(`Falló al guardar en el trozo ${trozoEnCurso + 1} de ${totalTrozos} ` +
              `(bytes ${trozoEnCurso * TAMANO_TROZO} en adelante): ` +
              `${error.name} — ${error.message}`, 'error');
    mostrarProgreso(`Falló en el trozo ${trozoEnCurso + 1} de ${totalTrozos}.`);
    // Si se queda a medias, la copia no sirve: la borramos.
    try { await vaciarAlmacen(); } catch { /* da igual */ }
    await medirEspacio();
    return false;
  }
}

/** Recupera la copia guardada y la carga en el reproductor. */
async function reabrirCopia() {
  try {
    const meta = await operar('readonly', (almacen) => almacen.get('meta'));
    if (!meta) {
      registrar('No hay ninguna copia guardada.', 'error');
      return;
    }

    registrar(`Copia encontrada: ${meta.nombre} · ${formatearBytes(meta.tamano)} · ` +
              `${meta.totalTrozos} trozos · guardada el ` +
              `${new Date(meta.guardadoEl).toLocaleString('es-ES')}.`);

    const trozos = [];
    for (let i = 0; i < meta.totalTrozos; i++) {
      const trozo = await operar('readonly', (almacen) => almacen.get(`trozo-${i}`));
      if (!trozo) {
        registrar(`Falta el trozo ${i}: la copia está incompleta.`, 'error');
        return;
      }
      trozos.push(trozo);
      mostrarProgreso(`Recomponiendo… ${i + 1} de ${meta.totalTrozos}`);
    }

    mostrarProgreso('');
    const fichero = new File(trozos, meta.nombre, { type: meta.tipo });
    cargarFichero(fichero, 'copia guardada');

  } catch (error) {
    registrar(`No se pudo leer la copia: ${error.name} — ${error.message}`, 'error');
  }
}

/** Borra la copia guardada. */
async function borrarCopia() {
  if (!confirm('¿Borrar la copia del vídeo guardada en la aplicación?')) return;
  try {
    await vaciarAlmacen();
    registrar('Copia borrada.');
    mostrarProgreso('');
  } catch (error) {
    registrar(`No se pudo borrar: ${error.name} — ${error.message}`, 'error');
  }
  await medirEspacio();
}

/** Al arrancar, mira si quedó una copia de una sesión anterior. */
async function comprobarCopiaPrevia() {
  try {
    const meta = await operar('readonly', (almacen) => almacen.get('meta'));
    if (meta) {
      registrar(`HAY una copia de una sesión anterior: ${meta.nombre}, ` +
                `${formatearBytes(meta.tamano)}, guardada el ` +
                `${new Date(meta.guardadoEl).toLocaleString('es-ES')}. ` +
                `Pulsa "Reabrir copia guardada" para comprobar que se reproduce.`);
    } else {
      registrar('No hay ninguna copia guardada de sesiones anteriores.');
    }
  } catch (error) {
    registrar(`No se pudo consultar el almacenamiento: ${error.message}`, 'error');
  }
}

export function iniciarPruebaAlmacenamiento() {
  document.getElementById('btn-espacio').addEventListener('click', medirEspacio);
  document.getElementById('btn-legible').addEventListener('click', () => comprobarLegible());
  document.getElementById('btn-persistir').addEventListener('click', pedirPersistencia);
  document.getElementById('btn-guardar').addEventListener('click', guardarCopia);
  document.getElementById('btn-reabrir').addEventListener('click', reabrirCopia);
  document.getElementById('btn-borrar').addEventListener('click', borrarCopia);

  // Nada más abrir un vídeo de la galería, lo copiamos: así la aplicación deja
  // de depender del fichero original cuanto antes. Si lo que se ha abierto es
  // ya la copia guardada, no hay nada que hacer.
  alAbrirVideo(async (fichero, procedencia) => {
    if (procedencia !== 'galería') return;
    await guardarCopia();
  });

  medirEspacio();
  comprobarCopiaPrevia();
}
