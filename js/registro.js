// Registro en pantalla.
//
// En el móvil no tenemos consola de desarrollador a mano (en iPhone hace
// falta un Mac y un cable). Así que todo lo que pase se escribe también en
// un recuadro visible dentro de la propia página.

const caja = document.getElementById('registro');

/** Devuelve la hora actual como hh:mm:ss, para ordenar los mensajes. */
function marcaDeTiempo() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

/**
 * Escribe una línea en el registro.
 * @param {string} mensaje
 * @param {'info'|'error'} tipo
 */
export function registrar(mensaje, tipo = 'info') {
  const linea = document.createElement('span');
  linea.textContent = `${marcaDeTiempo()}  ${mensaje}\n`;
  if (tipo === 'error') linea.className = 'error';
  caja.appendChild(linea);
  caja.scrollTop = caja.scrollHeight;

  // Y también a la consola, por si sí la tenemos.
  if (tipo === 'error') console.error(mensaje);
  else console.log(mensaje);
}

/** Convierte un número de bytes a algo legible: "347 MB". */
export function formatearBytes(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes)) return 'desconocido';
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['kB', 'MB', 'GB', 'TB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(valor < 10 ? 1 : 0)} ${unidades[i]}`;
}

/**
 * Rellena una lista de definición (<dl>) con pares etiqueta/valor.
 * @param {HTMLElement} elemento
 * @param {Array<[string, string]>} pares
 */
export function pintarFicha(elemento, pares) {
  elemento.textContent = '';
  for (const [etiqueta, valor] of pares) {
    const dt = document.createElement('dt');
    dt.textContent = etiqueta;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    elemento.append(dt, dd);
  }
}

/** Captura los errores que se escapen, para que queden en el registro. */
export function capturarErroresGlobales() {
  window.addEventListener('error', (evento) => {
    registrar(`ERROR: ${evento.message} (${evento.filename}:${evento.lineno})`, 'error');
  });
  window.addEventListener('unhandledrejection', (evento) => {
    registrar(`ERROR sin capturar: ${evento.reason}`, 'error');
  });
}
