// Punto de entrada de Teseo.
//
// En la fase 2 arranca el reproductor, la prueba de almacenamiento y el
// service worker que hace la aplicación instalable. Más adelante, este fichero
// se encargará también de la navegación entre pantallas (perfil, rivales,
// asaltos, etiquetado, estadísticas).

import { registrar, capturarErroresGlobales } from './registro.js';
import { iniciarVideo } from './video.js';
import { iniciarPruebaAlmacenamiento } from './prueba-almacenamiento.js';

// Sube este número en cada despliegue, y el mismo en sw.js. Se muestra en
// pantalla para poder comprobar de un vistazo qué versión tiene el móvil,
// que con las copias guardadas no siempre es evidente.
const VERSION = 'v3';

capturarErroresGlobales();

document.getElementById('version').textContent = `Versión ${VERSION}`;

registrar(`Teseo ${VERSION} iniciado. Navegador: ${navigator.userAgent}`);
registrar(`Pantalla: ${window.innerWidth} × ${window.innerHeight} px, ` +
          `densidad ${window.devicePixelRatio}.`);
registrar(window.matchMedia('(display-mode: standalone)').matches
  ? 'Ejecutándose como aplicación instalada.'
  : 'Ejecutándose dentro del navegador.');

iniciarVideo();
iniciarPruebaAlmacenamiento();

// --- Service worker ---------------------------------------------------
// Es lo que permite instalar la aplicación y que funcione sin cobertura.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then((registro) => {
      registrar(`Service worker registrado (ámbito: ${registro.scope}).`);
    })
    .catch((error) => {
      registrar(`No se pudo registrar el service worker: ${error.message}`, 'error');
    });
} else {
  registrar('Este navegador no soporta service workers: no se podrá instalar.', 'error');
}

// --- Botón de instalar ------------------------------------------------
// Android avisa con este evento cuando considera que la aplicación se puede
// instalar. Guardamos el aviso y lo usamos cuando el usuario pulse el botón.
let avisoDeInstalacion = null;
const btnInstalar = document.getElementById('btn-instalar');

window.addEventListener('beforeinstallprompt', (evento) => {
  // Sin esto, Chrome enseña su propia barrita y no nos deja elegir el momento.
  evento.preventDefault();
  avisoDeInstalacion = evento;
  btnInstalar.hidden = false;
  registrar('El navegador ofrece instalar la aplicación.');
});

btnInstalar.addEventListener('click', async () => {
  if (!avisoDeInstalacion) return;
  avisoDeInstalacion.prompt();
  const { outcome } = await avisoDeInstalacion.userChoice;
  registrar(`Instalación: ${outcome === 'accepted' ? 'aceptada' : 'rechazada'}.`);
  avisoDeInstalacion = null;
  btnInstalar.hidden = true;
});

window.addEventListener('appinstalled', () => {
  registrar('Teseo instalado en la pantalla de inicio.');
  btnInstalar.hidden = true;
});

// --- Registro ---------------------------------------------------------
document.getElementById('btn-copiar-registro').addEventListener('click', async () => {
  const texto = document.getElementById('registro').textContent;
  try {
    await navigator.clipboard.writeText(texto);
    registrar('Registro copiado al portapapeles.');
  } catch {
    // Algunos navegadores bloquean el portapapeles. Plan B: seleccionarlo para
    // que el usuario copie a mano.
    const seleccion = window.getSelection();
    const rango = document.createRange();
    rango.selectNodeContents(document.getElementById('registro'));
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    registrar('No he podido copiar solo. El texto queda seleccionado: cópialo a mano.', 'error');
  }
});
