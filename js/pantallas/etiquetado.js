// Pantalla de etiquetado. El corazón de Teseo.
//
// Cómo se usa
// -----------
// Reproduces, pausas donde ha pasado algo, afinas con los saltos de ±0,1 s y
// pulsas "Nuevo intercambio". Eso crea una marca en ese instante exacto y
// abre las tres capas de botones. Cada toque se guarda solo: no hay que
// acordarse de guardar nada.
//
// Las tres capas describen lo que hiciste TÚ, no el rival. Si atacaste,
// rellenas la fila ofensiva; si defendiste, la defensiva. Cualquiera de las
// tres puede quedarse vacía, y volver a pulsar un botón ya elegido lo
// deselecciona.
//
// La línea de tiempo de debajo del vídeo lleva una marca por intercambio,
// con el color de la LÁMPARA que se encendió: si tu lámpara es la roja, tus
// tocados salen en rojo. Por eso lo primero que se pregunta es de qué color
// eras tú, y sin contestarlo no se puede etiquetar. Tocar una marca te lleva
// a ese instante; tocar la línea en cualquier otro sitio, a ese momento del
// vídeo.
//
// Y debajo va lo mismo en forma de tabla, que con el dedo es más fácil de
// acertar que una marca de catorce píxeles: cada fila lleva su instante, su
// resultado con el color de la marca y cómo iba el marcador.
//
// Navegar y editar están separados a propósito. Tocar una fila —o una marca,
// o la línea— sólo lleva el vídeo a ese instante: repasar el asalto no tiene
// por qué abrir nada. Para corregir una etiqueta está el lápiz de su fila, y
// entonces sí se abre la ficha, que es una ventana encima de todo.

import {
  anadir, crear, rellenar, cabecera, ir, desplegable,
  formatearBytes, formatearSegundos,
} from '../ui.js';
import {
  ACCIONES_OFENSIVAS, ACCIONES_DEFENSIVAS, RESULTADOS,
  RESULTADOS_CON_TOCADO, ZONAS_CUERPO, ZONAS_PISTA, etiquetaDe,
  COLORES_LAMPARA, PREGUNTA_COLOR, colorDeLaLampara,
} from '../constantes.js';
import {
  ALMACENES, obtener, guardar, borrar, listarPor, leerVideo,
  colorDelAsalto, fijarColorDelAsalto,
} from '../db.js';
import { crearReproductor } from '../video.js';
import { tanteosDeLosTiempos, tanteoCorrido, tanteoEn, situacionDe } from '../tanteo.js';
import { analizar } from '../analisis.js';

/** Una propuesta de la detección automática no mueve el marcador. */
const cuentaParaElMarcador = (intercambio) => !intercambio.propuesto;

// Cuánto se ve de un intercambio al tocarlo: un par de segundos de carrerilla
// para entender de dónde viene la acción, y medio segundo detrás para ver cómo
// acaba. Se para solo.
const SEGUNDOS_ANTES = 2;
const SEGUNDOS_DESPUES = 0.5;

// El reproductor de la pantalla, para soltarlo al salir y no dejar cientos
// de megas ocupando memoria.
let reproductorActivo = null;

// El análisis automático, si hay uno corriendo. Se para al salir: si no,
// seguiría reproduciendo un vídeo invisible en otra pantalla.
let analisisActivo = null;

export function soltarReproductor() {
  if (analisisActivo) {
    analisisActivo.cancelar();
    analisisActivo = null;
  }
  if (reproductorActivo) {
    reproductorActivo.destruir();
    reproductorActivo = null;
  }
}

/**
 * Con qué marcador se llega a un tiempo: el que dejaron los anteriores del
 * mismo asalto.
 *
 * Se cuenta tiempo a tiempo y no de un tirón por el asalto, porque los
 * intercambios más viejos pueden no llevar guardado de qué asalto son y se
 * quedarían fuera del índice.
 */
async function tanteoAlEmpezar(tiempo) {
  const tiempos = await listarPor(ALMACENES.tiempos, 'por-asalto', tiempo.asaltoId);

  const porTiempo = new Map();
  for (const otro of tiempos) {
    porTiempo.set(otro.id, await listarPor(ALMACENES.intercambios, 'por-tiempo', otro.id));
  }

  const tanteos = tanteosDeLosTiempos(tiempos, (otro) => porTiempo.get(otro.id) || []);
  return tanteos.get(tiempo.id) || { favor: 0, contra: 0 };
}

export async function pantallaEtiquetado(contenedor, datos = {}) {
  soltarReproductor();

  const tiempo = await obtener(ALMACENES.tiempos, datos.tiempoId);
  if (!tiempo) { ir('inicio'); return; }

  const asalto = await obtener(ALMACENES.asaltos, tiempo.asaltoId);
  const rival = asalto ? await obtener(ALMACENES.tiradores, asalto.rivalId) : null;

  // De qué color eras tú. Sin esto no se puede etiquetar: un tocado a favor no
  // significa nada si no se sabe qué lámpara es la tuya, y además es lo que
  // decide de qué color se pinta cada marca.
  let miColor = await colorDelAsalto(asalto);

  let intercambios = await listarPor(ALMACENES.intercambios, 'por-tiempo', tiempo.id);
  ordenar(intercambios);

  // El marcador viene de atrás: en una directa, el segundo tiempo empieza
  // donde acabó el primero.
  let tanteoInicial = await tanteoAlEmpezar(tiempo);

  // El intercambio que se está editando ahora mismo, o null.
  let activo = null;
  let corrigiendoMarcador = false;

  const estado = crear('p', { class: 'ayuda', texto: 'Recuperando el vídeo…' });

  anadir(contenedor,
    cabecera(`${rival ? rival.nombre : 'Asalto'} · Tiempo ${tiempo.orden}`,
             () => ir('asalto', { id: tiempo.asaltoId })),
    estado,
  );

  // --- Recuperar el vídeo de la copia guardada ---
  //
  // Que no esté no es el final: se puede haber borrado a propósito para hacer
  // sitio, y las etiquetas siguen ahí. Sin vídeo se pierde el reproductor y
  // la línea de tiempo, pero la tabla se puede seguir leyendo y corrigiendo.
  let fichero = null;
  let falloDelVideo = null;
  if (tiempo.totalTrozos > 0) {
    try {
      fichero = await leerVideo(tiempo);
    } catch (error) {
      falloDelVideo = error;
    }
  }

  const hayVideo = fichero !== null;

  // Al lado del reloj del vídeo, cómo va el marcador en ese segundo.
  const pastillaDelTanteo = crear('span', { class: 'tanteo-pastilla' });
  const tanteoEnVivo = crear('span', { class: 'marcador-en-vivo' }, [
    crear('span', { class: 'etiqueta-marcador', texto: 'Marcador:' }),
    pastillaDelTanteo,
  ]);
  // Lo último que se pintó, para saber cuándo ha cambiado de verdad.
  let ultimoTanteo = null;
  // Al acabar el respingo se quita la clase, y así la próxima vez vuelve a
  // saltar sin depender de nada más.
  pastillaDelTanteo.addEventListener('animationend', () => {
    pastillaDelTanteo.classList.remove('cambia');
  });

  const reproductor = hayVideo
    ? crearReproductor({
        alCambiarTiempo: (segundos) => {
          moverCursor(segundos);
          pintarTanteoEnVivo(segundos);
        },
        juntoAlTiempo: tanteoEnVivo,
      })
    : null;
  reproductorActivo = reproductor;

  // --- Línea de tiempo con las marcas ---
  const cursor = crear('div', { class: 'cursor-tiempo' });
  const barra = hayVideo ? crear('div', {
    class: 'linea-tiempo',
    onclick: (evento) => {
      // Un toque en la línea salta a ese momento del vídeo.
      const caja = barra.getBoundingClientRect();
      const proporcion = (evento.clientX - caja.left) / caja.width;
      reproductor.irA(Math.min(Math.max(0, proporcion), 1) * duracion());
    },
  }, [cursor]) : null;

  const marcador = crear('div', { class: 'marcador' });
  const preguntaColor = crear('div');
  let cambiandoColor = false;
  const contador = crear('p', { class: 'ayuda contador' });
  const tabla = crear('div');
  const deteccion = crear('details', { class: 'filtros' });

  // La ficha del intercambio va en una ventana encima de todo: en la pantalla
  // no cabe todo a la vez, y mientras se repasa el asalto estorba.
  const ficha = crear('dialog', { class: 'ficha-intercambio' });
  ficha.addEventListener('close', pintarIntercambios);

  const btnNuevo = hayVideo ? crear('button', {
    type: 'button', class: 'boton boton-principal boton-compacto',
    texto: 'Nuevo intercambio',
    onclick: crearIntercambio,
  }) : crear('p', {
    class: 'aviso',
    texto: tiempo.totalTrozos > 0
      ? `No se pudo recuperar el vídeo: ${falloDelVideo.message}`
      : 'Este tiempo ya no tiene vídeo. Sus etiquetas siguen aquí y se pueden ' +
        'corregir, pero no se pueden añadir intercambios nuevos.',
  });

  estado.remove();
  anadir(contenedor,
    // Lo primero de la pantalla, y bloqueante mientras falte: de tu color
    // dependen el sentido de cada etiqueta y el color de cada marca.
    preguntaColor,
    marcador,
    hayVideo ? reproductor.elemento : null,
    barra,
    contador,
    btnNuevo,
    tabla,
    hayVideo ? deteccion : null,
    ficha,
    crear('p', {
      class: 'ayuda pie',
      texto: [
        formatearSegundos(tiempo.duracion),
        formatearBytes(tiempo.tamano),
      ].join(' · '),
    }),
  );

  if (hayVideo) {
    reproductor.cargar(fichero);
    reproductor.video.addEventListener('loadedmetadata', pintarIntercambios);
  }

  pintarColor();
  aplicarBloqueo();
  pintarIntercambios();
  if (hayVideo) pintarDeteccion();

  // ------------------------------------------------------------------

  /**
   * Tu color en el asalto: se enseña si se sabe y se pide si no.
   *
   * No se pregunta al crear el asalto porque entonces no hay forma de
   * acordarse; se pregunta aquí, con el vídeo delante, que es donde se ve.
   * Y vale para todos los tiempos: la pista es la misma y el enchufe también.
   */
  function pintarColor() {
    if (miColor && !cambiandoColor) {
      rellenar(preguntaColor, crear('div', { class: 'marcador-fila' }, [
        crear('span', { class: 'etiqueta-campo', texto: 'Tu color' }),
        crear('span', { class: 'punto-resultado punto-' + miColor }),
        crear('span', { texto: etiquetaDe(COLORES_LAMPARA, miColor) }),
        crear('button', {
          type: 'button', class: 'boton-volver', texto: 'Cambiar',
          onclick: () => { cambiandoColor = true; pintarColor(); },
        }),
      ]));
      return;
    }

    rellenar(preguntaColor, [
      crear('p', {
        class: miColor ? 'ayuda' : 'aviso',
        texto: miColor
          ? 'Vale para todos los tiempos de este asalto. Al cambiarlo, las marcas ' +
            'cambian de color pero las etiquetas siguen diciendo lo mismo.'
          : 'Antes de etiquetar hay que decir de qué color eras tú en este asalto. ' +
            'Sin eso no se sabe de qué lámpara fue cada tocado.',
      }),
      desplegable(PREGUNTA_COLOR, COLORES_LAMPARA, miColor, elegirColor,
                  { vacio: '— Elige —' }).bloque,
      miColor ? crear('button', {
        type: 'button', class: 'boton boton-compacto', texto: 'Dejarlo como está',
        onclick: () => { cambiandoColor = false; pintarColor(); },
      }) : null,
    ]);
  }

  async function elegirColor(valor) {
    if (!valor) return;
    await fijarColorDelAsalto(asalto, valor);
    miColor = valor;
    cambiandoColor = false;
    pintarColor();
    aplicarBloqueo();
    pintarIntercambios();
    if (hayVideo) pintarDeteccion();
  }

  /** Sin color no se etiqueta ni se detecta: las dos cosas crean intercambios. */
  function aplicarBloqueo() {
    if (!hayVideo) return;
    btnNuevo.classList.toggle('desactivado', !miColor);
    deteccion.hidden = !miColor;
  }

  /** Duración de referencia: la del vídeo si ya se conoce, si no la guardada. */
  function duracion() {
    if (!hayVideo) return tiempo.duracion || 0;
    const delVideo = reproductor.video.duration;
    if (isFinite(delVideo) && delVideo > 0) return delVideo;
    return tiempo.duracion || 1;
  }

  function ordenar(lista) {
    lista.sort((a, b) => a.instante - b.instante);
  }

  function moverCursor(segundos) {
    if (!hayVideo) return;
    cursor.style.left = `${Math.min(100, (segundos / duracion()) * 100)}%`;
  }

  /**
   * El marcador tal y como iba en el segundo que se está viendo: el de
   * partida mientras no haya pasado nada, y lo que sumen los intercambios ya
   * etiquetados según van quedando atrás.
   */
  function pintarTanteoEnVivo(segundos) {
    if (!hayVideo) return;

    const ahora = tanteoEn(intercambios, tanteoInicial, segundos);
    const texto = `${ahora.favor}–${ahora.contra}`;

    // Mientras el marcador no cambie no se toca nada. Es lo que deja que el
    // respingo llegue a verse: esto se llama cuatro veces por segundo con el
    // vídeo corriendo, y reescribir la clase cada vez lo cortaba en seco.
    if (texto === ultimoTanteo) return;

    const como = { ganando: 'victoria', perdiendo: 'derrota', empate: 'empate' }[situacionDe(ahora)];
    pastillaDelTanteo.textContent = texto;
    pastillaDelTanteo.classList.remove('victoria', 'empate', 'derrota');
    pastillaDelTanteo.classList.add(como);

    // Un respingo al cambiar, que con el vídeo corriendo se pasa por alto que
    // acaba de sumar alguien. Reiniciarlo pide un reflujo por medio: si no, el
    // navegador no vuelve a lanzar la animación al poner otra vez la clase.
    if (ultimoTanteo !== null) {
      pastillaDelTanteo.classList.remove('cambia');
      void pastillaDelTanteo.offsetWidth;
      pastillaDelTanteo.classList.add('cambia');
    }
    ultimoTanteo = texto;
  }

  /**
   * Con qué marcador empieza este tiempo, y el botón para corregirlo.
   *
   * Hace falta porque el vídeo tiene agujeros: puede no haberse grabado el
   * primer tiempo, o puede haberse cortado antes de acabar y perderse varios
   * tocados. Lo de dentro se sigue derivando de las etiquetas.
   */
  function pintarMarcador() {
    const corregido = tiempo.tanteoInicial != null;

    if (!corrigiendoMarcador) {
      rellenar(marcador, crear('div', { class: 'marcador-fila' }, [
        crear('span', { class: 'etiqueta-campo', texto: 'Empieza' }),
        crear('span', {
          class: 'tanteo tanteo-grande',
          texto: `${tanteoInicial.favor}–${tanteoInicial.contra}`,
        }),
        corregido ? crear('span', { class: 'ayuda', texto: 'a mano' }) : null,
        crear('button', {
          type: 'button', class: 'boton-volver', texto: 'Corregir',
          onclick: () => { corrigiendoMarcador = true; pintarMarcador(); },
        }),
      ]));
      return;
    }

    const aFavor = crear('input', {
      class: 'entrada corta', type: 'number', min: 0, inputmode: 'numeric',
      value: tanteoInicial.favor,
    });
    const enContra = crear('input', {
      class: 'entrada corta', type: 'number', min: 0, inputmode: 'numeric',
      value: tanteoInicial.contra,
    });

    async function fijar(valor) {
      await guardar(ALMACENES.tiempos, { ...tiempo, tanteoInicial: valor });
      tiempo.tanteoInicial = valor;
      tanteoInicial = valor || await tanteoAlEmpezar(tiempo);
      corrigiendoMarcador = false;
      pintarIntercambios();
    }

    rellenar(marcador, [
      crear('p', {
        class: 'ayuda',
        texto: 'Con cuántos tocados se llega a este tiempo. Súbelos si hubo ' +
               'puntos que no se grabaron.',
      }),
      crear('div', { class: 'marcador-campo' }, [
        crear('label', { class: 'etiqueta-campo', texto: 'A favor' }),
        aFavor,
      ]),
      crear('div', { class: 'marcador-campo' }, [
        crear('label', { class: 'etiqueta-campo', texto: 'En contra' }),
        enContra,
      ]),
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Guardar el marcador',
        onclick: () => fijar({
          favor: Math.max(0, Number(aFavor.value) || 0),
          contra: Math.max(0, Number(enContra.value) || 0),
        }),
      }),
      corregido ? crear('button', {
        type: 'button', class: 'boton', texto: 'Volver a calcularlo solo',
        onclick: () => fijar(null),
      }) : null,
      crear('button', {
        type: 'button', class: 'boton', texto: 'Dejarlo como está',
        onclick: () => { corrigiendoMarcador = false; pintarMarcador(); },
      }),
    ]);
  }

  /** Repinta las marcas de la línea de tiempo y la tabla de debajo. */
  function pintarIntercambios() {
    pintarMarcador();
    if (!hayVideo) { pintarTabla(); pintarContador(); return; }

    pintarTanteoEnVivo(reproductor.tiempoActual());

    for (const vieja of barra.querySelectorAll('.marca')) vieja.remove();

    for (const intercambio of intercambios) {
      const proporcion = Math.min(1, intercambio.instante / duracion());
      const marca = crear('button', {
        type: 'button',
        // El color es el de la LÁMPARA que se encendió, no el del resultado:
        // si tu lámpara es la roja, tus tocados salen en rojo. Es lo que se ha
        // visto en la pista, y lo que el ojo busca al repasar el vídeo.
        class: 'marca marca-' + colorDeLaLampara(intercambio.resultado, miColor)
               + (activo && activo.id === intercambio.id ? ' marca-activa' : ''),
        style: `left: ${proporcion * 100}%`,
        'aria-label': `Intercambio en ${intercambio.instante.toFixed(1)} segundos`,
        onclick: (evento) => {
          // Si no, el toque llegaría también a la línea y saltaría a otro sitio.
          evento.stopPropagation();
          abrir(intercambio);
        },
      });
      barra.append(marca);
    }

    moverCursor(reproductor.tiempoActual());
    pintarContador();
    pintarTabla();
  }

  function pintarContador() {
    const cuantos = intercambios.length;
    contador.textContent = cuantos === 0
      ? 'Todavía no has etiquetado ningún intercambio.'
      : `${cuantos} intercambio${cuantos === 1 ? '' : 's'} etiquetado${cuantos === 1 ? '' : 's'}.`;
  }

  /**
   * La lista de intercambios: cuándo, cómo acabó y cómo iba el marcador.
   * Es la forma cómoda de saltar por el vídeo — una marca de la línea mide
   * catorce píxeles y con el dedo se falla.
   */
  function pintarTabla() {
    if (intercambios.length === 0) { rellenar(tabla, []); return; }

    const filas = tanteoCorrido(intercambios, tanteoInicial, cuentaParaElMarcador)
      .map(({ intercambio, favor, contra }) =>
      crear('tr', {
        class: 'fila-rival'
               + (activo && activo.id === intercambio.id ? ' fila-activa' : '')
               + (intercambio.propuesto ? ' fila-propuesta' : ''),
        onclick: () => abrir(intercambio),
      }, [
        // El ≈ es de las propuestas que salieron de un hueco: el marcador
        // estaba tapado cuando se encendió la lámpara, así que el instante es
        // el de cuando volvió a verse. Hay que moverlo a mano.
        crear('td', {
          class: 'apagado',
          texto: (intercambio.aproximado ? '≈ ' : '') + formatearSegundos(intercambio.instante),
          title: intercambio.aproximado
            ? 'El marcador estaba tapado: el instante es aproximado.' : '',
        }),
        crear('td', {}, [
          // Sin texto: el color ya lo dice, y es el mismo de su marca. El
          // nombre queda en el título, para quien no distinga los colores.
          crear('span', {
            class: 'punto-resultado punto-' + colorDeLaLampara(intercambio.resultado, miColor),
            title: etiquetaDe(RESULTADOS, intercambio.resultado) || 'Sin etiquetar',
            'aria-label': etiquetaDe(RESULTADOS, intercambio.resultado) || 'Sin etiquetar',
          }),
        ]),
        crear('td', { class: 'derecha tanteo apagado', texto: textoDelTanteo(intercambio, favor, contra) }),
        crear('td', { class: 'derecha' }, intercambio.propuesto
          ? [
              crear('button', {
                type: 'button', class: 'boton-icono en-tabla', texto: '✓',
                'aria-label': `Confirmar el intercambio de ${formatearSegundos(intercambio.instante)}`,
                onclick: (evento) => { evento.stopPropagation(); confirmar(intercambio); },
              }),
              crear('button', {
                type: 'button', class: 'boton-icono en-tabla borrar', texto: '✕',
                'aria-label': `Descartar el intercambio de ${formatearSegundos(intercambio.instante)}`,
                onclick: (evento) => { evento.stopPropagation(); descartar(intercambio); },
              }),
            ]
          : [
              crear('button', {
                type: 'button', class: 'boton-icono en-tabla', texto: '✎',
                'aria-label': `Corregir el intercambio de ${formatearSegundos(intercambio.instante)}`,
                onclick: (evento) => {
                  // Si no, el toque llegaría también a la fila.
                  evento.stopPropagation();
                  editar(intercambio);
                },
              }),
            ]),
      ]));

    rellenar(tabla, crear('div', { class: 'tabla-scroll' }, [
      crear('table', { class: 'tabla-rivales tabla-intercambios' }, [
        crear('thead', {}, [
          crear('tr', {}, [
            crear('th', { texto: 'Instante' }),
            crear('th', { texto: 'Resultado' }),
            crear('th', { class: 'derecha', texto: 'Tanteo' }),
            crear('th', { 'aria-label': 'Corregir' }),
          ]),
        ]),
        crear('tbody', {}, filas),
      ]),
    ]));
  }

  /**
   * El bloque de la detección automática: calibrar y lanzar.
   *
   * Va plegado y al final a propósito. Esto es opcional: muchos vídeos se
   * etiquetan a mano y la pantalla tiene que seguir siendo la de siempre para
   * quien no lo use nunca.
   */
  function pintarDeteccion() {
    const calibrado = tiempo.calibrado || null;

    rellenar(deteccion, [
      crear('summary', { texto: 'Detección automática' }),

      crear('p', {
        class: 'texto-ayuda',
        texto: 'Si en el vídeo se ve el marcador del aparato, Teseo puede ' +
               'buscar los tocados solo mirando cuándo se encienden las ' +
               'lámparas. Lo que encuentre son propuestas: nada se etiqueta ' +
               'sin que tú lo confirmes.',
      }),

      crear('button', {
        type: 'button', class: 'boton boton-compacto',
        texto: calibrado ? 'Repetir el calibrado' : 'Calibrado',
        onclick: () => ir('calibrado', { tiempoId: tiempo.id, asaltoId: tiempo.asaltoId }),
      }),

      calibrado ? crear('p', {
        class: 'ayuda',
        texto: (() => {
          const cuales = ['rojo', 'verde'].filter((color) => calibrado.lamparas[color]);
          return cuales.length === 2
            ? 'Calibrado con las dos lámparas localizadas.'
            : `Calibrado sólo con la lámpara ${cuales[0]}: los tocados del otro ` +
              'color no se detectarán.';
        })(),
      }) : crear('p', {
        class: 'ayuda',
        texto: 'Antes hay que calibrar: enmarcar el marcador en el vídeo y decir ' +
               'de qué color eres. Sin eso, Teseo no sabe dónde mirar.',
      }),

      crear('button', {
        type: 'button',
        class: 'boton boton-principal boton-compacto' + (calibrado ? '' : ' desactivado'),
        texto: 'Detección automática de intercambios',
        onclick: () => { if (calibrado) lanzarAnalisis(calibrado); },
      }),

      calibrado ? crear('p', {
        class: 'ayuda',
        texto: 'Tarda alrededor de la mitad de lo que dure el vídeo. Deja Teseo ' +
               'en pantalla y no apagues el móvil mientras corre.',
      }) : null,
    ]);
  }

  /** Reproduce el vídeo entero buscando encendidos. */
  async function lanzarAnalisis(calibrado) {
    const videoDelAnalisis = crear('video', {
      class: 'video-analisis', playsinline: true, muted: true,
    });
    videoDelAnalisis.src = URL.createObjectURL(fichero);

    const marca = crear('div', { class: 'recuadro-dibujado' });
    colocarMarca(calibrado.recuadro);

    function colocarMarca(recuadro) {
      marca.style.left = `${recuadro.x * 100}%`;
      marca.style.top = `${recuadro.y * 100}%`;
      marca.style.width = `${recuadro.ancho * 100}%`;
      marca.style.height = `${recuadro.alto * 100}%`;
    }

    const barra = crear('progress', { class: 'progreso-analisis', max: 1, value: 0 });
    const cuenta = crear('p', { class: 'ayuda', texto: '0 %' });
    const rastro = crear('p', { class: 'ayuda', texto: '' });
    let encontrados = 0;

    const botonCancelar = crear('button', {
      type: 'button', class: 'boton boton-peligro boton-compacto', texto: 'Cancelar',
      onclick: () => { if (analisisActivo) analisisActivo.cancelar(); },
    });

    rellenar(deteccion, [
      crear('summary', { texto: 'Detección automática' }),
      crear('p', {
        class: 'ayuda',
        texto: 'Analizando. Deja Teseo en pantalla: si el móvil se apaga, el ' +
               'análisis se para hasta que vuelvas.',
      }),
      crear('div', { class: 'marco-calibrado marco-analisis' }, [videoDelAnalisis, marca]),
      barra,
      cuenta,
      rastro,
      botonCancelar,
    ]);
    deteccion.open = true;

    analisisActivo = analizar({
      video: videoDelAnalisis,
      // Tu color manda el del asalto, no el que se guardó en su día dentro del
      // calibrado: si se cambia aquí, el análisis tiene que hacerle caso.
      calibrado: { ...calibrado, miColor },
      alProgresar: (parte) => {
        barra.value = parte;
        cuenta.textContent = `${Math.round(parte * 100)} % · ${encontrados} propuesta${encontrados === 1 ? '' : 's'}`;
      },
      alPausar: (pausado) => {
        cuenta.textContent = pausado
          ? 'En pausa: vuelve a Teseo para seguir.'
          : `${Math.round(barra.value * 100)} % · ${encontrados} propuesta${encontrados === 1 ? '' : 's'}`;
      },
      // El recuadro persigue al marcador por el vídeo pequeño. No es adorno:
      // es la única forma de ver de un vistazo si el seguimiento va bien o
      // se ha quedado clavado en una pared.
      alSeguir: (donde) => {
        colocarMarca(donde.recuadro);
        marca.classList.toggle('recuadro-perdido', donde.estado === 'perdido');
        rastro.textContent = donde.estado === 'imposible'
          ? 'Sin seguimiento: recuadro fijo.'
          : donde.estado === 'perdido'
            ? 'Marcador tapado o fuera de encuadre: buscándolo.'
            : `Marcador localizado (${Math.round(donde.parecido * 100)} %).`;
      },
      alDetectar: async (tocado) => {
        encontrados++;
        const propuesta = {
          tiempoId: tiempo.id,
          asaltoId: tiempo.asaltoId,
          instante: tocado.instante,
          resultado: tocado.resultado,
          ofensiva: null,
          defensiva: null,
          zonaCuerpo: null,
          zonaPista: null,
          propuesto: true,
          // El tocado cayó mientras el marcador estaba tapado: el instante es
          // el de cuando volvió a verse, no el del encendido.
          aproximado: tocado.aproximado || undefined,
        };
        propuesta.id = await guardar(ALMACENES.intercambios, propuesta);
        intercambios.push(propuesta);
        ordenar(intercambios);
        pintarIntercambios();
      },
    });

    const comoAcaba = await analisisActivo.terminado;
    const resumen = analisisActivo.resumen();
    analisisActivo = null;
    URL.revokeObjectURL(videoDelAnalisis.src);

    pintarDeteccion();
    deteccion.open = true;
    anadir(deteccion, crear('p', {
      class: encontrados > 0 ? 'aviso-bueno' : 'aviso',
      texto: comoAcaba === 'cancelado'
        ? `Análisis cancelado. Se quedan ${encontrados} propuesta(s) de lo que dio tiempo a mirar.`
        : encontrados > 0
          ? `${encontrados} propuesta(s). Repásalas en la tabla: el ✓ las confirma y el ✕ las descarta.`
          : 'No se ha encontrado ningún encendido. Si el marcador se ve bien en ' +
            'el vídeo, prueba a repetir el calibrado enmarcándolo más ajustado ' +
            'y midiendo con una lámpara encendida.',
    }));

    for (const texto of loQuePasoConElMarcador(resumen)) {
      anadir(deteccion, crear('p', { class: 'ayuda', texto }));
    }
  }

  /**
   * Cuánto se vio el marcador, contado en cristiano.
   *
   * Sin esto, un análisis con el tirador delante del aparato la mitad del
   * asalto se parece demasiado a un asalto sin tocados, y el usuario no tiene
   * forma de distinguirlos.
   */
  function loQuePasoConElMarcador(resumen) {
    if (!resumen) return [];

    if (!resumen.seguimiento) {
      return ['Este calibrado no lleva seguimiento, así que se ha mirado siempre ' +
              'al mismo sitio del fotograma. Si la cámara se movió, repite el ' +
              'calibrado para que Teseo pueda perseguir el marcador.'];
    }

    const total = resumen.seguido + resumen.perdido;
    if (total <= 0) return [];

    const parte = Math.round((resumen.seguido / total) * 100);
    const textos = [`El marcador se vio el ${parte} % del vídeo` +
      (resumen.huecos > 0
        ? `, con ${resumen.huecos} hueco${resumen.huecos === 1 ? '' : 's'} ` +
          `(${Math.round(resumen.perdido)} s en total) en los que estuvo tapado o fuera de encuadre.`
        : ', sin perderlo ni una vez.')];

    if (resumen.aproximados > 0) {
      textos.push(`${resumen.aproximados} propuesta(s) salieron de un hueco y van ` +
                  'marcadas con ≈ en la tabla: la lámpara se encendió mientras el ' +
                  'marcador no se veía, así que el instante hay que ajustarlo a mano.');
    }

    if (parte < 60) {
      textos.push('Con tanto rato sin ver el marcador se escapan tocados. Ayuda ' +
                  'grabar con el móvil apoyado, a 720p o más, y encuadrando de ' +
                  'forma que el aparato no quede detrás de los tiradores.');
    }

    return textos;
  }

  /**
   * Qué pone en la columna del tanteo. Un nulo no mueve el marcador, así que
   * repetir el número de antes sólo confundiría; y una propuesta todavía no
   * cuenta para nada.
   */
  function textoDelTanteo(intercambio, favor, contra) {
    if (intercambio.propuesto) return 'propuesto';
    if (intercambio.resultado === 'nada') return 'Nulo';
    return `${favor}–${contra}`;
  }

  /** La propuesta pasa a ser un intercambio como los demás. */
  async function confirmar(intercambio) {
    delete intercambio.propuesto;
    // Al confirmarla deja de ser aproximada: el usuario ya la ha mirado, y si
    // el instante no le cuadraba lo habrá movido.
    delete intercambio.aproximado;
    await guardar(ALMACENES.intercambios, intercambio);
    pintarIntercambios();
  }

  async function descartar(intercambio) {
    await borrar(ALMACENES.intercambios, intercambio.id);
    intercambios = intercambios.filter((otro) => otro.id !== intercambio.id);
    if (activo && activo.id === intercambio.id) activo = null;
    pintarIntercambios();
  }

  /** Crea un intercambio en el instante en el que está parado el vídeo. */
  async function crearIntercambio() {
    if (!miColor) return;
    await reproductor.pausar();

    const nuevo = {
      tiempoId: tiempo.id,
      // Guardamos también el asalto: las estadísticas lo agradecen y ahorra
      // tener que ir preguntando de qué asalto es cada intercambio.
      asaltoId: tiempo.asaltoId,
      instante: reproductor.tiempoActual(),
      ofensiva: null,
      defensiva: null,
      resultado: null,
      zonaCuerpo: null,
      zonaPista: null,
    };

    const id = await guardar(ALMACENES.intercambios, nuevo);
    nuevo.id = id;
    intercambios.push(nuevo);
    ordenar(intercambios);

    editar(nuevo);
  }

  /** Enseña el trozo de vídeo de un intercambio y lo señala en la lista. */
  function abrir(intercambio) {
    activo = intercambio;
    if (hayVideo) {
      reproductor.verTramo(intercambio.instante - SEGUNDOS_ANTES,
                           intercambio.instante + SEGUNDOS_DESPUES);
    }
    pintarIntercambios();
  }

  /** Eso, y además abre su ficha para corregirla. */
  function editar(intercambio) {
    abrir(intercambio);
    pintarEditor();
    ficha.showModal();
  }

  /** Guarda un cambio de una de las capas. */
  async function cambiar(campo, valor) {
    activo[campo] = valor;

    // Las zonas sólo tienen sentido si hubo tocado. Si el resultado deja de
    // serlo, se limpian para no dejar datos sueltos que ensucien las cuentas.
    if (campo === 'resultado' && !RESULTADOS_CON_TOCADO.includes(valor)) {
      activo.zonaCuerpo = null;
      activo.zonaPista = null;
    }

    await guardar(ALMACENES.intercambios, activo);
    pintarIntercambios();

    // Al cambiar el resultado aparecen o desaparecen las zonas.
    if (campo === 'resultado') pintarEditor();
  }

  /**
   * Pinta la ficha del intercambio abierto.
   *
   * Todo con desplegables: son ocho catálogos y con botones no cabían en la
   * pantalla. Y el resultado el primero, que es lo único que se sabe siempre
   * —lo demás puede quedarse en blanco— y lo que mueve el marcador.
   */
  function pintarEditor() {
    if (!activo) { rellenar(ficha, []); return; }

    const huboTocado = RESULTADOS_CON_TOCADO.includes(activo.resultado);
    const sinIndicar = { vacio: '— Sin indicar —' };

    rellenar(ficha, [
      crear('div', { class: 'cabecera-editor' }, [
        crear('span', { class: 'instante', texto: formatearSegundos(activo.instante) }),
        crear('span', { class: 'ayuda', texto: `${activo.instante.toFixed(2)} s` }),
      ]),

      desplegable('Resultado', RESULTADOS, activo.resultado,
        (valor) => cambiar('resultado', valor), sinIndicar).bloque,

      desplegable('Mi acción ofensiva', ACCIONES_OFENSIVAS, activo.ofensiva,
        (valor) => cambiar('ofensiva', valor), sinIndicar).bloque,

      desplegable('Mi acción defensiva', ACCIONES_DEFENSIVAS, activo.defensiva,
        (valor) => cambiar('defensiva', valor), sinIndicar).bloque,

      // Estas dos sólo salen cuando hubo tocado, como pediste.
      huboTocado ? desplegable('Zona del cuerpo', ZONAS_CUERPO, activo.zonaCuerpo,
        (valor) => cambiar('zonaCuerpo', valor), sinIndicar).bloque : null,

      huboTocado ? desplegable('Zona de la pista', ZONAS_PISTA, activo.zonaPista,
        (valor) => cambiar('zonaPista', valor), sinIndicar).bloque : null,

      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Listo',
        onclick: () => ficha.close(),
      }),

      crear('button', {
        type: 'button', class: 'boton boton-peligro', texto: 'Borrar intercambio',
        onclick: async () => {
          if (!confirm('¿Borrar este intercambio?')) return;
          await borrar(ALMACENES.intercambios, activo.id);
          intercambios = intercambios.filter((i) => i.id !== activo.id);
          activo = null;
          ficha.close();
        },
      }),
    ]);
  }
}
