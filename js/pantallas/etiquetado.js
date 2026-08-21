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
// resultado con el color de la marca y cómo iba el marcador. Tocarla hace lo
// mismo que tocar la marca.

import {
  anadir, crear, rellenar, cabecera, ir, bloque, grupoOpciones,
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
import { contarTocados, tanteoCorrido } from '../tanteo.js';

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
  const anteriores = tiempos.filter((otro) => (otro.orden || 0) < (tiempo.orden || 0));

  let favor = 0;
  let contra = 0;

  for (const anterior of anteriores) {
    const suyos = await listarPor(ALMACENES.intercambios, 'por-tiempo', anterior.id);
    const cuenta = contarTocados(suyos);
    favor += cuenta.favor;
    contra += cuenta.contra;
  }

  return { favor, contra };
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
  const tanteoInicial = await tanteoAlEmpezar(tiempo);

  // El intercambio que se está editando ahora mismo, o null.
  let activo = null;

  const estado = crear('p', { class: 'ayuda', texto: 'Recuperando el vídeo…' });

  anadir(contenedor,
    cabecera(`${rival ? rival.nombre : 'Asalto'} · Tiempo ${tiempo.orden}`,
             () => ir('asalto', { id: tiempo.asaltoId })),
    estado,
  );

  // --- Recuperar el vídeo de la copia guardada ---
  let fichero;
  try {
    fichero = await leerVideo(tiempo);
  } catch (error) {
    estado.textContent = '';
    anadir(contenedor, crear('p', {
      class: 'aviso',
      texto: `No se pudo recuperar el vídeo: ${error.message}`,
    }));
    return;
  }

  const reproductor = crearReproductor({
    alCambiarTiempo: (segundos) => moverCursor(segundos),
  });
  reproductorActivo = reproductor;

  // --- Línea de tiempo con las marcas ---
  const cursor = crear('div', { class: 'cursor-tiempo' });
  const barra = crear('div', {
    class: 'linea-tiempo',
    onclick: (evento) => {
      // Un toque en la línea salta a ese momento del vídeo.
      const caja = barra.getBoundingClientRect();
      const proporcion = (evento.clientX - caja.left) / caja.width;
      reproductor.irA(Math.min(Math.max(0, proporcion), 1) * duracion());
    },
  }, [cursor]);

  const contador = crear('p', { class: 'ayuda contador' });
  const editor = crear('div', { class: 'editor' });
  const tabla = crear('div');

  const btnNuevo = crear('button', {
    type: 'button', class: 'boton boton-principal',
    texto: 'Nuevo intercambio aquí',
    onclick: crearIntercambio,
  });

  estado.remove();
  anadir(contenedor,
    reproductor.elemento,
    barra,
    contador,
    btnNuevo,
    editor,
    tabla,
    crear('p', {
      class: 'ayuda pie',
      texto: [
        formatearSegundos(tiempo.duracion),
        formatearBytes(tiempo.tamano),
      ].join(' · '),
    }),
  );

  reproductor.cargar(fichero);
  reproductor.video.addEventListener('loadedmetadata', pintarIntercambios);

  pintarIntercambios();
  pintarEditor();

  // ------------------------------------------------------------------

  /** Duración de referencia: la del vídeo si ya se conoce, si no la guardada. */
  function duracion() {
    const delVideo = reproductor.video.duration;
    if (isFinite(delVideo) && delVideo > 0) return delVideo;
    return tiempo.duracion || 1;
  }

  function ordenar(lista) {
    lista.sort((a, b) => a.instante - b.instante);
  }

  function moverCursor(segundos) {
    cursor.style.left = `${Math.min(100, (segundos / duracion()) * 100)}%`;
  }

  /** Repinta las marcas de la línea de tiempo y la tabla de debajo. */
  function pintarIntercambios() {
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

    const cuantos = intercambios.length;
    contador.textContent = cuantos === 0
      ? 'Todavía no has etiquetado ningún intercambio.'
      : `${cuantos} intercambio${cuantos === 1 ? '' : 's'} etiquetado${cuantos === 1 ? '' : 's'}.`;

    pintarTabla();
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
          crear('span', {
            class: 'pastilla pastilla-' + (intercambio.resultado || 'vacio'),
            texto: etiquetaDe(RESULTADOS, intercambio.resultado) || 'Sin etiquetar',
          }),
        ]),
        crear('td', { class: 'derecha tanteo', texto: `${favor}–${contra}` }),
      ]));

    rellenar(tabla, crear('div', { class: 'tabla-scroll' }, [
      crear('table', { class: 'tabla-rivales' }, [
        crear('thead', {}, [
          crear('tr', {}, [
            crear('th', { texto: 'Instante' }),
            crear('th', { texto: 'Resultado' }),
            crear('th', { class: 'derecha', texto: 'Tanteo' }),
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

    abrir(nuevo);
  }

  /** Abre la ficha de un intercambio y lleva el vídeo a su instante. */
  function abrir(intercambio) {
    activo = intercambio;
    reproductor.irA(intercambio.instante);
    pintarIntercambios();
    pintarEditor();
    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cerrar() {
    activo = null;
    pintarIntercambios();
    pintarEditor();
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

  /** Pinta la ficha del intercambio activo, o nada si no hay ninguno. */
  function pintarEditor() {
    if (!activo) {
      rellenar(editor, crear('p', {
        class: 'ayuda',
        texto: 'Pausa el vídeo donde haya pasado algo, afina con los saltos y ' +
               'pulsa "Nuevo intercambio aquí". O toca una marca para corregirla.',
      }));
      return;
    }

    const huboTocado = RESULTADOS_CON_TOCADO.includes(activo.resultado);

    rellenar(editor, [
      crear('div', { class: 'cabecera-editor' }, [
        crear('span', {
          class: 'instante',
          texto: `${activo.instante.toFixed(2)} s`,
        }),
        crear('button', {
          type: 'button', class: 'boton-volver', texto: 'Ir al instante',
          onclick: () => reproductor.irA(activo.instante),
        }),
      ]),

      bloque('Mi acción ofensiva',
        grupoOpciones(ACCIONES_OFENSIVAS, activo.ofensiva,
          (valor) => cambiar('ofensiva', valor))),

      bloque('Mi acción defensiva',
        grupoOpciones(ACCIONES_DEFENSIVAS, activo.defensiva,
          (valor) => cambiar('defensiva', valor))),

      bloque('Resultado',
        grupoOpciones(RESULTADOS, activo.resultado,
          (valor) => cambiar('resultado', valor), { clase: 'dos-columnas' })),

      // Estas dos sólo salen cuando hubo tocado, como pediste.
      huboTocado ? bloque('Zona del cuerpo',
        grupoOpciones(ZONAS_CUERPO, activo.zonaCuerpo,
          (valor) => cambiar('zonaCuerpo', valor))) : null,

      huboTocado ? bloque('Zona de la pista',
        grupoOpciones(ZONAS_PISTA, activo.zonaPista,
          (valor) => cambiar('zonaPista', valor))) : null,

      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Listo',
        onclick: cerrar,
      }),

      crear('button', {
        type: 'button', class: 'boton boton-peligro', texto: 'Borrar intercambio',
        onclick: async () => {
          if (!confirm('¿Borrar este intercambio?')) return;
          await borrar(ALMACENES.intercambios, activo.id);
          intercambios = intercambios.filter((i) => i.id !== activo.id);
          cerrar();
        },
      }),
    ]);
  }
}
