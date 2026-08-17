// Registro de lo que va pasando por dentro.
//
// En el móvil no hay consola de desarrollador a mano, así que guardamos aquí
// lo importante y se puede leer y copiar desde Menú → Diagnóstico. Se queda
// en memoria: al cerrar la aplicación desaparece.

const lineas = [];
const MAXIMO = 300;   // no dejamos que crezca sin límite

function marcaDeTiempo() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

/**
 * Anota una línea.
 * @param {string} mensaje
 * @param {'info'|'error'} tipo
 */
export function registrar(mensaje, tipo = 'info') {
  lineas.push(`${marcaDeTiempo()}  ${tipo === 'error' ? '⚠ ' : ''}${mensaje}`);
  if (lineas.length > MAXIMO) lineas.shift();

  if (tipo === 'error') console.error(mensaje);
  else console.log(mensaje);
}

/** Todo el registro como texto, para enseñarlo o copiarlo. */
export function textoDelRegistro() {
  return lineas.join('\n');
}

/** Captura los errores que se escapen, para que queden anotados. */
export function capturarErroresGlobales() {
  window.addEventListener('error', (evento) => {
    registrar(`ERROR: ${evento.message} (${evento.filename}:${evento.lineno})`, 'error');
  });
  window.addEventListener('unhandledrejection', (evento) => {
    registrar(`ERROR sin capturar: ${evento.reason}`, 'error');
  });
}
