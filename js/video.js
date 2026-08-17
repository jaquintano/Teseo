// El reproductor de vídeo, como pieza reutilizable.
//
// Nota importante sobre el tiempo: trabajamos SIEMPRE con currentTime en
// segundos decimales, nunca con número de fotograma. Los vídeos de móvil
// vienen a fps variable y el navegador no garantiza precisión de fotograma.
//
// El vídeo va sin los controles del navegador: en vertical, su barra tapaba
// casi toda la imagen justo cuando hay que mirar el tocado. Se maneja con
// los botones de aquí abajo.

import { crear } from './ui.js';

const SALTOS = [
  { segundos: -1, etiqueta: '−1 s' },
  { segundos: -0.1, etiqueta: '−0,1 s' },
  { segundos: 0.1, etiqueta: '+0,1 s' },
  { segundos: 1, etiqueta: '+1 s' },
];

/**
 * Crea un reproductor.
 * @param {{ alCambiarTiempo?: (segundos:number) => void }} opciones
 */
export function crearReproductor(opciones = {}) {
  const video = crear('video', {
    playsinline: true,
    preload: 'metadata',
    disablepictureinpicture: true,
    disableremoteplayback: true,
  });

  const marcador = crear('p', { class: 'tiempo', texto: '0.00 s / — s' });
  const btnPlay = crear('button', {
    type: 'button', class: 'boton boton-principal', texto: 'Reproducir',
  });

  // play() devuelve una promesa que tarda en cumplirse. Si llamamos a pause()
  // mientras está en el aire, el navegador cancela la reproducción y suelta
  // "The play() request was interrupted by a call to pause()". Por eso la
  // guardamos y la esperamos antes de pausar.
  let promesaDeReproduccion = null;

  // Los saltos se acumulan en vez de pisarse: si tocas +0,1 s cinco veces
  // seguidas mientras el vídeo aún busca el fotograma anterior, el destino se
  // suma y se aplica una sola vez.
  let destinoPendiente = null;

  let urlActual = null;

  function refrescar() {
    const duracion = isFinite(video.duration) ? video.duration.toFixed(2) : '—';
    marcador.textContent = `${video.currentTime.toFixed(2)} s / ${duracion} s`;
    if (opciones.alCambiarTiempo) opciones.alCambiarTiempo(video.currentTime);
  }

  // timeupdate sólo salta unas 4 veces por segundo, poco para ver dos
  // decimales moverse. Mientras corre, refrescamos en cada fotograma.
  function bucle() {
    if (video.paused || video.ended) return;
    refrescar();
    requestAnimationFrame(bucle);
  }

  async function pausarConSeguridad() {
    if (promesaDeReproduccion) {
      try { await promesaDeReproduccion; } catch { /* ya se informó */ }
    }
    if (!video.paused) video.pause();
  }

  function aplicarSalto() {
    if (destinoPendiente === null || video.seeking) return;
    const destino = destinoPendiente;
    destinoPendiente = null;
    video.currentTime = destino;
  }

  async function saltar(segundos) {
    if (!video.src) return;
    await pausarConSeguridad();

    const maximo = isFinite(video.duration) ? video.duration : Infinity;
    const base = destinoPendiente ?? video.currentTime;
    destinoPendiente = Math.min(Math.max(0, base + segundos), maximo);

    // Pintamos el destino ya, aunque la imagen tarde un poco en llegar.
    marcador.textContent = `${destinoPendiente.toFixed(2)} s / ` +
      `${isFinite(video.duration) ? video.duration.toFixed(2) : '—'} s`;

    aplicarSalto();
  }

  async function alternar() {
    if (!video.src) return;
    if (video.paused) {
      try {
        promesaDeReproduccion = video.play();
        await promesaDeReproduccion;
      } catch (error) {
        console.error('El navegador rechazó reproducir:', error);
      } finally {
        promesaDeReproduccion = null;
      }
    } else {
      await pausarConSeguridad();
    }
  }

  video.addEventListener('loadedmetadata', refrescar);
  video.addEventListener('seeked', () => { refrescar(); aplicarSalto(); });
  video.addEventListener('timeupdate', refrescar);
  video.addEventListener('play', () => { btnPlay.textContent = 'Pausa'; bucle(); });
  video.addEventListener('pause', () => { btnPlay.textContent = 'Reproducir'; refrescar(); });
  // Una pulsación larga sacaba el menú de "descargar vídeo".
  video.addEventListener('contextmenu', (evento) => evento.preventDefault());

  btnPlay.addEventListener('click', alternar);

  const rejilla = crear('div', { class: 'rejilla-saltos' },
    SALTOS.map((salto) => crear('button', {
      type: 'button', class: 'boton', texto: salto.etiqueta,
      onclick: () => saltar(salto.segundos),
    })));

  const elemento = crear('div', { class: 'reproductor' }, [
    video, marcador, btnPlay, rejilla,
  ]);

  return {
    elemento,
    video,

    /** Carga un fichero de vídeo. */
    cargar(fichero) {
      if (urlActual) URL.revokeObjectURL(urlActual);
      urlActual = URL.createObjectURL(fichero);
      video.src = urlActual;
      video.load();
    },

    /** Coloca el vídeo en un instante concreto, en segundos. */
    irA(segundos) {
      pausarConSeguridad().then(() => {
        destinoPendiente = segundos;
        aplicarSalto();
      });
    },

    tiempoActual() {
      return video.currentTime;
    },

    pausar: pausarConSeguridad,

    /** Suelta la memoria del vídeo al salir de la pantalla. */
    destruir() {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (urlActual) URL.revokeObjectURL(urlActual);
      urlActual = null;
    },
  };
}
