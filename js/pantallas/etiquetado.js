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

import {
  crear, rellenar, cabecera, ir, bloque, grupoOpciones,
  formatearBytes, formatearSegundos,
} from '../ui.js';
import {
  ACCIONES_OFENSIVAS, ACCIONES_DEFENSIVAS, RESULTADOS,
  RESULTADOS_CON_TOCADO, ZONAS_CUERPO, ZONAS_PISTA,
} from '../constantes.js';
import {
  ALMACENES, obtener, guardar, borrar, listarPor, leerVideo,
} from '../db.js';
import { crearReproductor } from '../video.js';

// El reproductor de la pantalla, para soltarlo al salir y no dejar cientos
// de megas ocupando memoria.
let reproductorActivo = null;

export function soltarReproductor() {
  if (reproductorActivo) {
    reproductorActivo.destruir();
    reproductorActivo = null;
  }
}

export async function pantallaEtiquetado(contenedor, datos = {}) {
  soltarReproductor();

  const tiempo = await obtener(ALMACENES.tiempos, datos.tiempoId);
  if (!tiempo) { ir('inicio'); return; }

  const asalto = await obtener(ALMACENES.asaltos, tiempo.asaltoId);
  const rival = asalto ? await obtener(ALMACENES.tiradores, asalto.rivalId) : null;

  let intercambios = await listarPor(ALMACENES.intercambios, 'por-tiempo', tiempo.id);
  ordenar(intercambios);

  // El intercambio que se está editando ahora mismo, o null.
  let activo = null;

  const estado = crear('p', { class: 'ayuda', texto: 'Recuperando el vídeo…' });

  contenedor.append(
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
    contenedor.append(crear('p', {
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

  const btnNuevo = crear('button', {
    type: 'button', class: 'boton boton-principal',
    texto: 'Nuevo intercambio aquí',
    onclick: crearIntercambio,
  });

  estado.remove();
  contenedor.append(
    reproductor.elemento,
    barra,
    contador,
    btnNuevo,
    editor,
    crear('p', {
      class: 'ayuda pie',
      texto: [
        formatearSegundos(tiempo.duracion),
        formatearBytes(tiempo.tamano),
      ].join(' · '),
    }),
  );

  reproductor.cargar(fichero);
  reproductor.video.addEventListener('loadedmetadata', pintarMarcas);

  pintarMarcas();
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

  /** Repinta todas las marcas de la línea de tiempo. */
  function pintarMarcas() {
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
    pintarMarcas();
    pintarEditor();
    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cerrar() {
    activo = null;
    pintarMarcas();
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
    pintarMarcas();

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
