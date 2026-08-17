// Prueba de almacenamiento — SÓLO PARA LA FASE 1.
//
// Sirve para contestar con datos reales, en tu Android y en tu iPhone, a tres
// preguntas de las que depende el diseño de la aplicación:
//
//   1. ¿Cuánto espacio me deja usar este teléfono?
//   2. ¿Puedo guardar una copia del vídeo y volver a reproducirla?
//   3. ¿Sigue ahí la copia después de cerrar la app y reiniciar el móvil?
//
// En la fase 3 este fichero desaparece y su parte útil se integra en db.js.

import { registrar, formatearBytes, pintarFicha } from './registro.js';
import { obtenerFichero, cargarFichero } from './video.js';

const NOMBRE_BD = 'teseo-prueba';
const ALMACEN = 'videos';
const CLAVE = 'prueba';

const fichaEspacio = document.getElementById('ficha-espacio');

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
function operar(almacen, modo, accion) {
  return abrirBD().then((bd) => new Promise((resolver, rechazar) => {
    const transaccion = bd.transaction(almacen, modo);
    const peticion = accion(transaccion.objectStore(almacen));
    transaccion.oncomplete = () => { bd.close(); resolver(peticion?.result); };
    transaccion.onerror = () => { bd.close(); rechazar(transaccion.error); };
    transaccion.onabort = () => { bd.close(); rechazar(transaccion.error); };
  }));
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

/** Guarda una copia del vídeo abierto dentro del almacenamiento del navegador. */
async function guardarCopia() {
  const fichero = obtenerFichero();
  if (!fichero) {
    registrar('Primero abre un vídeo en el paso 1.', 'error');
    return;
  }

  registrar(`Guardando copia de ${formatearBytes(fichero.size)}… (puede tardar)`);
  const empezado = performance.now();

  try {
    await operar(ALMACEN, 'readwrite', (almacen) => almacen.put({
      blob: fichero,
      nombre: fichero.name || '(sin nombre)',
      tamano: fichero.size,
      tipo: fichero.type,
      guardadoEl: new Date().toISOString(),
    }, CLAVE));

    const segundos = ((performance.now() - empezado) / 1000).toFixed(1);
    registrar(`Copia guardada correctamente en ${segundos} s.`);
  } catch (error) {
    // El error típico aquí es QuotaExceededError: no cabe.
    registrar(`No se pudo guardar la copia: ${error.name} — ${error.message}`, 'error');
  }

  await medirEspacio();
}

/** Recupera la copia guardada y la carga en el reproductor. */
async function reabrirCopia() {
  try {
    const registro = await operar(ALMACEN, 'readonly', (almacen) => almacen.get(CLAVE));
    if (!registro) {
      registrar('No hay ninguna copia guardada.', 'error');
      return;
    }

    registrar(`Copia encontrada: ${registro.nombre} · ${formatearBytes(registro.tamano)} · ` +
              `guardada el ${new Date(registro.guardadoEl).toLocaleString('es-ES')}.`);

    // Le devolvemos el nombre original al blob para que la ficha lo muestre.
    const fichero = new File([registro.blob], registro.nombre, { type: registro.tipo });
    cargarFichero(fichero, 'copia guardada');
  } catch (error) {
    registrar(`No se pudo leer la copia: ${error.name} — ${error.message}`, 'error');
  }
}

/** Borra la copia guardada. */
async function borrarCopia() {
  if (!confirm('¿Borrar la copia del vídeo guardada en la aplicación?')) return;
  try {
    await operar(ALMACEN, 'readwrite', (almacen) => almacen.delete(CLAVE));
    registrar('Copia borrada.');
  } catch (error) {
    registrar(`No se pudo borrar: ${error.name} — ${error.message}`, 'error');
  }
  await medirEspacio();
}

/** Al arrancar, mira si quedó una copia de una sesión anterior. */
async function comprobarCopiaPrevia() {
  try {
    const registro = await operar(ALMACEN, 'readonly', (almacen) => almacen.get(CLAVE));
    if (registro) {
      registrar(`HAY una copia de una sesión anterior: ${registro.nombre}, ` +
                `${formatearBytes(registro.tamano)}, guardada el ` +
                `${new Date(registro.guardadoEl).toLocaleString('es-ES')}. ` +
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
  document.getElementById('btn-persistir').addEventListener('click', pedirPersistencia);
  document.getElementById('btn-guardar').addEventListener('click', guardarCopia);
  document.getElementById('btn-reabrir').addEventListener('click', reabrirCopia);
  document.getElementById('btn-borrar').addEventListener('click', borrarCopia);

  medirEspacio();
  comprobarCopiaPrevia();
}
