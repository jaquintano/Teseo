// Pantallas de asaltos: la lista, el alta y el detalle de uno.
//
// Recuerda la estructura: un asalto tiene uno o varios TIEMPOS (en poule
// suele ser uno; en directas, dos o tres), y cada tiempo tiene su vídeo.

import {
  crear, cabecera, ir, campo, campoLargo, bloque, grupoOpciones,
  formatearFecha, formatearBytes, formatearSegundos,
} from '../ui.js';
import {
  TIPOS_DE_SESION, FASES, MANOS, etiquetaDe,
} from '../constantes.js';
import {
  ALMACENES, guardar, obtener, listar, listarPor, listarRivales,
  guardarVideo, borrarAsalto, borrarTiempo, comprobarLegible,
} from '../db.js';

const FATIGA = [1, 2, 3, 4, 5].map((n) => ({ id: String(n), etiqueta: String(n) }));

/** Fecha de hoy en el formato que entiende un <input type="date">. */
function hoy() {
  const ahora = new Date();
  const desfase = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora - desfase).toISOString().slice(0, 10);
}

// --- Lista de asaltos (pantalla de inicio) ----------------------------

export async function pantallaInicio(contenedor) {
  const [asaltos, tiradores] = await Promise.all([
    listar(ALMACENES.asaltos),
    listar(ALMACENES.tiradores),
  ]);

  const porId = new Map(tiradores.map((t) => [t.id, t]));
  asaltos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id);

  const lista = crear('div', { class: 'lista' });

  if (asaltos.length === 0) {
    lista.append(crear('p', {
      class: 'ayuda',
      texto: 'Todavía no has registrado ningún asalto. Empieza por crear uno.',
    }));
  }

  for (const asalto of asaltos) {
    const rival = porId.get(asalto.rivalId);
    const detalles = [
      formatearFecha(asalto.fecha),
      asalto.numero ? `Asalto ${asalto.numero}` : '',
      etiquetaDe(TIPOS_DE_SESION, asalto.tipoSesion),
      asalto.torneo,
    ].filter(Boolean).join(' · ');

    lista.append(crear('button', {
      type: 'button',
      class: 'ficha-lista',
      onclick: () => ir('asalto', { id: asalto.id }),
    }, [
      crear('span', { class: 'ficha-titulo', texto: rival ? rival.nombre : 'Rival borrado' }),
      crear('span', { class: 'ficha-detalle', texto: detalles }),
    ]));
  }

  contenedor.append(
    crear('div', { class: 'cabecera' }, [
      crear('h2', { class: 'titulo-pantalla', texto: 'Mis asaltos' }),
      crear('button', {
        type: 'button', class: 'boton-menu', texto: 'Menú',
        onclick: () => ir('menu'),
      }),
    ]),
    crear('button', {
      type: 'button', class: 'boton boton-principal', texto: 'Nuevo asalto',
      onclick: () => ir('asalto-nuevo'),
    }),
    lista,
  );
}

// --- Alta y edición de un asalto --------------------------------------

export async function pantallaAsaltoNuevo(contenedor, datos = {}) {
  const asalto = datos.id !== undefined ? await obtener(ALMACENES.asaltos, datos.id) : {};
  const esNuevo = datos.id === undefined;
  const rivales = await listarRivales();

  // Si venimos de crear un rival sobre la marcha, ya llega elegido.
  let rivalId = datos.rivalIdElegido ?? asalto.rivalId ?? null;
  let tipoSesion = asalto.tipoSesion || null;
  let fase = asalto.fase || null;
  let fatiga = asalto.fatiga ? String(asalto.fatiga) : null;

  const selector = crear('select', {
    class: 'entrada',
    onchange: (evento) => { rivalId = Number(evento.target.value) || null; },
  });
  selector.append(crear('option', { value: '', texto: '— Elige rival —' }));
  for (const rival of rivales) {
    const opcion = crear('option', { value: rival.id, texto: rival.nombre });
    if (rival.id === rivalId) opcion.selected = true;
    selector.append(opcion);
  }

  const numero = campo('Número de asalto de la sesión', {
    value: asalto.numero || '', type: 'number', inputmode: 'numeric', placeholder: '1',
  });
  const fecha = campo('Fecha', { value: asalto.fecha || hoy(), type: 'date' });
  const torneo = campo('Torneo', { value: asalto.torneo || '', placeholder: 'Nombre del torneo' });
  const nota = campoLargo('Nota', { value: asalto.nota || '' });

  const aviso = crear('p', { class: 'aviso', texto: 'Elige un rival.', hidden: true });

  contenedor.append(
    cabecera(esNuevo ? 'Nuevo asalto' : 'Editar asalto',
             () => ir(esNuevo ? 'inicio' : 'asalto', { id: datos.id })),

    bloque('Rival', crear('div', {}, [
      selector,
      crear('button', {
        type: 'button', class: 'boton', texto: 'Dar de alta un rival nuevo',
        onclick: () => ir('rival', {
          volverA: 'asalto-nuevo',
          // Al guardarlo, volvemos aquí con el rival ya seleccionado.
          alCrear: (id) => ir('asalto-nuevo', { ...datos, rivalIdElegido: id }),
        }),
      }),
    ])),

    numero.bloque,
    bloque('Tipo de sesión', grupoOpciones(TIPOS_DE_SESION, tipoSesion,
      (valor) => { tipoSesion = valor; })),
    fecha.bloque,
    torneo.bloque,
    bloque('Fase', grupoOpciones(FASES, fase, (valor) => { fase = valor; },
      { clase: 'compacto' })),
    bloque('Fatiga percibida', grupoOpciones(FATIGA, fatiga,
      (valor) => { fatiga = valor; }, { clase: 'cinco-columnas' })),
    nota.bloque,
    aviso,

    crear('button', {
      type: 'button', class: 'boton boton-principal',
      texto: esNuevo ? 'Crear asalto' : 'Guardar cambios',
      onclick: async () => {
        if (!rivalId) { aviso.hidden = false; return; }
        aviso.hidden = true;

        const ficha = {
          ...(asalto.id !== undefined ? { id: asalto.id } : {}),
          rivalId,
          numero: numero.entrada.value ? Number(numero.entrada.value) : null,
          fecha: fecha.entrada.value || hoy(),
          tipoSesion,
          torneo: torneo.entrada.value.trim(),
          fase,
          // El club no se pregunta aquí: ya está en la ficha del rival.
          fatiga: fatiga ? Number(fatiga) : null,
          nota: nota.entrada.value.trim(),
        };

        const id = await guardar(ALMACENES.asaltos, ficha);
        ir('asalto', { id });
      },
    }),
  );
}

// --- Detalle de un asalto: sus tiempos --------------------------------

export async function pantallaAsalto(contenedor, datos = {}) {
  const asalto = await obtener(ALMACENES.asaltos, datos.id);
  if (!asalto) { ir('inicio'); return; }

  const [rival, tiempos] = await Promise.all([
    obtener(ALMACENES.tiradores, asalto.rivalId),
    listarPor(ALMACENES.tiempos, 'por-asalto', asalto.id),
  ]);
  tiempos.sort((a, b) => a.orden - b.orden);

  const contexto = [
    formatearFecha(asalto.fecha),
    asalto.numero ? `Asalto ${asalto.numero}` : '',
    etiquetaDe(TIPOS_DE_SESION, asalto.tipoSesion),
    asalto.torneo,
    etiquetaDe(FASES, asalto.fase),
    asalto.fatiga ? `Fatiga ${asalto.fatiga}/5` : '',
  ].filter(Boolean).join(' · ');

  const listaTiempos = crear('div', { class: 'lista' });
  await pintarTiempos(listaTiempos, asalto, tiempos);

  // --- Añadir un tiempo con su vídeo ---
  const progreso = crear('p', { class: 'progreso' });
  const entrada = crear('input', {
    type: 'file', accept: 'video/*', class: 'oculto-visualmente',
    id: 'selector-tiempo',
  });
  const etiquetaBoton = crear('label', {
    class: 'boton boton-principal', for: 'selector-tiempo',
    texto: tiempos.length === 0 ? 'Añadir el vídeo del primer tiempo' : 'Añadir otro tiempo',
  });

  entrada.addEventListener('change', async () => {
    const fichero = entrada.files && entrada.files[0];
    if (!fichero) return;
    await anadirTiempo(fichero, asalto, tiempos.length, progreso, etiquetaBoton);
  });

  contenedor.append(
    cabecera(rival ? rival.nombre : 'Rival borrado', () => ir('inicio')),

    crear('p', { class: 'ayuda', texto: contexto }),
    // El club del rival sale de su ficha, no se vuelve a preguntar en cada asalto.
    rivalEnUnaLinea(rival),

    crear('h3', { class: 'subtitulo-seccion', texto: 'Tiempos' }),
    crear('p', {
      class: 'ayuda',
      texto: 'Un asalto de poule suele tener un solo tiempo. En directas, dos o ' +
             'tres. Añade cada uno con su vídeo.',
    }),
    listaTiempos,
    entrada,
    etiquetaBoton,
    progreso,

    crear('button', {
      type: 'button', class: 'boton', texto: 'Editar datos del asalto',
      onclick: () => ir('asalto-nuevo', { id: asalto.id }),
    }),
    crear('button', {
      type: 'button', class: 'boton boton-peligro', texto: 'Borrar asalto',
      onclick: async () => {
        if (!confirm('¿Borrar este asalto con sus vídeos y sus etiquetas?')) return;
        await borrarAsalto(asalto.id);
        ir('inicio');
      },
    }),
  );
}

/** Resume al rival en una línea: mano, club y altura, lo que haya. */
function rivalEnUnaLinea(rival) {
  if (!rival) return null;
  const partes = [
    etiquetaDe(MANOS, rival.mano),
    rival.club,
    rival.altura ? `${rival.altura} cm` : '',
  ].filter(Boolean);
  if (partes.length === 0) return null;
  return crear('p', { class: 'ayuda', texto: partes.join(' · ') });
}

/** Pinta la lista de tiempos de un asalto. */
async function pintarTiempos(lista, asalto, tiempos) {
  lista.textContent = '';

  if (tiempos.length === 0) {
    lista.append(crear('p', {
      class: 'ayuda',
      texto: 'Este asalto todavía no tiene ningún vídeo.',
    }));
    return;
  }

  for (const tiempo of tiempos) {
    const etiquetas = await listarPor(ALMACENES.intercambios, 'por-tiempo', tiempo.id);
    const detalles = [
      formatearSegundos(tiempo.duracion),
      formatearBytes(tiempo.tamano),
      `${etiquetas.length} intercambio(s)`,
    ].filter(Boolean).join(' · ');

    lista.append(crear('div', { class: 'ficha-lista ficha-compuesta' }, [
      crear('button', {
        type: 'button', class: 'ficha-principal',
        onclick: () => ir('etiquetado', { tiempoId: tiempo.id, asaltoId: asalto.id }),
      }, [
        crear('span', { class: 'ficha-titulo', texto: `Tiempo ${tiempo.orden}` }),
        crear('span', { class: 'ficha-detalle', texto: detalles }),
      ]),
      crear('button', {
        type: 'button', class: 'boton-icono', texto: '✕',
        'aria-label': `Borrar tiempo ${tiempo.orden}`,
        onclick: async () => {
          if (!confirm(`¿Borrar el tiempo ${tiempo.orden}, su vídeo y sus etiquetas?`)) return;
          await borrarTiempo(tiempo);
          ir('asalto', { id: asalto.id });
        },
      }),
    ]));
  }
}

/**
 * Copia el vídeo elegido y crea el tiempo correspondiente.
 * El vídeo se copia ANTES de dejar etiquetar nada: si no se puede leer,
 * mejor saberlo ahora que después de media hora de trabajo.
 */
async function anadirTiempo(fichero, asalto, cuantosHay, progreso, boton) {
  boton.classList.add('desactivado');
  progreso.textContent = 'Comprobando el vídeo…';

  const { legible, error } = await comprobarLegible(fichero);
  if (!legible) {
    progreso.textContent = '';
    boton.classList.remove('desactivado');
    alert(
      'No se puede leer este vídeo.\n\n' +
      'Lo más probable es que no esté guardado entero en el móvil: Google Fotos ' +
      'conserva la ficha y la miniatura, pero los bytes están en la nube.\n\n' +
      'Descárgalo al teléfono y vuelve a intentarlo.\n\n' +
      `(Detalle técnico: ${error.name})`
    );
    return;
  }

  // Necesitamos la duración para las estadísticas por tramo del asalto.
  const duracion = await medirDuracion(fichero);

  const tiempoId = await guardar(ALMACENES.tiempos, {
    asaltoId: asalto.id,
    orden: cuantosHay + 1,
    nombreVideo: fichero.name || 'vídeo',
    tipoVideo: fichero.type,
    tamano: fichero.size,
    duracion,
    totalTrozos: 0,
    creadoEl: new Date().toISOString(),
  });

  try {
    const totalTrozos = await guardarVideo(tiempoId, fichero, (hechos, total) => {
      progreso.textContent = `Copiando el vídeo… ${Math.round((hechos / total) * 100)} %`;
    });

    await guardar(ALMACENES.tiempos, {
      ...(await obtener(ALMACENES.tiempos, tiempoId)),
      totalTrozos,
    });

    progreso.textContent = 'Vídeo copiado.';
    ir('asalto', { id: asalto.id });

  } catch (fallo) {
    progreso.textContent = '';
    boton.classList.remove('desactivado');
    // Si se quedó a medias, el tiempo no sirve.
    await borrarTiempo(await obtener(ALMACENES.tiempos, tiempoId));
    alert(`No se pudo copiar el vídeo: ${fallo.name} — ${fallo.message}`);
  }
}

/** Lee la duración del vídeo sin llegar a reproducirlo. */
function medirDuracion(fichero) {
  return new Promise((resolver) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(fichero);

    const terminar = (valor) => {
      URL.revokeObjectURL(url);
      resolver(valor);
    };

    video.addEventListener('loadedmetadata', () => {
      terminar(isFinite(video.duration) ? video.duration : null);
    });
    video.addEventListener('error', () => terminar(null));
    video.src = url;
  });
}
