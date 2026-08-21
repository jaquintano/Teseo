// Service worker de Teseo.
//
// Un service worker es un pequeño programa que el navegador guarda aparte de
// la página y que se pone en medio de todas las peticiones de la aplicación.
// Sirve para dos cosas aquí:
//
//   1. Que Teseo se pueda instalar en la pantalla de inicio. Android lo exige.
//   2. Que funcione sin cobertura: la sala de armas puede no tener wifi.
//
// OJO: esto NO tiene nada que ver con dónde se guardan los vídeos ni las
// etiquetas. Aquí sólo se guarda la propia aplicación: el HTML, el CSS y el
// JavaScript. Son unas pocas decenas de kilobytes.

// Al cambiar este número, el navegador tira la copia vieja y guarda la nueva.
// Hay que subirlo en cada despliegue, y el mismo en js/app.js.
const VERSION = 'teseo-v30';

// Los ficheros que forman la aplicación.
const FICHEROS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './js/app.js',
  './js/calculo-estadisticas.js',
  './js/competiciones.js',
  './js/constantes.js',
  './js/db.js',
  './js/genero.js',
  './js/instalacion.js',
  './js/rfee.js',
  './js/registro.js',
  './js/tanteo.js',
  './js/version.js',
  './js/ui.js',
  './js/video.js',
  './js/pantallas/asaltos.js',
  './js/pantallas/competiciones.js',
  './js/pantallas/ayuda.js',
  './js/pantallas/estadisticas.js',
  './js/pantallas/etiquetado.js',
  './js/pantallas/ficha-tirador.js',
  './js/pantallas/importar-rfee.js',
  './js/pantallas/menu.js',
  './js/pantallas/preparar.js',
  './js/pantallas/perfil.js',
  './js/pantallas/perfil-rfee.js',
  './js/pantallas/rivales.js',
  './iconos/icon-192.png',
  './iconos/icon-512.png',
  './iconos/icon-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/logo-teseo.jpg',
  './datos/rankings.json',
  './datos/competiciones.json',
];

// --- Instalación: guardar una copia de la aplicación ---
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      .then((almacen) => almacen.addAll(FICHEROS))
      // No esperar a que se cierren las pestañas viejas para activarse.
      .then(() => self.skipWaiting())
  );
});

// --- Activación: borrar las copias de versiones anteriores ---
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((nombre) => nombre !== VERSION).map((nombre) => caches.delete(nombre))
      ))
      .then(() => self.clients.claim())
  );
});

// --- Peticiones: primero la red, y si no hay, la copia guardada ---
//
// Se hace en este orden, y no al revés, porque mientras estamos desarrollando
// interesa que el móvil vea siempre la última versión. Los ficheros son
// diminutos, así que pedirlos a la red no se nota. Cuando la aplicación esté
// terminada convendrá darle la vuelta para que arranque más rápido.
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Sólo nos metemos con nuestras propias peticiones de lectura.
  if (peticion.method !== 'GET' || !peticion.url.startsWith(self.registration.scope)) {
    return;
  }

  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        // Guardamos una copia fresca para la próxima vez que no haya red.
        const copia = respuesta.clone();
        caches.open(VERSION).then((almacen) => almacen.put(peticion, copia));
        return respuesta;
      })
      .catch(() => caches.match(peticion).then(
        (guardada) => guardada || caches.match('./index.html')
      ))
  );
});
