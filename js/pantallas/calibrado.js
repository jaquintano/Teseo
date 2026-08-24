// Calibrado de la detección automática.
//
// Se le enseña a Teseo dónde está el marcador y de qué color es el usuario.
//
// Por qué hace falta una imagen de referencia
// -------------------------------------------
// Un marcador de competición no es una caja negra con dos bombillas: lleva el
// cronómetro en ámbar y el tanteo en rojo de siete segmentos, encendidos todo
// el rato y cambiando. Contar píxeles rojos dentro del recuadro sería contar
// el tanteo, y cada vez que alguien marca un punto habría un tocado falso.
//
// La salida es comparar dos capturas del MISMO recuadro: una con las lámparas
// apagadas —la referencia— y otra con una encendida. Lo que aparece entre las
// dos es la lámpara y sólo la lámpara, porque los dígitos están en las dos.
// Con eso se sabe dónde está cada una dentro del recuadro, y el análisis mira
// ahí y no en el resto.
//
// El recuadro es además la PLANTILLA con la que se reconoce el marcador
// después, y por eso se dibuja AJUSTADO al aparato. La primera versión pedía
// holgura para el temblor de la cámara; de eso se encarga ahora el
// seguimiento, y todo lo que sobre —pista, gente, fondo— cambia a lo largo del
// vídeo y estorba a las dos cosas: a la comparación con la referencia y al
// propio seguimiento.
//
// De ahí también que aquí mismo se use ya el seguimiento: el tocado con el que
// se localizan las lámparas se busca por todo el vídeo, y para cuando aparece,
// la cámara está en otro sitio.

import { anadir, crear, rellenar, cabecera, ir, desplegable, formatearSegundos } from '../ui.js';
import {
  ALMACENES, obtener, guardar, borrar, leerVideo, listarPor,
  colorDelAsalto, fijarColorDelAsalto,
} from '../db.js';
import { COLORES_LAMPARA, PREGUNTA_COLOR } from '../constantes.js';
import { recortar, guardarReferencia, loQueHaAparecido, conHolgura } from '../deteccion.js';
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

// Por debajo de esto, lo que ha aparecido son cuatro píxeles sueltos.
const MANCHA_INSUFICIENTE = 15;
const MANCHA_JUSTA = 40;

// Del tamaño de la lámpara, cuánto hay que ver encendido para darla por tal.
const PARTE_PARA_ENCENDER = 0.4;

// Con más de esto encendido a lo largo del vídeo, algo va mal.
const DEMASIADO_ENCENDIDO = 0.7;

const NUMERO = { rojo: 1, verde: 2 };

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
  let referencia = previo ? previo.referencia : null;
  // La plantilla con la que el análisis seguirá el marcador por el vídeo. Se
  // saca del mismo fotograma que la referencia, que es el que el usuario ha
  // elegido a conciencia para enmarcar.
  let plantilla = previo ? previo.plantilla || null : null;
  let lamparas = previo ? { ...previo.lamparas } : { rojo: null, verde: null };
  // Tu color no es cosa del calibrado: es del asalto entero, y lo normal es
  // que ya se haya contestado en la pantalla del vídeo. Aquí sólo se enseña, y
  // se puede corregir sin salir.
  let miColor = await colorDelAsalto(asalto);
  // Lo que se le dice al usuario del último intento de localizar.
  let ultimoIntento = null;
  // Dónde estaba el marcador la última vez que se buscó una lámpara. Puede no
  // ser el recuadro dibujado: el usuario busca los tocados por todo el vídeo y
  // para entonces la cámara se ha movido.
  let dondeSeMidio = null;

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
  video.addEventListener('seeked', () => { refrescarReloj(); olvidarDondeSeMidio(); });
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

  // --- Un dedo dibuja el recuadro; dos amplían la imagen ---
  //
  // Hacen falta las dos cosas y en la misma capa: el marcador sale pequeño en
  // un vídeo grabado de lejos, y encuadrarlo a pulso sobre una miniatura es
  // imposible. Se amplía con dos dedos, se ajusta con uno, y no hay botón de
  // volver al tamaño normal porque se vuelve con el mismo gesto de siempre:
  // juntando los dedos.
  let arrastrando = null;
  const dedos = new Map();
  let escala = 1;
  let despX = 0;
  let despY = 0;
  let distanciaInicial = 0;
  let escalaInicial = 1;

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
      const [a, b] = [...dedos.values()];
      distanciaInicial = Math.hypot(a.x - b.x, a.y - b.y);
      escalaInicial = escala;
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

    // Al empezar un recuadro nuevo se tira el de antes, pero no antes: si se
    // borrara en el pointerdown, un toque suelto dejaría la pantalla vacía.
    if (recuadro) { recuadro = null; dondeSeMidio = null; }
    recuadro = entreDosPuntos(arrastrando, puntoRelativo(evento));
    pintarMarcas();
  });

  const soltar = (evento) => {
    dedos.delete(evento.pointerId);
    if (dedos.size < 2) distanciaInicial = 0;
    if (escala <= 1.01) { escala = 1; despX = 0; despY = 0; aplicarZoom(); }

    if (!arrastrando) return;
    const desde = arrastrando;
    arrastrando = null;

    const trazado = entreDosPuntos(desde, puntoRelativo(evento));
    // Un toque sin arrastre no es un recuadro: no se toca lo que hubiera.
    if (trazado.ancho < 0.01 || trazado.alto < 0.01) { pintarMarcas(); return; }

    recuadro = trazado;
    // Al mover el recuadro, la referencia y las lámparas de antes ya no valen.
    referencia = null;
    plantilla = null;
    lamparas = { rojo: null, verde: null };
    dondeSeMidio = null;
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

  /** El recuadro y, encima, dónde cree Teseo que está cada lámpara. */
  function pintarMarcas() {
    dibujado.hidden = !recuadro;
    if (recuadro) colocar(dibujado, recuadro);

    for (const [color, marca] of [['rojo', marcaRoja], ['verde', marcaVerde]]) {
      const lampara = lamparas[color];
      marca.hidden = !(recuadro && lampara);
      if (recuadro && lampara) colocar(marca, enElFotograma(lampara.zona));
    }
  }

  /**
   * Deja de dibujar las lámparas donde se midieron.
   *
   * Se llama al moverse por el vídeo: las zonas se pintan sobre el fotograma
   * donde se localizaron, y dejarlas puestas mientras el usuario busca otro
   * tocado sería enseñarle una lámpara donde ya no hay ninguna.
   */
  function olvidarDondeSeMidio() {
    if (!dondeSeMidio) return;
    dondeSeMidio = null;
    pintarMarcas();
  }

  function colocar(elemento, caja) {
    elemento.style.left = `${caja.x * 100}%`;
    elemento.style.top = `${caja.y * 100}%`;
    elemento.style.width = `${caja.ancho * 100}%`;
    elemento.style.height = `${caja.alto * 100}%`;
  }

  /**
   * De coordenadas del recuadro a coordenadas del fotograma.
   *
   * Sobre el recuadro donde se midió, que es donde estaba el marcador en ese
   * momento; y si no se ha medido nada todavía, sobre el dibujado.
   */
  function enElFotograma(zona) {
    const donde = dondeSeMidio || recuadro;
    return {
      x: donde.x + zona.x * donde.ancho,
      y: donde.y + zona.y * donde.alto,
      ancho: zona.ancho * donde.ancho,
      alto: zona.alto * donde.alto,
    };
  }

  // --- Los pasos ---
  const pasos = crear('div');
  const resultadoFinal = crear('div');

  anadir(contenedor,
    crear('details', { class: 'filtros' }, [
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

  function ayuda() {
    return [
      'Teseo puede encontrar los tocados solo, mirando las lámparas del ' +
      'aparato: en espada hay una verde y una roja, y se encienden en el ' +
      'momento del tocado.',
      'El problema es que el marcador tiene también el cronómetro y el tanteo ' +
      'encendidos todo el rato, y en los mismos colores. Por eso el calibrado ' +
      'se hace en dos capturas: una con las lámparas apagadas y otra con una ' +
      'encendida. Lo que aparece entre las dos es la lámpara, y ahí es donde ' +
      'mirará Teseo. Los dígitos quedan fuera.',
      'Si el marcador se ve pequeño, amplía la imagen con dos dedos antes de ' +
      'encuadrarlo: con un dedo se dibuja el recuadro y con dos se amplía y se ' +
      'pasea. Para volver al tamaño normal, junta los dedos.',
      'Ajusta el recuadro al aparato: que entre el marcador entero y poco más. ' +
      'No hace falta dejar holgura para el temblor de la cámara —de eso se ' +
      'encarga el seguimiento—, y todo lo que metas de más juega en contra: la ' +
      'pista, la gente y el fondo cambian a lo largo del vídeo, y lo que cambia ' +
      'estorba tanto a la comparación con la referencia como al seguimiento. Lo ' +
      'único que no vale es un recuadro liso, sin dibujo que reconocer.',
      'De la resolución depende todo. Las lámparas del aparato son pequeñas, y ' +
      'en un vídeo de baja calidad acaban siendo cuatro píxeles que se ' +
      'confunden con cualquier reflejo. Graba a 720p o más, y si puedes, con ' +
      'el marcador cerca.',
      'Si el tirador se pone delante del aparato, Teseo se queda sin ver ' +
      'durante ese rato y lo vuelve a buscar en cuanto reaparece. Los tocados ' +
      'que caigan en un hueco se proponen igual, pero con el instante marcado ' +
      'con ≈ porque sólo se sabe aproximadamente cuándo fueron.',
      'Un consejo: toma la referencia apagada justo antes del tocado que vayas ' +
      'a usar. Si entre las dos capturas cambia el tanteo, ese dígito también ' +
      'aparece en la comparación y puede confundirse con una lámpara. Por eso ' +
      'Teseo te dibuja encima del vídeo lo que ha encontrado: míralo.',
      'Si en tu vídeo no se ve el marcador, esta función no se puede usar: hay ' +
      'que etiquetar a mano, como siempre. No pasa nada.',
    ].map((texto) => crear('p', { class: 'texto-ayuda', texto }));
  }

  function recorteDeAhora() {
    const lienzo = document.createElement('canvas');
    return recortar(video, recuadro, lienzo);
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

  function pintarPasos() {
    const problema = queLeFaltaAlRecuadro();
    const { ancho, alto } = tamanoDelRecuadro();
    const localizadas = ['rojo', 'verde'].filter((color) => lamparas[color]);
    const resolucion = queTalLaResolucion();
    const seguimiento = queTalElSeguimiento();

    rellenar(pasos, [
      resolucion ? crear('p', {
        class: resolucion.bien ? 'ayuda' : 'aviso', texto: resolucion.texto,
      }) : null,

      crear('h3', { class: 'subtitulo-seccion', texto: '1. Enmarca el aparato, ajustado' }),
      crear('p', {
        class: problema ? 'aviso' : 'ayuda',
        texto: problema || `Recuadro puesto: ${ancho}×${alto} píxeles del vídeo.`,
      }),

      crear('h3', { class: 'subtitulo-seccion', texto: '2. Con las lámparas apagadas' }),
      crear('p', {
        class: 'ayuda',
        texto: 'Busca un momento sin ningún tocado —mejor justo antes del que ' +
               'vayas a usar en el paso 3— y guarda la referencia.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-compacto', texto: 'Guardar la referencia',
        onclick: guardarLaReferencia,
      }),
      referencia ? crear('p', {
        class: 'aviso-bueno',
        texto: `Referencia guardada del segundo ${referencia.instante.toFixed(2)}.`,
      }) : null,
      seguimiento ? crear('p', {
        class: seguimiento.bien ? 'ayuda' : 'aviso', texto: seguimiento.texto,
      }) : null,

      crear('h3', { class: 'subtitulo-seccion', texto: '3. Localiza las lámparas' }),
      crear('p', {
        class: 'ayuda',
        texto: 'Busca un tocado y pulsa. Teseo comparará con la referencia y te ' +
               'dibujará encima del vídeo lo que haya encontrado. Repítelo con ' +
               'un tocado del otro color, o hazlo en un doble y salen las dos.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-compacto', texto: 'Buscar lámparas aquí',
        onclick: localizarLamparas,
      }),
      ...['rojo', 'verde'].map((color) => {
        const lampara = lamparas[color];
        return crear('p', {
          class: lampara ? 'aviso-bueno' : 'ayuda',
          texto: lampara
            ? `Lámpara ${color}: ${lampara.pixeles} píxeles, ${dondeCae(lampara.zona)} ` +
              `del recuadro. Compruébalo en el vídeo.`
            : `Lámpara ${color}: sin localizar.`,
        });
      }),
      ultimoIntento ? crear('p', { class: 'aviso', texto: ultimoIntento }) : null,

      crear('h3', { class: 'subtitulo-seccion', texto: '4. Tu color' }),
      crear('p', {
        class: miColor ? 'ayuda' : 'aviso',
        texto: miColor
          ? 'Es el del asalto entero, así que vale para todos sus tiempos. ' +
            'Cambiarlo aquí lo cambia en todas partes.'
          : 'Sin esto se pueden detectar los tocados pero no saber de quién son.',
      }),
      desplegable(PREGUNTA_COLOR, COLORES_LAMPARA, miColor,
        (valor) => { fijarColor(valor); }, { vacio: '— Elige —' }).bloque,

      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Guardar el calibrado',
        onclick: () => guardarCalibrado(),
      }),

      localizadas.length === 1 ? crear('p', {
        class: 'ayuda',
        texto: `Sólo está localizada la lámpara ${localizadas[0]}, así que sólo se ` +
               'detectarán esos tocados. Se puede guardar así y completarlo luego.',
      }) : null,
    ]);
  }

  /** Tu color se guarda en el asalto en cuanto se elige, no al guardar. */
  async function fijarColor(valor) {
    miColor = valor || null;
    if (valor && asalto) await fijarColorDelAsalto(asalto, valor);
    pintarPasos();
  }

  function guardarLaReferencia() {
    ultimoIntento = queLeFaltaAlRecuadro();
    if (ultimoIntento) { pintarPasos(); return; }

    const imagen = recorteDeAhora();
    if (!imagen) return;

    referencia = { ...guardarReferencia(imagen), instante: video.currentTime };
    dondeSeMidio = null;

    // Y del mismo fotograma, la plantilla del seguimiento: lo que hay dentro
    // del recuadro en gris, para reconocerlo luego en cualquier parte del
    // encuadre.
    const escena = escenaDe(video, document.createElement('canvas'));
    plantilla = escena ? plantillaDesde(escena, recuadro) : null;

    // Con referencia nueva, lo localizado antes puede no cuadrar.
    lamparas = { rojo: null, verde: null };
    pintarMarcas();
    pintarPasos();
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

  /**
   * El recorte de ahora, con el recuadro puesto donde esté el marcador.
   *
   * Un tocado se busca por todo el vídeo, y para cuando se encuentra la cámara
   * está en otro sitio: comparar con la referencia el recuadro dibujado sería
   * comparar dos trozos distintos de la sala, y ahí "aparece" media pista.
   */
  function recorteDelMarcador() {
    if (!plantilla) return { imagen: recorteDeAhora(), donde: recuadro, movido: false };

    const seguidor = crearSeguidor(plantilla, recuadro);
    const encontrado = seguidor.situar(escenaDe(video, document.createElement('canvas')));
    if (encontrado.estado === 'perdido') return { imagen: null, donde: null, movido: false };

    const donde = encontrado.estado === 'imposible' ? recuadro : encontrado.recuadro;
    const movido = Math.abs(donde.x - recuadro.x) > 0.005 || Math.abs(donde.y - recuadro.y) > 0.005;
    return {
      imagen: recortar(video, donde, document.createElement('canvas')), donde, movido,
    };
  }

  function localizarLamparas() {
    ultimoIntento = queLeFaltaAlRecuadro();
    if (ultimoIntento) { pintarPasos(); return; }

    if (!referencia) {
      ultimoIntento = 'Antes hay que guardar la referencia con las lámparas apagadas (paso 2).';
      pintarPasos();
      return;
    }

    const { imagen, donde, movido } = recorteDelMarcador();
    if (!imagen) {
      ultimoIntento = 'Aquí no se reconoce el marcador: puede que lo tape alguien o ' +
                      'que se haya salido del encuadre. Busca un tocado en el que se vea.';
      pintarPasos();
      return;
    }
    dondeSeMidio = donde;

    const encontradas = [];
    for (const color of ['rojo', 'verde']) {
      const aparecido = loQueHaAparecido(imagen, referencia, NUMERO[color]);
      if (aparecido.mancha < MANCHA_INSUFICIENTE) continue;

      // Nos quedamos con la mayor mancha que hayamos visto de cada color.
      //
      // Al medir en un tocado verde, en el rojo aparece el dígito del tanteo
      // que acaba de cambiar: una mancha pequeña, pero mancha. Sin esto,
      // esos veinte píxeles pisaban la lámpara roja buena de trescientos que
      // ya estaba localizada.
      if (lamparas[color] && lamparas[color].pixeles >= aparecido.mancha) continue;

      lamparas[color] = {
        zona: conHolgura(aparecido.zona),
        zonaMedida: aparecido.zona,
        pixeles: aparecido.mancha,
        umbral: Math.max(MANCHA_INSUFICIENTE, Math.round(aparecido.mancha * PARTE_PARA_ENCENDER)),
        instante: video.currentTime,
      };
      encontradas.push(color);
    }

    const aviso = encontradas.length === 0
      ? 'Aquí no ha aparecido nada nuevo, o lo que hay es más pequeño que lo ya ' +
        'localizado. ¿Hay alguna lámpara encendida en este momento? Prueba en ' +
        'otro tocado.'
      : encontradas.some((color) => lamparas[color].pixeles < MANCHA_JUSTA)
        ? 'Localizada, pero la mancha es pequeña y la detección irá justa: ' +
          'habrá falsos positivos. La próxima vez graba a más resolución (720p ' +
          'o más) o más cerca del marcador.'
        : null;

    // Si el marcador no estaba donde se enmarcó, conviene decirlo: lo que se
    // dibuja encima del vídeo sale entonces fuera del recuadro, y sin
    // explicación parece un fallo.
    const nota = movido && encontradas.length > 0
      ? 'El marcador se ha reconocido desplazado —la cámara se ha movido desde ' +
        'la referencia—, y ahí es donde se ha medido.'
      : null;
    ultimoIntento = [aviso, nota].filter(Boolean).join(' ') || null;

    pintarMarcas();
    pintarPasos();
  }

  async function guardarCalibrado(saltarBarrido = false) {
    const problema = queLeFaltaAlRecuadro();
    if (problema) { rellenar(resultadoFinal, crear('p', { class: 'aviso', texto: problema })); return; }

    if (!referencia) {
      rellenar(resultadoFinal, crear('p', {
        class: 'aviso', texto: 'Falta la referencia con las lámparas apagadas (paso 2).',
      }));
      return;
    }
    if (!lamparas.rojo && !lamparas.verde) {
      rellenar(resultadoFinal, crear('p', {
        class: 'aviso',
        texto: 'No hay ninguna lámpara localizada (paso 3). Sin eso Teseo no sabe ' +
               'dónde mirar, y contar todo el recuadro sería contar el tanteo.',
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
      recuadro, miColor, referencia, lamparas, plantilla,
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
                   'del marcador y a tomar la referencia en un momento bien visible.',
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
                   'probable es que lo localizado en el paso 3 no sea una lámpara ' +
                   'sino un dígito. Míralo en el vídeo y repite ese paso.',
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
