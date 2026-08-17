// Punto de entrada de Teseo.
//
// Da de alta las pantallas, arranca el service worker y decide qué se ve al
// abrir la aplicación: el formulario de perfil si es la primera vez, y la
// lista de asaltos a partir de entonces.

import { registrar, capturarErroresGlobales } from './registro.js';
import { registrarPantalla, ir } from './ui.js';
import { obtenerPerfilPropio, pedirPersistencia } from './db.js';

import { pantallaPerfil } from './pantallas/perfil.js';
import { pantallaRivales, pantallaRival } from './pantallas/rivales.js';
import { pantallaInicio, pantallaAsaltoNuevo, pantallaAsalto } from './pantallas/asaltos.js';
import { pantallaEtiquetado, soltarReproductor } from './pantallas/etiquetado.js';
import { pantallaMenu, pantallaDiagnostico } from './pantallas/menu.js';

// Sube este número en cada despliegue, y el mismo en sw.js.
const VERSION = 'v7';

capturarErroresGlobales();

// --- Alta de pantallas ------------------------------------------------
// Todas menos la de etiquetado sueltan el vídeo que hubiera cargado, para
// no dejar cientos de megas ocupando memoria al navegar.
const conLimpieza = (dibujar) => (contenedor, datos) => {
  soltarReproductor();
  return dibujar(contenedor, datos);
};

registrarPantalla('perfil', conLimpieza(pantallaPerfil));
registrarPantalla('inicio', conLimpieza(pantallaInicio));
registrarPantalla('menu', conLimpieza(pantallaMenu));
registrarPantalla('diagnostico', conLimpieza(pantallaDiagnostico));
registrarPantalla('rivales', conLimpieza(pantallaRivales));
registrarPantalla('rival', conLimpieza(pantallaRival));
registrarPantalla('asalto-nuevo', conLimpieza(pantallaAsaltoNuevo));
registrarPantalla('asalto', conLimpieza(pantallaAsalto));
registrarPantalla('etiquetado', pantallaEtiquetado);

// --- Arranque ---------------------------------------------------------

async function arrancar() {
  document.getElementById('version').textContent = VERSION;

  registrar(`Teseo ${VERSION} iniciado. Navegador: ${navigator.userAgent}`);
  registrar(window.matchMedia('(display-mode: standalone)').matches
    ? 'Ejecutándose como aplicación instalada.'
    : 'Ejecutándose dentro del navegador.');

  // Pedimos que el navegador no borre los vídeos si le falta espacio. Lo
  // concede sin preguntar cuando la aplicación está instalada.
  const protegido = await pedirPersistencia();
  registrar(`Datos protegidos frente a borrado automático: ${protegido}.`);

  const perfil = await obtenerPerfilPropio();
  await ir(perfil ? 'inicio' : 'perfil');
}

arrancar().catch((error) => {
  registrar(`No se pudo arrancar: ${error.message}`, 'error');
  document.getElementById('pantalla').textContent =
    `No se pudo arrancar Teseo: ${error.message}`;
});

// --- Service worker ---------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then((registro) => registrar(`Service worker registrado (ámbito: ${registro.scope}).`))
    .catch((error) => registrar(`No se pudo registrar el service worker: ${error.message}`, 'error'));
}

// --- Botón de instalar ------------------------------------------------
//
// El botón sólo debe verse mientras Teseo NO esté instalada. Hay tres formas
// de saber que ya lo está, y usamos las tres porque ninguna es infalible:
//
//   1. Se está ejecutando en modo aplicación, sin barra de direcciones.
//   2. El navegador nos dice que hay una versión instalada.
//   3. Nosotros lo anotamos cuando se instaló, y eso sobrevive a cerrarla.
//
// La tercera es la que cubre el caso que se veía: instalarla y luego abrir la
// dirección en el navegador, donde el botón volvía a aparecer.

const btnInstalar = document.getElementById('btn-instalar');
const CLAVE_INSTALADA = 'teseo-instalada';
let avisoDeInstalacion = null;

function enModoAplicacion() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

async function yaEstaInstalada() {
  if (enModoAplicacion()) return true;
  if (localStorage.getItem(CLAVE_INSTALADA) === 'sí') return true;

  if (navigator.getInstalledRelatedApps) {
    try {
      const instaladas = await navigator.getInstalledRelatedApps();
      if (instaladas.length > 0) {
        localStorage.setItem(CLAVE_INSTALADA, 'sí');
        return true;
      }
    } catch { /* si el navegador no colabora, seguimos con lo demás */ }
  }
  return false;
}

window.addEventListener('beforeinstallprompt', async (evento) => {
  // Sin esto, Chrome enseña su propia barrita y no nos deja elegir el momento.
  evento.preventDefault();
  avisoDeInstalacion = evento;
  if (!await yaEstaInstalada()) btnInstalar.hidden = false;
});

btnInstalar.addEventListener('click', async () => {
  if (!avisoDeInstalacion) return;
  avisoDeInstalacion.prompt();
  const { outcome } = await avisoDeInstalacion.userChoice;
  registrar(`Instalación: ${outcome === 'accepted' ? 'aceptada' : 'rechazada'}.`);
  if (outcome === 'accepted') localStorage.setItem(CLAVE_INSTALADA, 'sí');
  avisoDeInstalacion = null;
  btnInstalar.hidden = true;
});

window.addEventListener('appinstalled', () => {
  registrar('Teseo instalada en la pantalla de inicio.');
  localStorage.setItem(CLAVE_INSTALADA, 'sí');
  btnInstalar.hidden = true;
});

// Y por si el aviso del navegador llega antes de que comprobemos nada.
yaEstaInstalada().then((instalada) => {
  if (instalada) btnInstalar.hidden = true;
});
