// Calibrado de la detección automática.
//
// Se le enseña a Teseo dónde está el marcador, dónde está cada lámpara y de
// qué color es el usuario. Tres recuadros y un desplegable.
//
// Por qué lo marca el usuario y no lo busca Teseo
// -----------------------------------------------
// Lo buscaba: se guardaba una captura del marcador con las lámparas apagadas y
// otra con una encendida, y lo que aparecía entre las dos era la lámpara. En
// teoría es elegante —los dígitos del tanteo están en las dos capturas y se
// van solos en la resta— y en la práctica era la parte más frágil de todo
// esto: si entre las dos capturas cambiaba el tanteo, ese dígito también
// "aparecía" y se tomaba por una lámpara; si el tocado elegido salía de
// refilón, la mancha se medía pequeña; y había que explicar todo eso.
//
// Marcarlo a dedo es más rápido, no falla nunca y el usuario ve exactamente lo
// que Teseo va a mirar. Lo ideal es hacerlo sobre un fotograma con las dos
// lámparas encendidas, pero cada recuadro se puede marcar en el momento del
// vídeo que se quiera: Teseo sabe dónde está el marcador en cada fotograma, y
// guarda cada lámpara como una posición DENTRO del marcador, no de la pantalla.
//
// El recuadro del marcador es además la PLANTILLA con la que se reconoce el
// aparato durante todo el vídeo, y por eso se dibuja AJUSTADO. La primera
// versión pedía holgura para el temblor de la cámara; de eso se encarga ahora
// el seguimiento, y todo lo que sobre —pista, gente, fondo— cambia a lo largo
// del vídeo y sólo sirve para que la plantilla deje de encajar.
//
// Ese mismo seguimiento se usa aquí, mientras se calibra: los tres recuadros
// van pegados al marcador según el usuario se mueve por el vídeo, y eso es a
// la vez la comprobación de que el análisis va a funcionar y lo que permite
// marcar cada lámpara en el momento que se quiera.

import { anadir, crear, rellenar, cabecera, ir, desplegable, formatearSegundos } from '../ui.js';
import {
  ALMACENES, obtener, guardar, borrar, leerVideo, listarPor,
  colorDelAsalto, fijarColorDelAsalto,
} from '../db.js';
import { LADOS_DE_LA_PISTA, PREGUNTA_LADO, colorDelLado, ladoDelColor } from '../constantes.js';
import { recortar, contarEnZona } from '../deteccion.js';
import { escenaDe, plantillaDesde, crearSeguidor, detalleDe, sePuedeSeguir } from '../seguimiento.js';
import { buscarFalsosPositivos } from '../analisis.js';

// Un recuadro más pequeño que esto en píxeles del vídeo no da para nada.
const ANCHO_MINIMO = 60;
const ALTO_MINIMO = 40;

// Y uno que se coma más de la mitad del fotograma no enmarca el aparato.
const PARTE_MAXIMA = 0.5;

// Cuánto se puede ampliar el vídeo del calibrado con los dedos. Seis veces es
// de sobra para encuadrar un marcador que se vea pequeño, y más allá sólo se
// ven los píxeles.
const ESCALA_MAXIMA = 6;

// Por debajo de esta altura de vídeo, las lámparas salen tan pequeñas que
// distinguirlas del fondo es cuestión de suerte. 720 es lo que graba
// cualquier móvil de hace diez años.
const ALTO_RECOMENDADO = 720;

// Con menos luz que esto dentro del recuadro de una lámpara, o está apagada en
// este fotograma o el recuadro no la coge.
const LUZ_INSUFICIENTE = 12;
const LUZ_JUSTA = 40;

// Del tamaño de la mancha marcada, cuánto hay que ver encendido para dar la
// lámpara por encendida.
const PARTE_PARA_ENCENDER = 0.25;
const PISO_DE_UMBRAL = 8;

// Los tres recuadros que se dibujan, en el orden en que se piden.
const PASOS = [
  { id: 'marcador', etiqueta: 'Marcador' },
  { id: 'rojo', etiqueta: 'Lámpara roja' },
  { id: 'verde', etiqueta: 'Lámpara verde' },
];

// Si una lámpara da menos de esta parte de píxeles que la otra, conviene
// decirlo: la floja se va a perder tocados y a estropear dobles.
const DESEQUILIBRIO = 0.4;

// Con más de esto encendido a lo largo del vídeo, algo va mal.
const DEMASIADO_ENCENDIDO = 0.7;

const NUMERO = { rojo: 1, verde: 2 };

/** "la lámpara roja", que "lámpara rojo" no lo dice nadie. */
const enFemenino = (color) => (color === 'rojo' ? 'roja' : 'verde');

export async function pantallaCalibrado(contenedor, datos = {}) {
  const tiempo = await obtener(ALMACENES.tiempos, datos.tiempoId);
  if (!tiempo) { ir('inicio'); return; }

  const asalto = await obtener(ALMACENES.asaltos, tiempo.asaltoId);

  const volver = () => ir('etiquetado', { tiempoId: tiempo.id, asaltoId: tiempo.asaltoId });
  anadir(contenedor, cabecera('Calibrado', volver));

  if (!tiempo.totalTrozos) {
    anadir(contenedor, crear('p', {
      class: 'aviso',
      texto: 'Este tiempo ya no tiene vídeo guardado, así que no hay nada que calibrar.',
    }));
    return;
  }

  const estado = crear('p', { class: 'ayuda', texto: 'Recuperando el vídeo…' });
  anadir(contenedor, estado);

  let fichero;
  try {
    fichero = await leerVideo(tiempo);
  } catch (error) {
    estado.textContent = '';
    anadir(contenedor, crear('p', {
      class: 'aviso', texto: `No se pudo recuperar el vídeo: ${error.message}`,
    }));
    return;
  }

  // --- Lo que se está calibrando ---
  const previo = tiempo.calibrado || null;
  let recuadro = previo ? { ...previo.recuadro } : null;
  // La plantilla con la que el análisis seguirá el marcador por el vídeo. Sale
  // del fotograma en el que se enmarcó el marcador.
  let plantilla = previo ? previo.plantilla || null : null;
  let lamparas = previo ? { ...previo.lamparas } : { rojo: null, verde: null };
  // Cuál de los tres recuadros se está dibujando.
  let dibujando = recuadro ? 'rojo' : 'marcador';
  // Tu color no es cosa del calibrado: es del asalto entero, y lo normal es
  // que ya se haya contestado en la pantalla del vídeo. Aquí sólo se enseña, y
  // se puede corregir sin salir.
  let miColor = await colorDelAsalto(asalto);
  // Lo que se le dice al usuario del último recuadro que ha marcado.
  let ultimoIntento = null;
  // Dónde está el marcador en el fotograma que se ve ahora mismo. No tiene por
  // qué ser donde se dibujó: el usuario se mueve por el vídeo y la cámara
  // también. Se recalcula al saltar, y con él se pintan los tres recuadros,
  // que es la única forma de que el usuario compruebe que aquello funciona.
  let dondeEstaAhora = recuadro ? { ...recuadro } : null;

  // --- El vídeo, con lo justo para moverse por él ---
  const video = crear('video', { class: 'video-calibrado', playsinline: true, muted: true });
  video.src = URL.createObjectURL(fichero);

  const dibujado = crear('div', { class: 'recuadro-dibujado', hidden: true });
  const marcaRoja = crear('div', { class: 'zona-lampara zona-roja', hidden: true });
  const marcaVerde = crear('div', { class: 'zona-lampara zona-verde', hidden: true });
  const capa = crear('div', { class: 'capa-recuadro' }, [dibujado, marcaRoja, marcaVerde]);

  // El zoom se aplica a este envoltorio, con el vídeo y la capa dentro. Es lo
  // que hace que no haya que deshacer la transformación a mano para saber
  // dónde ha tocado el dedo: getBoundingClientRect() de la capa ya viene
  // ampliada, así que la cuenta de siempre —(x - izquierda) / ancho— sigue
  // dando la posición dentro del fotograma.
  const lienzoZoom = crear('div', { class: 'lienzo-zoom' }, [video, capa]);
  const marco = crear('div', { class: 'marco-calibrado' }, [lienzoZoom]);

  const posicion = crear('input', {
    class: 'deslizador', type: 'range', min: 0, max: 1000, value: 0,
    'aria-label': 'Posición en el vídeo',
    oninput: () => { video.currentTime = (Number(posicion.value) / 1000) * (video.duration || 0); },
  });
  const reloj = crear('span', { class: 'reloj', texto: '0.00 s' });

  const btnPlay = crear('button', {
    type: 'button', class: 'boton boton-compacto', texto: 'Reproducir',
    onclick: () => { if (video.paused) video.play(); else video.pause(); },
  });

  const saltos = crear('div', { class: 'rejilla-saltos' }, [-1, -0.1, 0.1, 1].map((cuanto) =>
    crear('button', {
      type: 'button', class: 'boton', texto: `${cuanto > 0 ? '+' : '−'}${Math.abs(cuanto)} s`,
      onclick: () => {
        video.pause();
        video.currentTime = Math.min(Math.max(0, video.currentTime + cuanto), video.duration || 0);
      },
    })));

  video.addEventListener('timeupdate', refrescarReloj);
  video.addEventListener('seeked', () => { refrescarReloj(); situarMarcador(); });
  video.addEventListener('timeupdate', situarMarcador);
  video.addEventListener('loadedmetadata', () => {
    refrescarReloj();
    pintarMarcas();
    // Hasta aquí no se sabía de qué tamaño es el vídeo, y de eso depende lo
    // que se le dice al usuario en el paso 1.
    pintarPasos();
  });
  video.addEventListener('play', () => { btnPlay.textContent = 'Pausa'; });
  video.addEventListener('pause', () => { btnPlay.textContent = 'Reproducir'; });

  function refrescarReloj() {
    reloj.textContent = `${video.currentTime.toFixed(2)} s / ${formatearSegundos(video.duration || 0)}`;
    if (video.duration) posicion.value = String((video.currentTime / video.duration) * 1000);
  }

  // --- Un dedo dibuja el recuadro; dos amplían y pasean la imagen ---
  //
  // Hacen falta las dos cosas y en la misma capa: el marcador sale pequeño en
  // un vídeo grabado de lejos, y encuadrarlo a pulso sobre una miniatura es
  // imposible. Se amplía con dos dedos, se ajusta con uno, y no hay botón de
  // volver al tamaño normal porque se vuelve con el mismo gesto de siempre:
  // juntando los dedos.
  //
  // Con dos dedos también se pasea la imagen, moviéndolos juntos, como en
  // cualquier visor de fotos. Aquí no es un lujo: con un dedo se dibuja, así
  // que la pinza es la única mano libre que queda para mover lo ampliado.
  let arrastrando = null;
  // Lo que se lleva dibujado a medio trazo: {que, caja}. Se pinta mientras se
  // arrastra y se guarda al soltar.
  let trazo = null;
  const dedos = new Map();
  let escala = 1;
  let despX = 0;
  let despY = 0;
  let distanciaInicial = 0;
  let escalaInicial = 1;
  // Punto medio entre los dos dedos la última vez que se miró: lo que se mueva
  // de un movimiento al siguiente es lo que se pasea la imagen.
  let centroAnterior = null;

  function aplicarZoom() {
    // El desplazamiento se acota para que la imagen no se despegue del marco
    // y deje una franja vacía al lado.
    const maxX = (marco.clientWidth * (escala - 1)) / 2;
    const maxY = (marco.clientHeight * (escala - 1)) / 2;
    despX = Math.min(maxX, Math.max(-maxX, despX));
    despY = Math.min(maxY, Math.max(-maxY, despY));
    lienzoZoom.style.transform = `translate(${despX}px, ${despY}px) scale(${escala})`;
  }

  capa.addEventListener('pointerdown', (evento) => {
    dedos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    if (dedos.size >= 2) {
      // Ha entrado un segundo dedo: esto ya no es un trazo, es una pinza. Se
      // abandona lo que se llevara dibujando, que si no queda un recuadro
      // puesto donde nadie quiso.
      arrastrando = null;
      trazo = null;
      const [a, b] = [...dedos.values()];
      distanciaInicial = Math.hypot(a.x - b.x, a.y - b.y);
      escalaInicial = escala;
      centroAnterior = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pintarMarcas();
      return;
    }

    // Capturar el puntero mantiene el trazo aunque el dedo se salga del
    // vídeo. Si el navegador no deja, se dibuja igual.
    try { capa.setPointerCapture(evento.pointerId); } catch { /* da igual */ }
    arrastrando = puntoRelativo(evento);
  });

  capa.addEventListener('pointermove', (evento) => {
    if (!dedos.has(evento.pointerId)) return;
    const anterior = dedos.get(evento.pointerId);
    dedos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    if (dedos.size >= 2 && distanciaInicial > 0) {
      const [a, b] = [...dedos.values()];
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      escala = Math.min(ESCALA_MAXIMA,
                        Math.max(1, escalaInicial * (distancia / distanciaInicial)));

      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (centroAnterior) {
        despX += centro.x - centroAnterior.x;
        despY += centro.y - centroAnterior.y;
      }
      centroAnterior = centro;

      aplicarZoom();
      return;
    }

    if (!arrastrando) {
      // Un solo dedo y sin trazo empezado: si hay zoom, se pasea la imagen.
      if (escala > 1) {
        despX += evento.clientX - anterior.x;
        despY += evento.clientY - anterior.y;
        aplicarZoom();
      }
      return;
    }

    trazo = { que: dibujando, caja: entreDosPuntos(arrastrando, puntoRelativo(evento)) };
    pintarMarcas();
  });

  const soltar = (evento) => {
    dedos.delete(evento.pointerId);
    if (dedos.size < 2) { distanciaInicial = 0; centroAnterior = null; }
    if (escala <= 1.01) { escala = 1; despX = 0; despY = 0; aplicarZoom(); }

    if (!arrastrando) return;
    const desde = arrastrando;
    const que = dibujando;
    arrastrando = null;
    trazo = null;

    const trazado = entreDosPuntos(desde, puntoRelativo(evento));
    // Un toque sin arrastre no es un recuadro: no se toca lo que hubiera.
    if (trazado.ancho < 0.01 || trazado.alto < 0.01) { pintarMarcas(); return; }

    if (que === 'marcador') enmarcarMarcador(trazado);
    else marcarLampara(que, trazado);

    pintarMarcas();
    pintarPasos();
  };
  capa.addEventListener('pointerup', soltar);
  capa.addEventListener('pointercancel', soltar);

  function puntoRelativo(evento) {
    const caja = capa.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (evento.clientX - caja.left) / caja.width)),
      y: Math.min(1, Math.max(0, (evento.clientY - caja.top) / caja.height)),
    };
  }

  function entreDosPuntos(uno, otro) {
    return {
      x: Math.min(uno.x, otro.x),
      y: Math.min(uno.y, otro.y),
      ancho: Math.abs(otro.x - uno.x),
      alto: Math.abs(otro.y - uno.y),
    };
  }

  /**
   * Los tres recuadros, puestos donde esté el marcador en este fotograma.
   *
   * Mientras se arrastra el dedo se pinta lo que se lleve dibujado, que si no
   * el trazo no se ve.
   */
  function pintarMarcas() {
    const donde = dondeEstaAhora || recuadro;

    const marcador = trazo && trazo.que === 'marcador' ? trazo.caja : donde;
    dibujado.hidden = !marcador;
    if (marcador) colocar(dibujado, marcador);

    for (const [color, marca] of [['rojo', marcaRoja], ['verde', marcaVerde]]) {
      const enCurso = trazo && trazo.que === color ? trazo.caja : null;
      const caja = enCurso
        || (donde && lamparas[color] ? enElFotograma(lamparas[color].zona, donde) : null);
      marca.hidden = !caja;
      if (caja) colocar(marca, caja);
    }
  }

  /**
   * Dónde está el marcador en el fotograma que se ve.
   *
   * Con plantilla se busca; sin ella —todavía no se ha enmarcado, o el
   * recuadro no tiene dibujo que reconocer— se deja donde se dibujó.
   */
  function situarMarcador() {
    if (!recuadro) { dondeEstaAhora = null; return; }
    if (!plantilla) { dondeEstaAhora = recuadro; pintarMarcas(); return; }

    const encontrado = crearSeguidor(plantilla, recuadro)
      .situar(escenaDe(video, document.createElement('canvas')));
    dondeEstaAhora = encontrado.estado === 'perdido' ? null : encontrado.recuadro;
    pintarMarcas();
  }

  function colocar(elemento, caja) {
    elemento.style.left = `${caja.x * 100}%`;
    elemento.style.top = `${caja.y * 100}%`;
    elemento.style.width = `${caja.ancho * 100}%`;
    elemento.style.height = `${caja.alto * 100}%`;
  }

  /** De coordenadas de dentro del marcador a coordenadas del fotograma. */
  function enElFotograma(zona, donde) {
    return {
      x: donde.x + zona.x * donde.ancho,
      y: donde.y + zona.y * donde.alto,
      ancho: zona.ancho * donde.ancho,
      alto: zona.alto * donde.alto,
    };
  }

  /**
   * Y al revés: de lo que se ha dibujado en el fotograma a una posición dentro
   * del marcador.
   *
   * Guardar la lámpara así, y no en coordenadas de la pantalla, es lo que
   * permite marcarla en cualquier momento del vídeo: la cámara se habrá movido,
   * pero la lámpara sigue en el mismo sitio de su aparato.
   */
  function dentroDelMarcador(caja, donde) {
    return {
      x: (caja.x - donde.x) / donde.ancho,
      y: (caja.y - donde.y) / donde.alto,
      ancho: caja.ancho / donde.ancho,
      alto: caja.alto / donde.alto,
    };
  }

  // --- Los pasos ---
  const pasos = crear('div');
  const resultadoFinal = crear('div');

  anadir(contenedor,
    // Aquí dentro no hay más que explicación, así que con la ayuda apagada se
    // va el desplegable entero: dejarlo sería un botón que abre un hueco.
    crear('details', { class: 'filtros explicacion' }, [
      crear('summary', { texto: '¿Qué es esto y para qué sirve?' }),
      ...ayuda(),
    ]),
    marco,
    reloj,
    posicion,
    btnPlay,
    saltos,
    pasos,
    resultadoFinal,
  );
  estado.remove();

  pintarPasos();

  // ------------------------------------------------------------------

  /**
   * Los dos dibujos de ejemplo del desplegable de ayuda.
   *
   * Dibujados y no fotografiados a propósito: un aparato de verdad sería el de
   * una marca concreta y el de al lado no se le parece en nada, mientras que
   * lo que hay que entender —qué se enmarca y cuánto margen se deja— es igual
   * en todos. Y pesan cuatro líneas en vez de cien kilobytes.
   *
   * En SVG hecho a mano porque crear() usa createElement, que para SVG no
   * vale: hay que nombrar su espacio de nombres.
   */
  function ejemplo({ bien }) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 120');
    svg.setAttribute('class', 'ejemplo-calibrado');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', bien
      ? 'Ejemplo bueno: un recuadro ajustado al aparato y uno pequeño en cada lámpara'
      : 'Ejemplo malo: un recuadro que coge media pista y otro que coge un dígito');

    const trazar = (etiqueta, atributos) => {
      const nodo = document.createElementNS(NS, etiqueta);
      for (const [nombre, valor] of Object.entries(atributos)) {
        nodo.setAttribute(nombre, String(valor));
      }
      svg.append(nodo);
      return nodo;
    };

    // La sala, y el aparato encima de su soporte.
    trazar('rect', { x: 0, y: 0, width: 200, height: 120, fill: '#1b212a' });
    trazar('rect', { x: 0, y: 96, width: 200, height: 24, fill: '#2c3542' });
    trazar('rect', { x: 56, y: 34, width: 88, height: 44, rx: 4, fill: '#0d0d0d' });
    trazar('rect', { x: 96, y: 78, width: 8, height: 18, fill: '#2c3542' });

    // Las dos lámparas y el tanteo, que es lo que confunde.
    trazar('circle', { cx: 70, cy: 48, r: 7, fill: '#35c46b' });
    trazar('circle', { cx: 130, cy: 48, r: 7, fill: '#e05a4a' });
    trazar('text', {
      x: 100, y: 70, fill: '#e05a4a', 'font-size': 14, 'font-family': 'monospace',
      'text-anchor': 'middle',
    }).textContent = '07';

    const marco = (atributos) => trazar('rect', {
      ...atributos, fill: 'none', 'stroke-width': 1.5,
    });

    if (bien) {
      marco({ x: 52, y: 30, width: 96, height: 52, stroke: '#4c8dff' });
      marco({ x: 61, y: 39, width: 18, height: 18, stroke: '#35c46b' });
      marco({ x: 121, y: 39, width: 18, height: 18, stroke: '#e05a4a' });
    } else {
      marco({ x: 8, y: 10, width: 184, height: 100, stroke: '#4c8dff' });
      marco({ x: 108, y: 38, width: 56, height: 40, stroke: '#e05a4a' });
    }

    return svg;
  }

  /** Los dos ejemplos, uno al lado del otro, con su pie. */
  function ejemplos() {
    const conPie = (bien, pie) => crear('figure', { class: 'figura-ejemplo' }, [
      ejemplo({ bien }),
      crear('figcaption', { class: 'ayuda', texto: pie }),
    ]);

    return crear('div', { class: 'ejemplos-calibrado' }, [
      conPie(true,
        'Así. El marcador entero y poco más, y cada lámpara con un par de ' +
        'píxeles de margen.'),
      conPie(false,
        'Así no. El recuadro coge media sala —todo lo que cambia estorba— y el ' +
        'de la lámpara se lleva dentro un dígito del tanteo.'),
    ]);
  }

  function ayuda() {
    return [
      'Teseo puede encontrar los tocados solo, mirando las lámparas del ' +
      'aparato: en espada hay una verde y una roja, y se encienden en el ' +
      'momento del tocado. Aquí le enseñas dónde mirar, con tres recuadros.',
      'El problema es que el marcador lleva también el cronómetro y el tanteo ' +
      'encendidos todo el rato, y en los mismos colores: si Teseo contara el ' +
      'rojo de todo el marcador, cada punto del rival sería un tocado falso. ' +
      'Por eso hay que marcarle las lámparas una por una, y ajustadas.',
      'Si el marcador se ve pequeño, amplía la imagen con dos dedos antes de ' +
      'encuadrarlo: con un dedo se dibuja el recuadro y con dos se amplía y se ' +
      'pasea. Para volver al tamaño normal, junta los dedos.',
      'Ajusta el recuadro al aparato: que entre el marcador entero y poco más. ' +
      'No hace falta dejar holgura para el temblor de la cámara —de eso se ' +
      'encarga el seguimiento—, y todo lo que metas de más juega en contra: la ' +
      'pista, la gente y el fondo cambian a lo largo del vídeo, y lo que cambia ' +
      'hace que la plantilla deje de encajar. Lo único que no vale es un ' +
      'recuadro liso, sin dibujo que reconocer.',
      'De la resolución depende todo. Las lámparas del aparato son pequeñas, y ' +
      'en un vídeo de baja calidad acaban siendo cuatro píxeles que se ' +
      'confunden con cualquier reflejo. Graba a 720p o más, y si puedes, con ' +
      'el marcador cerca.',
      'Si el tirador se pone delante del aparato, Teseo se queda sin ver ' +
      'durante ese rato y lo vuelve a buscar en cuanto reaparece. Los tocados ' +
      'que caigan en un hueco se proponen igual, pero con el instante marcado ' +
      'con ≈ porque sólo se sabe aproximadamente cuándo fueron.',
      'Lo más cómodo es buscar un DOBLE —las dos lámparas encendidas a la vez— y ' +
      'hacerlo todo sobre ese fotograma. Pero no hace falta: cada recuadro se ' +
      'puede marcar en el momento del vídeo que quieras, porque Teseo guarda cada ' +
      'lámpara como una posición dentro del marcador, no de la pantalla. Si ' +
      'marcas la roja en un tocado y la verde en otro, funciona igual.',
      'Mientras te mueves por el vídeo verás los recuadros seguir al marcador. ' +
      'Eso es la comprobación: si van pegados a él, el análisis va a funcionar.',
      'Si en tu vídeo no se ve el marcador, esta función no se puede usar: hay ' +
      'que etiquetar a mano, como siempre. No pasa nada.',
    ].map((texto) => crear('p', { class: 'texto-ayuda', texto })).concat(ejemplos());
  }

  function tamanoDelRecuadro() {
    return {
      ancho: Math.round((recuadro?.ancho || 0) * (video.videoWidth || 0)),
      alto: Math.round((recuadro?.alto || 0) * (video.videoHeight || 0)),
      parte: (recuadro?.ancho || 0) * (recuadro?.alto || 0),
    };
  }

  /** Lo que falla del recuadro, o null si está bien. */
  function queLeFaltaAlRecuadro() {
    if (!recuadro || recuadro.ancho <= 0 || recuadro.alto <= 0) {
      return 'Arrastra el dedo por el vídeo para enmarcar el aparato, ajustado y ' +
             'con la menor pista posible dentro.';
    }

    const { ancho, alto, parte } = tamanoDelRecuadro();
    if (ancho < ANCHO_MINIMO || alto < ALTO_MINIMO) {
      return `El recuadro es demasiado pequeño: ${ancho}×${alto} píxeles del ` +
             `vídeo, y hacen falta al menos ${ANCHO_MINIMO}×${ALTO_MINIMO}. Si ` +
             'el marcador se ve así de pequeño, la solución es grabar más cerca.';
    }
    if (parte > PARTE_MAXIMA) {
      return 'El recuadro se come más de la mitad del fotograma. Así no enmarca ' +
             'el aparato, enmarca la pista.';
    }
    return null;
  }

  /** "arriba a la izquierda", para que se pueda comprobar de un vistazo. */
  function dondeCae(zona) {
    const cx = zona.x + zona.ancho / 2;
    const cy = zona.y + zona.alto / 2;
    const arriba = cy < 0.4 ? 'arriba' : cy > 0.6 ? 'abajo' : 'en medio';
    const lado = cx < 0.4 ? 'a la izquierda' : cx > 0.6 ? 'a la derecha' : 'en el centro';
    return `${arriba} ${lado}`;
  }

  /**
   * Si el vídeo da o no da para esto.
   *
   * La detección se juega en unas pocas decenas de píxeles: la lámpara del
   * aparato dentro del encuadre. A 576 de alto, esa lámpara son cuatro
   * píxeles y cualquier reflejo se le parece. Merece la pena decirlo antes de
   * que el usuario pierda la tarde y no después.
   */
  function queTalLaResolucion() {
    if (!video.videoHeight) return null;
    const medida = `${video.videoWidth}×${video.videoHeight}`;
    if (video.videoHeight >= ALTO_RECOMENDADO) {
      return { bien: true, texto: `Vídeo de ${medida}: resolución de sobra.` };
    }
    return {
      bien: false,
      texto: `Este vídeo es de ${medida}, y para la detección automática conviene ` +
             `grabar a 720p (1280×720) o más. Con menos, las lámparas ocupan tan ` +
             `pocos píxeles que se confunden con reflejos: habrá tocados falsos y ` +
             `tocados sin detectar. Se puede intentar igualmente, pero la próxima ` +
             `vez sube la calidad en la cámara del móvil.`,
    };
  }

  /** El texto de cada paso: qué hay que dibujar y con qué cuidado. */
  function loQuePideElPaso(cual) {
    if (cual === 'marcador') {
      return 'Arrastra el dedo alrededor del aparato: el marcador entero y poco ' +
             'más. De aquí sale la foto con la que Teseo lo reconocerá durante ' +
             'todo el vídeo, así que cuanta menos sala entre dentro, mejor.';
    }
    const color = cual === 'rojo' ? 'roja' : 'verde';
    return `Ahora la lámpara ${color}: un recuadro a su alrededor, dejando un ` +
           'poco de margen para que el seguimiento pueda desviarse un par de ' +
           'píxeles sin dejarla fuera. Márcala en un fotograma en el que esté ' +
           'ENCENDIDA: de la luz que se vea al marcarla sale el listón que tendrá ' +
           'que superar después.';
  }

  /** Cómo va cada uno de los tres recuadros. */
  function comoVaElPaso(cual) {
    if (cual === 'marcador') {
      const problema = queLeFaltaAlRecuadro();
      const { ancho, alto } = tamanoDelRecuadro();
      return problema
        ? { bien: false, texto: problema }
        : { bien: true, texto: `Marcador enmarcado: ${ancho}×${alto} píxeles del vídeo.` };
    }

    const lampara = lamparas[cual];
    if (!lampara) return { bien: false, texto: `Lámpara ${enFemenino(cual)}: sin marcar.` };

    return {
      bien: true,
      texto: `Lámpara ${enFemenino(cual)}: marcada ${dondeCae(lampara.zona)} del marcador, ` +
             `con ${lampara.luzAlMarcar ?? lampara.pixeles} píxeles de luz.`,
    };
  }

  function pintarPasos() {
    const resolucion = queTalLaResolucion();
    const seguimiento = queTalElSeguimiento();
    const marcadas = ['rojo', 'verde'].filter((color) => lamparas[color]);

    rellenar(pasos, [
      resolucion ? crear('p', {
        class: resolucion.bien ? 'ayuda' : 'aviso', texto: resolucion.texto,
      }) : null,

      crear('h3', { class: 'subtitulo-seccion', texto: 'Qué estás enmarcando' }),
      crear('div', { class: 'grupo-opciones tres-columnas' }, PASOS.map((paso) => crear('button', {
        type: 'button',
        class: 'boton boton-opcion' + (dibujando === paso.id ? ' elegido' : ''),
        texto: paso.etiqueta + (comoVaElPaso(paso.id).bien ? ' ✓' : ''),
        onclick: () => { dibujando = paso.id; ultimoIntento = null; pintarPasos(); },
      }))),

      crear('p', { class: 'ayuda', texto: loQuePideElPaso(dibujando) }),

      ...PASOS.map((paso) => {
        const como = comoVaElPaso(paso.id);
        return crear('p', { class: como.bien ? 'aviso-bueno' : 'ayuda', texto: como.texto });
      }),

      seguimiento ? crear('p', {
        class: seguimiento.bien ? 'ayuda' : 'aviso', texto: seguimiento.texto,
      }) : null,
      ultimoIntento ? crear('p', { class: 'aviso', texto: ultimoIntento }) : null,
      desequilibrio() ? crear('p', { class: 'aviso', texto: desequilibrio() }) : null,

      crear('h3', { class: 'subtitulo-seccion', texto: 'Tu lado' }),
      crear('p', {
        class: miColor ? 'ayuda' : 'aviso',
        texto: miColor
          ? 'Es el del asalto entero, así que vale para todos sus tiempos. ' +
            'Cambiarlo aquí lo cambia en todas partes.'
          : 'De tu lado sale tu lámpara: la izquierda es la roja y la derecha la ' +
            'verde. Sin esto se pueden detectar los tocados pero no saber de ' +
            'quién son.',
      }),
      desplegable(PREGUNTA_LADO, LADOS_DE_LA_PISTA, ladoDelColor(miColor),
        (lado) => { fijarColor(colorDelLado(lado)); }, { vacio: '— Elige —' }).bloque,

      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Guardar el calibrado',
        onclick: () => guardarCalibrado(),
      }),

      marcadas.length === 1 ? crear('p', {
        class: 'ayuda',
        texto: `Sólo está marcada la lámpara ${marcadas[0]}, así que sólo se ` +
               'detectarán esos tocados. Se puede guardar así y completarlo luego.',
      }) : null,
    ]);
  }


  /**
   * Se ha enmarcado el marcador: de aquí sale la plantilla del seguimiento.
   *
   * Y se tira lo que hubiera de las lámparas: estaban guardadas como una
   * posición dentro del marcador viejo, y con otro marcador señalarían a otro
   * sitio.
   */
  function enmarcarMarcador(caja) {
    recuadro = caja;
    dondeEstaAhora = caja;
    lamparas = { rojo: null, verde: null };
    ultimoIntento = null;

    const escena = escenaDe(video, document.createElement('canvas'));
    plantilla = escena ? plantillaDesde(escena, recuadro) : null;

    // Lo siguiente que toca es la lámpara roja, así que se pasa solo.
    if (!queLeFaltaAlRecuadro()) dibujando = 'rojo';
  }

  /**
   * Se ha enmarcado una lámpara: se guarda dónde está y cuánta luz se ve.
   *
   * La cuenta de píxeles de este fotograma es la que fija el umbral, y por eso
   * conviene marcarla con la lámpara encendida. Si está apagada no pasa nada
   * grave —queda el umbral mínimo— pero se avisa, porque entonces el umbral no
   * se ha ajustado a nada.
   */
  function marcarLampara(color, caja) {
    const donde = dondeEstaAhora;
    if (!donde) {
      ultimoIntento = 'Aquí no se reconoce el marcador, así que no se sabe en qué ' +
                      'parte de él cae lo que has marcado. Busca un momento en el ' +
                      'que se vea.';
      return;
    }

    const zona = dentroDelMarcador(caja, donde);
    const imagen = recortar(video, donde, document.createElement('canvas'));
    const luz = imagen ? contarEnZona(imagen, zona, NUMERO[color]) : 0;

    lamparas[color] = {
      zona,
      pixeles: Math.max(luz, 1),
      umbral: Math.max(PISO_DE_UMBRAL, Math.round(luz * PARTE_PARA_ENCENDER)),
      instante: video.currentTime,
      luzAlMarcar: luz,
    };

    ultimoIntento = luz >= LUZ_JUSTA ? null
      : luz < LUZ_INSUFICIENTE
        ? `Ahí dentro veo ${luz} píxeles de luz ${enFemenino(color)}, que es como no ver nada. ` +
          'Si la lámpara está apagada en este fotograma, busca un tocado y vuelve ' +
          'a marcarla: de la luz que se vea al marcar sale el listón que tendrá ' +
          'que superar después.'
        : `Sólo ${luz} píxeles de luz ${enFemenino(color)}. Funcionará, pero irá justo: si ` +
          'puedes, márcala en un tocado en el que se vea más de frente.';

    // Marcada la roja, lo natural es seguir con la verde.
    if (color === 'rojo' && !lamparas.verde) dibujando = 'verde';
  }

  /** Tu color se guarda en el asalto en cuanto se elige, no al guardar. */
  async function fijarColor(valor) {
    miColor = valor || null;
    if (valor && asalto) await fijarColorDelAsalto(asalto, valor);
    pintarPasos();
  }

  /**
   * Si una lámpara ha salido mucho más floja que la otra, dilo.
   *
   * Pasa sobre todo con la verde: un LED verde potente satura el sensor y sale
   * blanco por dentro, así que deja menos color que medir. Y una lámpara floja
   * no sólo pierde sus tocados: convierte los dobles en tocados del otro color.
   */
  function desequilibrio() {
    const { rojo, verde } = lamparas;
    if (!rojo || !verde) return null;

    const floja = rojo.pixeles < verde.pixeles ? 'roja' : 'verde';
    const menos = Math.min(rojo.pixeles, verde.pixeles);
    const mas = Math.max(rojo.pixeles, verde.pixeles);
    if (menos >= mas * DESEQUILIBRIO) return null;

    return `La lámpara ${floja} ha salido bastante más floja que la otra ` +
           `(${menos} píxeles contra ${mas}). Prueba a medirla otra vez en un ` +
           'tocado en el que se vea de frente y bien encendida: se queda la ' +
           'mancha más grande de las que encuentres, así que sólo puede mejorar.';
  }

  /** Lo que hay que decirle al usuario sobre el seguimiento, o null. */
  function queTalElSeguimiento() {
    if (!plantilla) return null;
    if (sePuedeSeguir(plantilla)) {
      return {
        bien: true,
        texto: `Marcador reconocible: Teseo podrá seguirlo aunque se mueva la cámara ` +
               `(plantilla de ${plantilla.ancho}×${plantilla.alto}, detalle ` +
               `${Math.round(detalleDe(plantilla))}).`,
      };
    }
    return {
      bien: false,
      texto: 'Dentro del recuadro casi no hay dibujo: es todo del mismo tono. Así ' +
             'no se puede reconocer el marcador cuando la cámara se mueva, y el ' +
             'análisis mirará siempre al mismo sitio del fotograma. Prueba a ' +
             'enmarcar algo más: el soporte, el borde de la mesa, lo que rodee al ' +
             'aparato.',
    };
  }

  async function guardarCalibrado(saltarBarrido = false) {
    const problema = queLeFaltaAlRecuadro();
    if (problema) { rellenar(resultadoFinal, crear('p', { class: 'aviso', texto: problema })); return; }

    if (!lamparas.rojo && !lamparas.verde) {
      rellenar(resultadoFinal, crear('p', {
        class: 'aviso',
        texto: 'No has marcado ninguna lámpara. Sin eso Teseo no sabe dónde mirar, ' +
               'y contar todo el recuadro sería contar el tanteo.',
      }));
      return;
    }
    if (!miColor) {
      rellenar(resultadoFinal, crear('p', {
        class: 'aviso',
        texto: 'Falta tu color en el asalto (paso 4). Sin eso se pueden detectar ' +
               'los tocados pero no saber de quién son.',
      }));
      return;
    }

    const calibrado = {
      recuadro, miColor, lamparas, plantilla,
      instante: video.currentTime,
      fechaISO: new Date().toISOString(),
    };

    let avisoDelBarrido = null;

    if (!saltarBarrido) {
      rellenar(resultadoFinal, crear('p', {
        class: 'ayuda', texto: 'Comprobando el recuadro en todo el vídeo…',
      }));

      const barrido = await buscarFalsosPositivos({ video, calibrado });
      const vistos = barrido.mirados - barrido.perdidos;
      const parte = vistos > 0 ? barrido.encendidos / vistos : 0;

      // El barrido busca el marcador en el fotograma entero, que es el caso
      // difícil: entre un momento y el siguiente han pasado segundos. Si no
      // aparece casi nunca, el análisis se va a pasar el vídeo a ciegas.
      if (barrido.seguimiento && barrido.perdidos > barrido.mirados / 2) {
        rellenar(resultadoFinal, [
          crear('p', {
            class: 'aviso',
            texto: `El marcador sólo se ha reconocido en ${vistos} de ` +
                   `${barrido.mirados} momentos repartidos por el vídeo. O la ` +
                   'cámara se mueve muchísimo, o el recuadro coge poco del ' +
                   'aparato, o hay alguien delante casi todo el rato. Así se ' +
                   'perderán muchos tocados: prueba a enmarcar más cosa alrededor ' +
                   'del marcador y a enmarcarlo en un momento en que se vea bien.',
          }),
          crear('button', {
            type: 'button', class: 'boton', texto: 'Guardar de todas formas',
            onclick: () => guardarCalibrado(true),
          }),
        ]);
        return;
      }

      if (barrido.seguimiento && barrido.perdidos > 0) {
        avisoDelBarrido = `El marcador se ha reconocido en ${vistos} de ` +
                          `${barrido.mirados} momentos del vídeo. En los huecos no ` +
                          'se mira nada, así que puede escaparse algún tocado.';
      }

      if (parte > DEMASIADO_ENCENDIDO) {
        rellenar(resultadoFinal, [
          crear('p', {
            class: 'aviso',
            texto: `En ${barrido.encendidos} de ${vistos} momentos repartidos ` +
                   'por el vídeo parecería haber una lámpara encendida. Lo más ' +
                   'probable es que alguno de los recuadros de las lámparas coja ' +
                   'de más y esté cazando un dígito del tanteo. Míralo en el vídeo ' +
                   'y vuelve a marcarlo más ajustado.',
          }),
          crear('button', {
            type: 'button', class: 'boton', texto: 'Guardar de todas formas',
            onclick: () => guardarCalibrado(true),
          }),
        ]);
        return;
      }
    }

    await guardar(ALMACENES.tiempos, {
      ...(await obtener(ALMACENES.tiempos, tiempo.id)),
      calibrado,
    });

    // Recalibrar invalida lo que hubiera propuesto el análisis anterior.
    const intercambios = await listarPor(ALMACENES.intercambios, 'por-tiempo', tiempo.id);
    for (const intercambio of intercambios) {
      if (intercambio.propuesto) await borrar(ALMACENES.intercambios, intercambio.id);
    }

    const cuales = ['rojo', 'verde'].filter((color) => lamparas[color]);
    rellenar(resultadoFinal, [
      crear('p', {
        class: 'aviso-bueno',
        texto: cuales.length === 2
          ? 'Calibrado listo, con las dos lámparas localizadas. Ya puedes lanzar ' +
            'la detección.'
          : `Calibrado guardado con la lámpara ${cuales[0]} solamente: los tocados ` +
            'del otro color no se detectarán.',
      }),
      avisoDelBarrido ? crear('p', { class: 'ayuda', texto: avisoDelBarrido }) : null,
      plantilla && !sePuedeSeguir(plantilla) ? crear('p', {
        class: 'aviso',
        texto: 'Sin seguimiento: el análisis mirará siempre al mismo sitio del ' +
               'fotograma, así que sólo servirá si la cámara está en un trípode.',
      }) : null,
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Volver al vídeo',
        onclick: volver,
      }),
    ]);
  }
}
