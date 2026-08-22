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

  // El reloj a la izquierda; a la derecha, lo que quiera colgar quien use el
  // reproductor. El vídeo no sabe de esgrima: se limita a hacerle sitio.
  const reloj = crear('span', { class: 'reloj', texto: '0.00 s / — s' });
  const filaDeTiempo = crear('p', { class: 'tiempo' }, [reloj, opciones.juntoAlTiempo]);
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

  // Hasta dónde hay que dejar correr el vídeo antes de pararlo solo, o null
  // si va suelto. Se usa al tocar un intercambio: se ve el trozo y para.
  let paradaAutomatica = null;

  function refrescar() {
    const duracion = isFinite(video.duration) ? video.duration.toFixed(2) : '—';
    reloj.textContent = `${video.currentTime.toFixed(2)} s / ${duracion} s`;
    if (opciones.alCambiarTiempo) opciones.alCambiarTiempo(video.currentTime);
  }

  // timeupdate sólo salta unas 4 veces por segundo, poco para ver dos
  // decimales moverse. Mientras corre, refrescamos en cada fotograma.
  function bucle() {
    if (video.paused || video.ended) return;
    refrescar();
    requestAnimationFrame(bucle);
  }

  /** ¿Toca ya parar el tramo? */
  function comprobarParada() {
    if (paradaAutomatica === null) return true;

    if (video.paused || video.ended || video.currentTime >= paradaAutomatica) {
      paradaAutomatica = null;
      pausarConSeguridad();
      return true;
    }
    return false;
  }

  /**
   * Para el vídeo al llegar al final del tramo.
   *
   * Se mira en cada fotograma porque timeupdate sólo avisa cuatro veces por
   * segundo, y para un tramo que acaba medio segundo después de la marca, un
   * cuarto de segundo de más se nota.
   *
   * Pero requestAnimationFrame no corre si la página no se está pintando —con
   * la pantalla apagada, o con Teseo de fondo—, así que timeupdate queda de
   * red: menos fino, pero ahí sigue.
   */
  function vigilarParada() {
    if (comprobarParada()) return;
    requestAnimationFrame(vigilarParada);
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
    paradaAutomatica = null;
    await pausarConSeguridad();

    const maximo = isFinite(video.duration) ? video.duration : Infinity;
    const base = destinoPendiente ?? video.currentTime;
    destinoPendiente = Math.min(Math.max(0, base + segundos), maximo);

    // Pintamos el destino ya, aunque la imagen tarde un poco en llegar.
    reloj.textContent = `${destinoPendiente.toFixed(2)} s / ` +
      `${isFinite(video.duration) ? video.duration.toFixed(2) : '—'} s`;

    aplicarSalto();
  }

  async function alternar() {
    if (!video.src) return;
    // Si lo arranca el usuario, que corra hasta donde él quiera.
    paradaAutomatica = null;
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
  video.addEventListener('timeupdate', () => { refrescar(); comprobarParada(); });
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

  // --- Zoom sobre el vídeo ---------------------------------------------
  //
  // El zoom del navegador está desactivado en toda la aplicación, para que
  // los botones no se muevan de sitio. A cambio, el zoom del vídeo lo
  // hacemos nosotros aquí: amplía sólo la imagen, dentro de su marco, y no
  // toca el resto de la pantalla.

  const ESCALA_MAXIMA = 4;
  let escala = 1;
  let despX = 0;
  let despY = 0;

  const btnAjustar = crear('button', {
    type: 'button', class: 'boton-ajustar', texto: 'Ajustar', hidden: true,
  });

  const marco = crear('div', { class: 'marco-video' }, [video, btnAjustar]);

  function aplicarZoom() {
    // La imagen ampliada no puede desplazarse tanto que deje hueco al lado.
    const maxX = (marco.clientWidth * (escala - 1)) / 2;
    const maxY = (marco.clientHeight * (escala - 1)) / 2;
    despX = Math.min(maxX, Math.max(-maxX, despX));
    despY = Math.min(maxY, Math.max(-maxY, despY));

    video.style.transform = `translate(${despX}px, ${despY}px) scale(${escala})`;
    btnAjustar.hidden = escala <= 1.01;
  }

  function restablecerZoom() {
    escala = 1;
    despX = 0;
    despY = 0;
    aplicarZoom();
  }

  btnAjustar.addEventListener('click', restablecerZoom);

  // Se siguen los dedos uno a uno: con dos, la distancia entre ellos manda
  // el zoom; con uno, y sólo si ya está ampliado, se arrastra la imagen.
  const dedos = new Map();
  let distanciaInicial = 0;
  let escalaInicial = 1;

  marco.addEventListener('pointerdown', (evento) => {
    // Registrar el dedo va PRIMERO: la captura del puntero puede fallar
    // según el navegador, y si falla no debe llevarse por delante el gesto.
    dedos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    try {
      marco.setPointerCapture(evento.pointerId);
    } catch { /* seguimos igual: sólo perdemos el seguimiento fuera del marco */ }

    if (dedos.size === 2) {
      const [a, b] = [...dedos.values()];
      distanciaInicial = Math.hypot(a.x - b.x, a.y - b.y);
      escalaInicial = escala;
    }
  });

  marco.addEventListener('pointermove', (evento) => {
    if (!dedos.has(evento.pointerId)) return;
    const anterior = dedos.get(evento.pointerId);
    dedos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    if (dedos.size >= 2 && distanciaInicial > 0) {
      const [a, b] = [...dedos.values()];
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      escala = Math.min(ESCALA_MAXIMA,
                        Math.max(1, escalaInicial * (distancia / distanciaInicial)));
      aplicarZoom();
    } else if (dedos.size === 1 && escala > 1) {
      despX += evento.clientX - anterior.x;
      despY += evento.clientY - anterior.y;
      aplicarZoom();
    }
  });

  const soltarDedo = (evento) => {
    dedos.delete(evento.pointerId);
    if (dedos.size < 2) distanciaInicial = 0;
    if (escala <= 1.01) restablecerZoom();
  };
  marco.addEventListener('pointerup', soltarDedo);
  marco.addEventListener('pointercancel', soltarDedo);

  // Con ratón: Ctrl + rueda, como en cualquier visor de imágenes.
  marco.addEventListener('wheel', (evento) => {
    if (!evento.ctrlKey) return;
    evento.preventDefault();
    escala = Math.min(ESCALA_MAXIMA, Math.max(1, escala * (evento.deltaY < 0 ? 1.15 : 0.87)));
    aplicarZoom();
  }, { passive: false });

  const elemento = crear('div', { class: 'reproductor' }, [
    marco, filaDeTiempo, btnPlay, rejilla,
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
      restablecerZoom();
    },

    /** Coloca el vídeo en un instante concreto, en segundos. */
    irA(segundos) {
      paradaAutomatica = null;
      pausarConSeguridad().then(() => {
        destinoPendiente = segundos;
        aplicarSalto();
      });
    },

    /**
     * Reproduce un trozo del vídeo y para al llegar al final.
     * Es lo que se hace al tocar un intercambio: se ve lo justo y para solo,
     * sin tener que buscar el botón de pausa.
     */
    async verTramo(desde, hasta) {
      if (!video.src) return;

      await pausarConSeguridad();

      const maximo = isFinite(video.duration) ? video.duration : Infinity;
      video.currentTime = Math.min(Math.max(0, desde), maximo);
      paradaAutomatica = Math.min(hasta, maximo);

      try {
        promesaDeReproduccion = video.play();
        await promesaDeReproduccion;
      } catch (error) {
        console.error('El navegador rechazó reproducir:', error);
        paradaAutomatica = null;
      } finally {
        promesaDeReproduccion = null;
      }

      requestAnimationFrame(vigilarParada);
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
