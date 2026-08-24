// Punto de entrada de Teseo.
//
// Da de alta las pantallas, arranca el service worker y decide qué se ve al
// abrir la aplicación: el formulario de perfil si es la primera vez, y la
// lista de asaltos a partir de entonces.

import { registrar, capturarErroresGlobales } from './registro.js';
import { registrarPantalla, ir, empezarEn, iniciarBotonAtras } from './ui.js';
import { obtenerPerfilPropio, pedirPersistencia } from './db.js';
import { cargarAjustes } from './ajustes.js';
import { cargarPreferencias } from './preferencias.js';
import { iniciarInstalacion } from './instalacion.js';
import { fijarPerfil } from './genero.js';
import { VERSION } from './version.js';

import { pantallaPerfil } from './pantallas/perfil.js';
import { pantallaPerfilRfee } from './pantallas/perfil-rfee.js';
import { pantallaRivales, pantallaListaRivales, pantallaRival } from './pantallas/rivales.js';
import { pantallaInicio, pantallaAsaltoNuevo, pantallaAsalto } from './pantallas/asaltos.js';
import { pantallaEtiquetado, soltarReproductor } from './pantallas/etiquetado.js';
import { pantallaCalibrado } from './pantallas/calibrado.js';
import { pantallaMenu, pantallaConfiguracion } from './pantallas/menu.js';
import { pantallaEstadisticas } from './pantallas/estadisticas.js';
import { pantallaImportarRfee } from './pantallas/importar-rfee.js';
import { pantallaRanking } from './pantallas/ranking.js';
import { pantallaAyuda } from './pantallas/ayuda.js';
import { pantallaPreparar } from './pantallas/preparar.js';
import {
  pantallaCompeticiones, pantallaListaCompeticiones, pantallaCompeticion,
  pantallaImportarCompeticiones,
} from './pantallas/competiciones.js';


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
registrarPantalla('perfil-rfee', conLimpieza(pantallaPerfilRfee));
registrarPantalla('inicio', conLimpieza(pantallaInicio));
registrarPantalla('menu', conLimpieza(pantallaMenu));
registrarPantalla('configuracion', conLimpieza(pantallaConfiguracion));
registrarPantalla('estadisticas', conLimpieza(pantallaEstadisticas));
registrarPantalla('ayuda', conLimpieza(pantallaAyuda));
registrarPantalla('preparar', conLimpieza(pantallaPreparar));
registrarPantalla('rivales', conLimpieza(pantallaRivales));
registrarPantalla('lista-rivales', conLimpieza(pantallaListaRivales));
registrarPantalla('rival', conLimpieza(pantallaRival));
registrarPantalla('importar-rfee', conLimpieza(pantallaImportarRfee));
registrarPantalla('ranking', conLimpieza(pantallaRanking));
registrarPantalla('competiciones', conLimpieza(pantallaCompeticiones));
registrarPantalla('lista-competiciones', conLimpieza(pantallaListaCompeticiones));
registrarPantalla('competicion', conLimpieza(pantallaCompeticion));
registrarPantalla('importar-competiciones', conLimpieza(pantallaImportarCompeticiones));
registrarPantalla('asalto-nuevo', conLimpieza(pantallaAsaltoNuevo));
registrarPantalla('asalto', conLimpieza(pantallaAsalto));
registrarPantalla('etiquetado', pantallaEtiquetado);
registrarPantalla('calibrado', conLimpieza(pantallaCalibrado));

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

  // Los ajustes avanzados se leen una vez y se quedan en memoria: las
  // pantallas los consultan mientras pintan y no pueden esperar a la base.
  await cargarAjustes();

  // Y si el usuario apagó los textos de ayuda, que arranque ya sin ellos: si
  // se leyera después, la primera pantalla saldría con toda la prosa y se
  // quedaría a medio pintar al quitarla.
  await cargarPreferencias();

  const perfil = await obtenerPerfilPropio();

  // De aqui salen las palabras que cambian (Diestra o Diestro) y los
  // rankings que se pueden importar.
  fijarPerfil(perfil);

  // El boton de retroceso de Android hace de "Volver" en todas las
  // pantallas, y solo sale de la aplicacion desde la de inicio.
  iniciarBotonAtras();
  await empezarEn(perfil ? 'inicio' : 'perfil');
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
