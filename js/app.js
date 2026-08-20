// Punto de entrada de Teseo.
//
// Da de alta las pantallas, arranca el service worker y decide qué se ve al
// abrir la aplicación: el formulario de perfil si es la primera vez, y la
// lista de asaltos a partir de entonces.

import { registrar, capturarErroresGlobales } from './registro.js';
import { registrarPantalla, ir } from './ui.js';
import { obtenerPerfilPropio, pedirPersistencia } from './db.js';
import { iniciarInstalacion } from './instalacion.js';

import { pantallaPerfil } from './pantallas/perfil.js';
import { pantallaRivales, pantallaRival } from './pantallas/rivales.js';
import { pantallaInicio, pantallaAsaltoNuevo, pantallaAsalto } from './pantallas/asaltos.js';
import { pantallaEtiquetado, soltarReproductor } from './pantallas/etiquetado.js';
import { pantallaMenu, pantallaDiagnostico } from './pantallas/menu.js';
import { pantallaEstadisticas } from './pantallas/estadisticas.js';
import { pantallaImportarRfee } from './pantallas/importar-rfee.js';

// Sube este número en cada despliegue, y el mismo en sw.js.
const VERSION = 'v14';

// No hay pantalla de arranque propia: la que pinta Android al abrir la
// aplicación, hecha con el icono y el background_color del manifiesto, ya
// hace ese papel. Añadir otra encima sólo producía un salto entre las dos.

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
registrarPantalla('estadisticas', conLimpieza(pantallaEstadisticas));
registrarPantalla('rivales', conLimpieza(pantallaRivales));
registrarPantalla('rival', conLimpieza(pantallaRival));
registrarPantalla('importar-rfee', conLimpieza(pantallaImportarRfee));
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

// La opción de instalar vive ahora en el menú, no en la cabecera.
iniciarInstalacion();
