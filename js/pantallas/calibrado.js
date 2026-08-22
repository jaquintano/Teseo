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
// Por eso el recuadro se dibuja GRANDE, alrededor de todo el aparato: da
// holgura para que la cámara se mueva, y de paso será la plantilla del
// seguimiento cuando llegue.

import { anadir, crear, rellenar, cabecera, ir, desplegable, formatearSegundos } from '../ui.js';
import { ALMACENES, obtener, guardar, borrar, leerVideo, listarPor } from '../db.js';
import { recortar, guardarReferencia, loQueHaAparecido, conHolgura } from '../deteccion.js';
import { buscarFalsosPositivos } from '../analisis.js';

// Un recuadro más pequeño que esto en píxeles del vídeo no da para nada.
const ANCHO_MINIMO = 60;
const ALTO_MINIMO = 40;

// Y uno que se coma más de la mitad del fotograma no enmarca el aparato.
const PARTE_MAXIMA = 0.5;

// Por debajo de esto, lo que ha aparecido son cuatro píxeles sueltos.
const MANCHA_INSUFICIENTE = 15;
const MANCHA_JUSTA = 40;

// Del tamaño de la lámpara, cuánto hay que ver encendido para darla por tal.
const PARTE_PARA_ENCENDER = 0.4;

// Con más de esto encendido a lo largo del vídeo, algo va mal.
const DEMASIADO_ENCENDIDO = 0.7;

const COLORES = [
  { id: 'verde', etiqueta: 'Verde' },
  { id: 'rojo', etiqueta: 'Rojo' },
];

const NUMERO = { rojo: 1, verde: 2 };

export async function pantallaCalibrado(contenedor, datos = {}) {
  const tiempo = await obtener(ALMACENES.tiempos, datos.tiempoId);
  if (!tiempo) { ir('inicio'); return; }

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
  let lamparas = previo ? { ...previo.lamparas } : { rojo: null, verde: null };
  let miColor = previo ? previo.miColor : null;
  // Lo que se le dice al usuario del último intento de localizar.
  let ultimoIntento = null;

  // --- El vídeo, con lo justo para moverse por él ---
  const video = crear('video', { class: 'video-calibrado', playsinline: true, muted: true });
  video.src = URL.createObjectURL(fichero);

  const dibujado = crear('div', { class: 'recuadro-dibujado', hidden: true });
  const marcaRoja = crear('div', { class: 'zona-lampara zona-roja', hidden: true });
  const marcaVerde = crear('div', { class: 'zona-lampara zona-verde', hidden: true });
  const capa = crear('div', { class: 'capa-recuadro' }, [dibujado, marcaRoja, marcaVerde]);
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
  video.addEventListener('loadedmetadata', () => { refrescarReloj(); pintarMarcas(); });
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
    pintarMarcas();
  });

  capa.addEventListener('pointermove', (evento) => {
    if (!arrastrando) return;
    recuadro = entreDosPuntos(arrastrando, puntoRelativo(evento));
    pintarMarcas();
  });

  const soltar = (evento) => {
    if (!arrastrando) return;
    const desde = arrastrando;
    arrastrando = null;
    recuadro = entreDosPuntos(desde, puntoRelativo(evento));
    // Al mover el recuadro, la referencia y las lámparas de antes ya no valen.
    referencia = null;
    lamparas = { rojo: null, verde: null };
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

  function colocar(elemento, caja) {
    elemento.style.left = `${caja.x * 100}%`;
    elemento.style.top = `${caja.y * 100}%`;
    elemento.style.width = `${caja.ancho * 100}%`;
    elemento.style.height = `${caja.alto * 100}%`;
  }

  /** De coordenadas del recuadro a coordenadas del fotograma. */
  function enElFotograma(zona) {
    return {
      x: recuadro.x + zona.x * recuadro.ancho,
      y: recuadro.y + zona.y * recuadro.alto,
      ancho: zona.ancho * recuadro.ancho,
      alto: zona.alto * recuadro.alto,
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
      'Enmarca el aparato ENTERO y con holgura, no las bombillas. La cámara se ' +
      'mueve aunque no quieras, y cuanto más grande sea el recuadro, más ' +
      'margen hay.',
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
      return 'Dibuja un recuadro alrededor del aparato arrastrando el dedo por el vídeo.';
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

  function pintarPasos() {
    const problema = queLeFaltaAlRecuadro();
    const { ancho, alto } = tamanoDelRecuadro();
    const localizadas = ['rojo', 'verde'].filter((color) => lamparas[color]);

    rellenar(pasos, [
      crear('h3', { class: 'subtitulo-seccion', texto: '1. Enmarca el aparato entero' }),
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

      desplegable('4. ¿De qué color eres tú?', COLORES, miColor,
        (valor) => { miColor = valor; }, { vacio: '— Elige —' }).bloque,

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

  function guardarLaReferencia() {
    ultimoIntento = queLeFaltaAlRecuadro();
    if (ultimoIntento) { pintarPasos(); return; }

    const imagen = recorteDeAhora();
    if (!imagen) return;

    referencia = { ...guardarReferencia(imagen), instante: video.currentTime };
    // Con referencia nueva, lo localizado antes puede no cuadrar.
    lamparas = { rojo: null, verde: null };
    pintarMarcas();
    pintarPasos();
  }

  function localizarLamparas() {
    ultimoIntento = queLeFaltaAlRecuadro();
    if (ultimoIntento) { pintarPasos(); return; }

    if (!referencia) {
      ultimoIntento = 'Antes hay que guardar la referencia con las lámparas apagadas (paso 2).';
      pintarPasos();
      return;
    }

    const imagen = recorteDeAhora();
    if (!imagen) return;

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

    ultimoIntento = encontradas.length === 0
      ? 'Aquí no ha aparecido nada nuevo, o lo que hay es más pequeño que lo ya ' +
        'localizado. ¿Hay alguna lámpara encendida en este momento? Prueba en ' +
        'otro tocado.'
      : encontradas.some((color) => lamparas[color].pixeles < MANCHA_JUSTA)
        ? 'Localizada, pero la mancha es pequeña y la detección irá justa. Si ' +
          'puedes, graba más cerca del marcador la próxima vez.'
        : null;

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
        texto: 'Falta decir de qué color eres tú (paso 4). Sin eso se pueden ' +
               'detectar los tocados pero no saber de quién son.',
      }));
      return;
    }

    const calibrado = {
      recuadro, miColor, referencia, lamparas,
      instante: video.currentTime,
      fechaISO: new Date().toISOString(),
    };

    if (!saltarBarrido) {
      rellenar(resultadoFinal, crear('p', {
        class: 'ayuda', texto: 'Comprobando el recuadro en todo el vídeo…',
      }));

      const barrido = await buscarFalsosPositivos({ video, calibrado });
      const parte = barrido.mirados > 0 ? barrido.encendidos / barrido.mirados : 0;

      if (parte > DEMASIADO_ENCENDIDO) {
        rellenar(resultadoFinal, [
          crear('p', {
            class: 'aviso',
            texto: `En ${barrido.encendidos} de ${barrido.mirados} momentos repartidos ` +
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
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Volver al vídeo',
        onclick: volver,
      }),
    ]);
  }
}
