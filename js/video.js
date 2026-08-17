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

/** Devuelve el fichero de vídeo abierto ahora mismo, o null. */
export function obtenerFichero() {
  return ficheroActual;
}

/** Traduce el código de error del elemento <video> a algo entendible. */
function describirError(error) {
  if (!error) return 'error desconocido';
  switch (error.code) {
    case 1: return 'la carga se canceló';
    case 2: return 'fallo de red al leer el fichero';
    case 3: return 'el vídeo está dañado o el navegador no sabe descodificarlo';
    case 4: return 'formato no soportado por este navegador (típico con vídeos HEVC/H.265 en Chrome de Android)';
    default: return `código ${error.code}`;
  }
}

/** Formatea una duración en segundos. */
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
}

/** Mueve el tiempo del vídeo, sin salirse de los límites. */
function saltar(segundos) {
  if (!video.src) return;
  // Al dar un salto, pausamos: los saltos son para afinar un instante.
  video.pause();

  const maximo = isFinite(video.duration) ? video.duration : Infinity;
  const destino = Math.min(Math.max(0, video.currentTime + segundos), maximo);
  video.currentTime = destino;
  refrescarTiempo();
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
  video.addEventListener('seeked', refrescarTiempo);
  video.addEventListener('timeupdate', refrescarTiempo);

  // --- Botones ---
  btnPlay.addEventListener('click', () => {
    if (video.paused) {
      // play() devuelve una promesa: en iPhone falla si el navegador cree
      // que no ha habido gesto del usuario. Conviene registrarlo.
      video.play().catch((e) => registrar(`El navegador rechazó reproducir: ${e.message}`, 'error'));
    } else {
      video.pause();
    }
  });

  for (const boton of document.querySelectorAll('[data-salto]')) {
    boton.addEventListener('click', () => saltar(parseFloat(boton.dataset.salto)));
  }
}
