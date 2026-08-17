// Reproductor de vídeo.
//
// Todo el trato con el elemento <video> vive aquí. En fases posteriores la
// pantalla de etiquetado usará estas mismas funciones.
//
// Nota importante sobre el tiempo: trabajamos SIEMPRE con currentTime en
// segundos decimales, nunca con número de fotograma. Los vídeos de móvil
// vienen a fps variable y el navegador no garantiza precisión de fotograma.

import { registrar, formatearBytes, pintarFicha } from './registro.js';

const video = document.getElementById('video');
const entrada = document.getElementById('selector-video');
const marcador = document.getElementById('tiempo');
const btnPlay = document.getElementById('btn-play');
const zonaReproductor = document.getElementById('zona-reproductor');
const zonaFicha = document.getElementById('zona-ficha');
const fichaVideo = document.getElementById('ficha-video');

// El fichero que el usuario ha elegido, para poder guardarlo después.
let ficheroActual = null;
// La URL temporal que apunta al fichero. Hay que liberarla al cambiar de
// vídeo o el navegador se queda con la memoria reservada.
let urlActual = null;

// play() devuelve una promesa que tarda en cumplirse. Si llamamos a pause()
// mientras esa promesa está en el aire, el navegador cancela la reproducción
// y suelta el error "The play() request was interrupted by a call to
// pause()". Guardamos la promesa para no pisarla nunca.
let promesaDeReproduccion = null;

// Los saltos de tiempo se acumulan en vez de pisarse: si tocas +0,1 s cinco
// veces seguidas mientras el vídeo aún está buscando el fotograma anterior,
// el destino se suma y se aplica una sola vez.
let destinoPendiente = null;

// A quién avisar cuando se abre un vídeo nuevo.
const suscriptores = [];

/** Devuelve el fichero de vídeo abierto ahora mismo, o null. */
export function obtenerFichero() {
  return ficheroActual;
}

/** Registra una función que se llamará cada vez que se abra un vídeo. */
export function alAbrirVideo(funcion) {
  suscriptores.push(funcion);
}

/** Traduce el código de error del elemento <video> a algo entendible. */
function describirError(error) {
  if (!error) return 'error desconocido';
  switch (error.code) {
    case 1: return 'la carga se canceló';
    case 2: return 'no se pudieron leer los bytes del fichero (suele pasar cuando el vídeo está en Google Fotos y no guardado entero en el móvil)';
    case 3: return 'el vídeo está dañado o el navegador no sabe descodificarlo';
    case 4: return 'formato no soportado por este navegador (típico con vídeos HEVC/H.265 en Chrome de Android)';
    default: return `código ${error.code}`;
  }
}

/** Formatea una duración en segundos como m:ss.cc */
function formatearDuracion(segundos) {
  if (!isFinite(segundos)) return '—';
  const minutos = Math.floor(segundos / 60);
  const resto = segundos - minutos * 60;
  return `${minutos}:${resto.toFixed(2).padStart(5, '0')}`;
}

/** Refresca el marcador de tiempo de la pantalla. */
function refrescarTiempo() {
  const duracion = isFinite(video.duration) ? video.duration.toFixed(2) : '—';
  marcador.textContent = `${video.currentTime.toFixed(2)} s / ${duracion} s`;
}

// Mientras el vídeo corre, el evento timeupdate sólo salta unas 4 veces por
// segundo: demasiado poco para ver el tiempo moverse con dos decimales. Así
// que durante la reproducción refrescamos en cada fotograma de pantalla.
function bucleDeTiempo() {
  if (video.paused || video.ended) return;
  refrescarTiempo();
  requestAnimationFrame(bucleDeTiempo);
}

/**
 * Carga un fichero o blob de vídeo en el reproductor.
 * @param {File|Blob} fichero
 * @param {string} procedencia texto para el registro ("galería", "copia guardada"...)
 */
export function cargarFichero(fichero, procedencia = 'galería') {
  if (urlActual) URL.revokeObjectURL(urlActual);

  ficheroActual = fichero;
  urlActual = URL.createObjectURL(fichero);
  video.src = urlActual;
  video.load();

  zonaReproductor.hidden = false;
  zonaFicha.hidden = false;

  registrar(`Vídeo cargado desde ${procedencia}: ${fichero.name || '(sin nombre)'} · ` +
            `${formatearBytes(fichero.size)} · tipo declarado "${fichero.type || 'desconocido'}"`);

  pintarFicha(fichaVideo, [
    ['Nombre', fichero.name || '(sin nombre)'],
    ['Tamaño', formatearBytes(fichero.size)],
    ['Tipo', fichero.type || 'desconocido'],
    ['Duración', 'leyendo…'],
    ['Resolución', 'leyendo…'],
  ]);

  for (const funcion of suscriptores) funcion(fichero, procedencia);
}

/**
 * Pausa el vídeo sin cancelar una reproducción que aún esté arrancando.
 */
async function pausarConSeguridad() {
  if (promesaDeReproduccion) {
    try { await promesaDeReproduccion; } catch { /* ya se informó del fallo */ }
  }
  if (!video.paused) video.pause();
}

/** Aplica el salto acumulado, si el vídeo no está ya buscando. */
function aplicarSalto() {
  if (destinoPendiente === null || video.seeking) return;
  const destino = destinoPendiente;
  destinoPendiente = null;
  video.currentTime = destino;
}

/** Mueve el tiempo del vídeo, sin salirse de los límites. */
async function saltar(segundos) {
  if (!video.src) return;

  // Al dar un salto pausamos: los saltos son para afinar un instante.
  await pausarConSeguridad();

  const maximo = isFinite(video.duration) ? video.duration : Infinity;
  // Si ya hay un salto esperando, partimos de él y no del tiempo actual;
  // así cinco toques seguidos suman cinco saltos.
  const base = destinoPendiente ?? video.currentTime;
  destinoPendiente = Math.min(Math.max(0, base + segundos), maximo);

  // Pintamos el destino ya, aunque la imagen tarde un poco en llegar.
  marcador.textContent = `${destinoPendiente.toFixed(2)} s / ` +
    `${isFinite(video.duration) ? video.duration.toFixed(2) : '—'} s`;

  aplicarSalto();
}

/** Reproduce o pausa, según el estado. */
async function alternarReproduccion() {
  if (!video.src) return;

  if (video.paused) {
    try {
      promesaDeReproduccion = video.play();
      await promesaDeReproduccion;
    } catch (error) {
      registrar(`El navegador rechazó reproducir: ${error.name} — ${error.message}`, 'error');
    } finally {
      promesaDeReproduccion = null;
    }
  } else {
    await pausarConSeguridad();
  }
}

export function iniciarVideo() {
  // --- Elegir fichero ---
  entrada.addEventListener('change', () => {
    const fichero = entrada.files && entrada.files[0];
    if (!fichero) {
      registrar('No se seleccionó ningún fichero.');
      return;
    }
    cargarFichero(fichero, 'galería');
  });

  // --- Sucesos del elemento <video> ---
  video.addEventListener('loadedmetadata', () => {
    refrescarTiempo();

    const resolucion = video.videoWidth
      ? `${video.videoWidth} × ${video.videoHeight}`
      : 'sin imagen';

    pintarFicha(fichaVideo, [
      ['Nombre', ficheroActual?.name || '(sin nombre)'],
      ['Tamaño', formatearBytes(ficheroActual?.size)],
      ['Tipo', ficheroActual?.type || 'desconocido'],
      ['Duración', `${formatearDuracion(video.duration)} (${isFinite(video.duration) ? video.duration.toFixed(3) + ' s' : 'desconocida'})`],
      ['Resolución', resolucion],
    ]);

    registrar(`Metadatos leídos: duración ${isFinite(video.duration) ? video.duration.toFixed(3) + ' s' : 'desconocida'}, resolución ${resolucion}.`);

    // Caso a vigilar: el navegador acepta el fichero y lee el audio, pero no
    // sabe descodificar la imagen. No da error, simplemente no se ve nada.
    if (!video.videoWidth) {
      registrar('AVISO: el navegador no ha encontrado imagen en este vídeo. ' +
                'Probablemente no sabe descodificar el formato (¿HEVC/H.265?).', 'error');
    }
  });

  video.addEventListener('error', () => {
    registrar(`No se pudo abrir el vídeo: ${describirError(video.error)}.`, 'error');
  });

  video.addEventListener('play', () => {
    btnPlay.textContent = 'Pausa';
    bucleDeTiempo();
  });

  video.addEventListener('pause', () => {
    btnPlay.textContent = 'Reproducir';
    refrescarTiempo();
  });

  // Tras un salto, el tiempo real puede no ser exactamente el pedido:
  // el navegador ajusta al fotograma más cercano que sabe mostrar.
  video.addEventListener('seeked', () => {
    refrescarTiempo();
    aplicarSalto();   // por si llegaron más toques mientras buscaba
  });
  video.addEventListener('timeupdate', refrescarTiempo);

  // Estos avisan de que el vídeo se ha quedado esperando datos. Si el
  // reproductor se congela, aquí veremos por qué.
  video.addEventListener('waiting', () => registrar('El vídeo espera datos (waiting).'));
  video.addEventListener('stalled', () => registrar('El vídeo no recibe datos (stalled).', 'error'));
  video.addEventListener('playing', () => registrar('Reproduciendo.'));

  // Una pulsación larga sobre el vídeo saca el menú de "descargar vídeo",
  // que aquí sólo estorba.
  video.addEventListener('contextmenu', (evento) => evento.preventDefault());

  // --- Botones ---
  btnPlay.addEventListener('click', alternarReproduccion);

  for (const boton of document.querySelectorAll('[data-salto]')) {
    boton.addEventListener('click', () => saltar(parseFloat(boton.dataset.salto)));
  }
}
