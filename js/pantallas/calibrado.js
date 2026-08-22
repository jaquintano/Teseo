// Calibrado de la detección automática.
//
// Se le enseña a Teseo dónde está el marcador del aparato y de qué color es
// el usuario. Con eso, y sólo con eso, puede buscar los tocados solo.
//
// Por qué se mide dos veces
// -------------------------
// APAGADO da la línea base: cuántos píxeles rojizos y verdosos tiene el
// recuadro cuando no hay ninguna lámpara. Es lo que descubre que dentro del
// recuadro hay un marcador de siete segmentos en rojo, una bandera o un
// maillot, que arruinarían el análisis.
//
// ENCENDIDO da la escala: si apagado son 3 píxeles y encendido son 240, el
// umbral se pone solo. Sin esta segunda medida habría que inventarse un
// número absoluto, que es justo lo que no funciona cuando el móvil reajusta
// el brillo de la escena.
//
// El primer paso es obligatorio; el segundo, muy recomendable pero saltable:
// hay vídeos donde no se ve ninguna lámpara encendida en ningún momento.

import { anadir, crear, rellenar, cabecera, ir, desplegable, formatearSegundos } from '../ui.js';
import { ALMACENES, obtener, guardar, borrar, leerVideo, listarPor } from '../db.js';
import { recortar, medirMancha, contarColores } from '../deteccion.js';
import { buscarFalsosPositivos } from '../analisis.js';

// Un recuadro más pequeño que esto en píxeles del vídeo no da para nada: el
// marcador ocupa cuatro píxeles y no hay detección posible.
const ANCHO_MINIMO = 60;
const ALTO_MINIMO = 40;

// Y uno que se coma más de la mitad del fotograma no está enmarcando el
// aparato, está enmarcando la pista.
const PARTE_MAXIMA = 0.5;

// Por debajo de esto, la mancha de la lámpara son cuatro píxeles sueltos.
const MANCHA_INSUFICIENTE = 15;
const MANCHA_JUSTA = 40;

// Con el recuadro medido apagado y encendido, el umbral va a media altura
// larga entre los dos: lo bastante arriba para no saltar con el ruido.
const PARTE_DEL_SALTO = 0.4;

// A partir de aquí, el barrido por el vídeo entero huele a que dentro del
// recuadro hay algo de color permanente. No es medio vídeo: en un asalto de
// verdad las lámparas se quedan puestas hasta que el árbitro rearma, y entre
// eso y quince tocados se llega al 40 % sin que nada vaya mal.
const DEMASIADO_ENCENDIDO = 0.7;

const COLORES = [
  { id: 'verde', etiqueta: 'Verde' },
  { id: 'rojo', etiqueta: 'Rojo' },
];

export async function pantallaCalibrado(contenedor, datos = {}) {
  const tiempo = await obtener(ALMACENES.tiempos, datos.tiempoId);
  if (!tiempo) { ir('inicio'); return; }

  const volver = () => ir('etiquetado', { tiempoId: tiempo.id, asaltoId: tiempo.asaltoId });

  anadir(contenedor, cabecera('Calibrado', volver));

  if (!tiempo.totalTrozos) {
    anadir(contenedor, crear('p', {
      class: 'aviso',
      texto: 'Este tiempo ya no tiene vídeo guardado, así que no hay nada que ' +
             'calibrar.',
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
  let base = previo ? previo.base : null;
  let encendido = previo ? previo.encendido : null;
  let miColor = previo ? previo.miColor : null;

  // --- El vídeo, con lo justo para moverse por él ---
  const video = crear('video', { class: 'video-calibrado', playsinline: true, muted: true });
  video.src = URL.createObjectURL(fichero);

  const dibujado = crear('div', { class: 'recuadro-dibujado', hidden: true });
  const capa = crear('div', { class: 'capa-recuadro' }, [dibujado]);
  const marco = crear('div', { class: 'marco-calibrado' }, [video, capa]);

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
  video.addEventListener('seeked', refrescarReloj);
  video.addEventListener('loadedmetadata', () => { refrescarReloj(); pintarRecuadro(); });
  video.addEventListener('play', () => { btnPlay.textContent = 'Pausa'; });
  video.addEventListener('pause', () => { btnPlay.textContent = 'Reproducir'; });

  function refrescarReloj() {
    reloj.textContent = `${video.currentTime.toFixed(2)} s / ${formatearSegundos(video.duration || 0)}`;
    if (video.duration) posicion.value = String((video.currentTime / video.duration) * 1000);
  }

  // --- Dibujar el recuadro con el dedo ---
  let arrastrando = null;

  capa.addEventListener('pointerdown', (evento) => {
    // Capturar el puntero mantiene el trazo aunque el dedo se salga del
    // vídeo. Si el navegador no deja, se dibuja igual.
    try { capa.setPointerCapture(evento.pointerId); } catch { /* da igual */ }
    arrastrando = puntoRelativo(evento);
    recuadro = null;
    pintarRecuadro();
  });

  capa.addEventListener('pointermove', (evento) => {
    if (!arrastrando) return;
    recuadro = entreDosPuntos(arrastrando, puntoRelativo(evento));
    pintarRecuadro();
  });

  const soltar = (evento) => {
    if (!arrastrando) return;
    arrastrando = null;
    recuadro = entreDosPuntos(recuadro ? { x: recuadro.x, y: recuadro.y } : puntoRelativo(evento),
                              puntoRelativo(evento));
    // Al cambiar el recuadro, lo medido antes ya no vale.
    base = null;
    encendido = null;
    pintarRecuadro();
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

  function pintarRecuadro() {
    dibujado.hidden = !recuadro;
    if (!recuadro) return;
    dibujado.style.left = `${recuadro.x * 100}%`;
    dibujado.style.top = `${recuadro.y * 100}%`;
    dibujado.style.width = `${recuadro.ancho * 100}%`;
    dibujado.style.height = `${recuadro.alto * 100}%`;
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
      'Para eso necesita saber dónde mirar. Eso es el calibrado: buscar un ' +
      'momento donde se vea el marcador y enmarcarlo con el dedo.',
      'Enmárcalo con holgura, bastante mayor que el aparato. La cámara se ' +
      'mueve aunque no quieras, y así el marcador no se sale del recuadro.',
      'Se mide dos veces. Primero con las lámparas apagadas, para saber qué ' +
      'hay ahí cuando no pasa nada. Después con una encendida, para saber ' +
      'cómo se ve una de verdad. El segundo paso se puede saltar, pero ' +
      'entonces Teseo no puede comprobar nada.',
      'Si en tu vídeo no se ve el marcador, esta función no se puede usar: ' +
      'hay que etiquetar a mano, como siempre. No pasa nada.',
    ].map((texto) => crear('p', { class: 'texto-ayuda', texto }));
  }

  /** Mide el recuadro en el fotograma que se está viendo. */
  function medirAhora() {
    const lienzo = document.createElement('canvas');
    const imagen = recortar(video, recuadro, lienzo);
    if (!imagen) return null;

    return {
      rojo: medirMancha(imagen, 1),
      verde: medirMancha(imagen, 2),
      pixelesDelRecorte: imagen.width * imagen.height,
    };
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
      return 'Dibuja un recuadro sobre el marcador arrastrando el dedo por el vídeo.';
    }

    const { ancho, alto, parte } = tamanoDelRecuadro();
    if (ancho < ANCHO_MINIMO || alto < ALTO_MINIMO) {
      return `El recuadro es demasiado pequeño: ${ancho}×${alto} píxeles del ` +
             `vídeo, y hacen falta al menos ${ANCHO_MINIMO}×${ALTO_MINIMO}. Si ` +
             'el marcador se ve así de pequeño, la solución es grabar más cerca.';
    }
    if (parte > PARTE_MAXIMA) {
      return 'El recuadro se come más de la mitad del fotograma. Así no enmarca ' +
             'el aparato, enmarca la pista: cualquier cosa roja o verde que pase ' +
             'por ahí valdrá por una lámpara.';
    }
    return null;
  }

  function pintarPasos() {
    const problema = queLeFaltaAlRecuadro();
    const { ancho, alto } = tamanoDelRecuadro();

    rellenar(pasos, [
      crear('h3', { class: 'subtitulo-seccion', texto: '1. Enmarca el marcador' }),
      crear('p', {
        class: problema ? 'aviso' : 'ayuda',
        texto: problema || `Recuadro puesto: ${ancho}×${alto} píxeles del vídeo.`,
      }),

      crear('h3', { class: 'subtitulo-seccion', texto: '2. Con las lámparas apagadas' }),
      crear('p', {
        class: 'ayuda',
        texto: 'Busca un momento en el que no haya ninguna lámpara encendida y ' +
               'mide. Sirve para saber qué hay dentro del recuadro cuando no ' +
               'pasa nada.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-compacto', texto: 'Medir con el marcador apagado',
        onclick: medirApagado,
      }),
      base ? crear('p', {
        class: base.aviso ? 'aviso' : 'aviso-bueno',
        texto: base.aviso || `Apagado: ${base.rojo} píxeles rojos y ${base.verde} verdes. Bien.`,
      }) : null,

      crear('h3', { class: 'subtitulo-seccion', texto: '3. Con una lámpara encendida' }),
      crear('p', {
        class: 'ayuda',
        texto: 'Muy recomendable: es lo único que permite comprobar que la ' +
               'detección funciona de verdad en este vídeo. Busca un tocado y ' +
               'mide con la lámpara puesta.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-compacto', texto: 'Medir con una lámpara encendida',
        onclick: medirEncendido,
      }),
      encendido ? crear('p', {
        class: encendido.problema ? 'aviso' : 'aviso-bueno',
        texto: encendido.problema
          || `Lámpara ${encendido.color}: mancha de ${encendido.mancha} píxeles` +
             `${encendido.mancha < MANCHA_JUSTA ? ', que es poco pero puede valer' : ''}.`,
      }) : null,

      desplegable('4. ¿De qué color eres tú?', COLORES, miColor,
        (valor) => { miColor = valor; }, { vacio: '— Elige —' }).bloque,

      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Guardar el calibrado',
        onclick: guardarCalibrado,
      }),
    ]);
  }

  function medirApagado() {
    const problema = queLeFaltaAlRecuadro();
    if (problema) { pintarPasos(); return; }

    const medida = medirAhora();
    if (!medida) return;

    // Una mancha grande con todo apagado sólo puede ser algo que está ahí
    // siempre: el marcador de puntos, una bandera, un maillot.
    const mayor = Math.max(medida.rojo.mancha, medida.verde.mancha);
    base = {
      rojo: medida.rojo.pixeles,
      verde: medida.verde.pixeles,
      instante: video.currentTime,
      aviso: mayor >= MANCHA_JUSTA
        ? `Con el marcador apagado ya hay una mancha de ${mayor} píxeles de ` +
          'color dentro del recuadro. O hay una lámpara encendida en este ' +
          'momento, o dentro del recuadro hay algo rojo o verde que va a ' +
          'confundirse con una. Prueba a ajustar el recuadro o a buscar otro ' +
          'momento.'
        : null,
    };
    pintarPasos();
  }

  function medirEncendido() {
    const problema = queLeFaltaAlRecuadro();
    if (problema) { pintarPasos(); return; }

    const medida = medirAhora();
    if (!medida) return;

    const gana = medida.rojo.mancha >= medida.verde.mancha ? 'rojo' : 'verde';
    const mancha = medida[gana].mancha;

    if (mancha < MANCHA_INSUFICIENTE) {
      encendido = {
        problema: `No se ve ninguna lámpara aquí: lo más grande que hay son ` +
                  `${mancha} píxeles de color, y eso no es una lámpara. Busca ` +
                  'un momento con un tocado, o salta este paso.',
      };
    } else {
      encendido = {
        color: gana,
        mancha,
        pixeles: medida[gana].pixeles,
        instante: video.currentTime,
      };
    }
    pintarPasos();
  }

  /** El umbral que separa "encendida" de "apagada", en píxeles. */
  function calcularUmbral() {
    if (encendido && !encendido.problema) {
      const suelo = base[encendido.color];
      const salto = Math.max(1, encendido.pixeles - suelo);
      const umbral = Math.max(MANCHA_INSUFICIENTE, Math.round(suelo + salto * PARTE_DEL_SALTO));
      return { rojo: umbral, verde: umbral };
    }

    // Sin lámpara medida hay que adivinar: el triple de lo que hay apagado,
    // y nunca menos de una mancha mínima.
    return {
      rojo: Math.max(25, base.rojo * 3),
      verde: Math.max(25, base.verde * 3),
    };
  }

  async function guardarCalibrado(saltarBarrido = false) {
    const problema = queLeFaltaAlRecuadro();
    if (problema) { rellenar(resultadoFinal, crear('p', { class: 'aviso', texto: problema })); return; }
    if (!base) {
      rellenar(resultadoFinal, crear('p', {
        class: 'aviso', texto: 'Falta medir con el marcador apagado (paso 2).',
      }));
      return;
    }
    if (!miColor) {
      rellenar(resultadoFinal, crear('p', {
        class: 'aviso',
        texto: 'Falta decir de qué color eres tú (paso 4). Sin eso se pueden ' +
               'detectar los tocados pero no saber de quién son.',
      }));
      return;
    }

    const calibrado = {
      recuadro,
      miColor,
      base: { rojo: base.rojo, verde: base.verde },
      encendido: encendido && !encendido.problema ? encendido : null,
      umbral: calcularUmbral(),
      instante: video.currentTime,
      fechaISO: new Date().toISOString(),
    };

    rellenar(resultadoFinal, crear('p', {
      class: 'ayuda', texto: 'Comprobando el recuadro en todo el vídeo…',
    }));

    if (!saltarBarrido) {
      const barrido = await buscarFalsosPositivos({ video, calibrado });
      const parte = barrido.mirados > 0 ? barrido.encendidos / barrido.mirados : 0;

      if (parte > DEMASIADO_ENCENDIDO) {
        rellenar(resultadoFinal, [
          crear('p', {
            class: 'aviso',
            texto: `En ${barrido.encendidos} de ${barrido.mirados} momentos repartidos ` +
                   'por el vídeo parecería haber una lámpara encendida. Lo normal ' +
                   'es que dentro del recuadro haya algo rojo o verde permanente ' +
                   '—una bandera, un maillot, el marcador de puntos— y entonces ' +
                   'la detección va a dar basura. Ajusta el recuadro.',
          }),
          crear('p', {
            class: 'ayuda',
            texto: 'Si sabes que en este vídeo las lámparas se quedan encendidas ' +
                   'mucho rato, puede ser normal y se puede seguir.',
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

    rellenar(resultadoFinal, [
      crear('p', {
        class: 'aviso-bueno',
        texto: encendido && !encendido.problema
          ? `Calibrado listo. Se ve la lámpara ${encendido.color} con una mancha ` +
            `de ${encendido.mancha} píxeles, y el umbral queda en ` +
            `${calibrado.umbral.rojo}. Ya puedes lanzar la detección.`
          : 'Calibrado guardado, pero sin comprobar: no se ha medido ninguna ' +
            'lámpara encendida, así que el umbral es una estimación. Puede que ' +
            'la detección no encuentre nada.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Volver al vídeo',
        onclick: volver,
      }),
    ]);
  }
}
