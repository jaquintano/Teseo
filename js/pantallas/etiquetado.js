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
// coloreada según el resultado. Tocarla te lleva a ese instante y abre su
// ficha para corregirla o borrarla. Tocando la línea en cualquier otro sitio
// saltas a ese momento del vídeo.
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
} from '../constantes.js';
import {
  ALMACENES, obtener, guardar, borrar, listarPor, leerVideo,
} from '../db.js';
import { crearReproductor } from '../video.js';
import { tanteosDeLosTiempos, tanteoCorrido, tanteoEn } from '../tanteo.js';

// Cuánto se ve de un intercambio al tocarlo: un par de segundos de carrerilla
// para entender de dónde viene la acción, y medio segundo detrás para ver cómo
// acaba. Se para solo.
const SEGUNDOS_ANTES = 2;
const SEGUNDOS_DESPUES = 0.5;

// El reproductor de la pantalla, para soltarlo al salir y no dejar cientos
// de megas ocupando memoria.
let reproductorActivo = null;

export function soltarReproductor() {
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
  const tanteoEnVivo = crear('span', { class: 'tanteo tanteo-en-vivo' });

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
  const contador = crear('p', { class: 'ayuda contador' });
  const tabla = crear('div');

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
    marcador,
    hayVideo ? reproductor.elemento : null,
    barra,
    contador,
    btnNuevo,
    tabla,
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

  pintarIntercambios();

  // ------------------------------------------------------------------

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
    tanteoEnVivo.textContent = `${ahora.favor}–${ahora.contra}`;
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
        class: 'marca marca-' + (intercambio.resultado || 'vacio')
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

    const filas = tanteoCorrido(intercambios, tanteoInicial).map(({ intercambio, favor, contra }) =>
      crear('tr', {
        class: 'fila-rival' + (activo && activo.id === intercambio.id ? ' fila-activa' : ''),
        onclick: () => abrir(intercambio),
      }, [
        crear('td', { class: 'apagado', texto: formatearSegundos(intercambio.instante) }),
        crear('td', {}, [
          // Sin texto: el color ya lo dice, y es el mismo de su marca. El
          // nombre queda en el título, para quien no distinga los colores.
          crear('span', {
            class: 'punto-resultado punto-' + (intercambio.resultado || 'vacio'),
            title: etiquetaDe(RESULTADOS, intercambio.resultado) || 'Sin etiquetar',
            'aria-label': etiquetaDe(RESULTADOS, intercambio.resultado) || 'Sin etiquetar',
          }),
        ]),
        crear('td', { class: 'derecha tanteo', texto: `${favor}–${contra}` }),
        crear('td', { class: 'derecha' }, [
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

  /** Crea un intercambio en el instante en el que está parado el vídeo. */
  async function crearIntercambio() {
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
