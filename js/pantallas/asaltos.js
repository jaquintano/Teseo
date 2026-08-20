// Pantallas de asaltos: la lista, el alta y el detalle de uno.
//
// Recuerda la estructura: un asalto tiene uno o varios TIEMPOS (en poule
// suele ser uno; en directas, dos o tres), y cada tiempo tiene su vídeo.

import {
  anadir, crear, rellenar, cabecera, ir, campo, campoLargo, bloque, grupoOpciones,
  desplegable, deslizador, formatearFecha, formatearBytes, formatearSegundos,
} from '../ui.js';
import {
  TIPOS_DE_SESION, FASES, MANOS, EMPUNADURAS, ESTATURAS, etiquetaDe,
  nombreCompleto, normalizar, opcionesPara,
} from '../constantes.js';
import { generoDelUsuario } from '../genero.js';
import { resumirCompeticion } from '../competiciones.js';
import {
  ALMACENES, guardar, obtener, listar, listarPor, listarRivales, obtenerPerfilPropio,
  guardarVideo, borrarAsalto, borrarTiempo, comprobarLegible,
} from '../db.js';

// La fatiga se apunta con una barra del 1 al 5, y una barra siempre marca
// algo: si nadie la toca, queda en el punto medio.
const FATIGA_POR_DEFECTO = 3;

/** Fecha de hoy en el formato que entiende un <input type="date">. */
function hoy() {
  const ahora = new Date();
  const desfase = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora - desfase).toISOString().slice(0, 10);
}

// --- Lista de asaltos (pantalla de inicio) ----------------------------

export async function pantallaInicio(contenedor) {
  const [asaltos, tiradores, competiciones, perfil] = await Promise.all([
    listar(ALMACENES.asaltos),
    listar(ALMACENES.tiradores),
    listar(ALMACENES.competiciones),
    obtenerPerfilPropio(),
  ]);

  // Sin rivales ni competiciones no se puede hacer gran cosa, y darlos de
  // alta a mano da pereza. Como sabemos sus categorias, se le ofrece
  // rellenarlo todo de una vez.
  const rivales = tiradores.filter((t) => !perfil || t.id !== perfil.id);
  const vacia = rivales.length === 0 && competiciones.length === 0;

  const competicionPorId = new Map(competiciones.map((c) => [c.id, c]));

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
      nombreDeCompeticion(competicionPorId.get(asalto.competicionId), asalto),
    ].filter(Boolean).join(' · ');

    lista.append(crear('button', {
      type: 'button',
      class: 'ficha-lista',
      onclick: () => ir('asalto', { id: asalto.id }),
    }, [
      crear('span', { class: 'ficha-titulo', texto: rival ? nombreCompleto(rival) : 'Rival borrado' }),
      crear('span', { class: 'ficha-detalle', texto: detalles }),
    ]));
  }

  anadir(contenedor,
    crear('div', { class: 'cabecera' }, [
      crear('h2', { class: 'titulo-pantalla', texto: 'Mis asaltos' }),
      crear('button', {
        type: 'button', class: 'boton-menu', texto: 'Menú',
        onclick: () => ir('menu'),
      }),
    ]),
    vacia ? crear('div', { class: 'sugerencia' }, [
      crear('p', { class: 'texto-ayuda', texto:
        '¿Quieres rellenar la base de datos de rivales y competiciones de tus ' +
        'categorías? Se traen de la federación y así no tienes que darlos de ' +
        'alta uno a uno.' }),
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Sí, rellenarlo',
        onclick: () => ir('preparar'),
      }),
    ]) : null,

    crear('button', {
      type: 'button', class: vacia ? 'boton' : 'boton boton-principal', texto: 'Nuevo asalto',
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

  // --- Elección del rival ---
  // Con rankings enteros importados puede haber cientos de fichas, así que
  // no vale un desplegable: se busca escribiendo y se eligen de una lista
  // corta.
  const porId = new Map(rivales.map((r) => [r.id, r]));
  let manoElegida = null;

  const buscador = campo('Buscar rival', {
    placeholder: 'Escribe parte del nombre o del club', oninput: pintarCandidatos,
  });
  const candidatos = crear('div', { class: 'lista candidatos' });
  const elegido = crear('div');

  function rivalActual() {
    return rivalId != null ? porId.get(rivalId) : null;
  }

  function pintarCandidatos() {
    const busqueda = normalizar(buscador.entrada.value);
    if (!busqueda) { rellenar(candidatos, []); return; }

    const encontrados = rivales
      .filter((r) => normalizar(nombreCompleto(r) + ' ' + (r.club || '')).includes(busqueda))
      .slice(0, 8);

    rellenar(candidatos, encontrados.length === 0
      ? crear('p', { class: 'ayuda', texto: 'Nadie coincide. Puedes darlo de alta abajo.' })
      : encontrados.map((r) => crear('button', {
          type: 'button', class: 'ficha-lista',
          onclick: () => {
            rivalId = r.id;
            manoElegida = null;
            buscador.entrada.value = '';
            rellenar(candidatos, []);
            pintarElegido();
          },
        }, [
          crear('span', { class: 'ficha-titulo', texto: nombreCompleto(r) }),
          crear('span', {
            class: 'ficha-detalle',
            texto: [r.club, r.mano ? etiquetaDe(MANOS, r.mano, generoDelUsuario()) : 'sin mano'].filter(Boolean).join(' · '),
          }),
        ])));
  }

  function pintarElegido() {
    const rival = rivalActual();

    if (!rival) {
      rellenar(elegido, crear('p', { class: 'ayuda', texto: 'Ningún rival elegido todavía.' }));
      return;
    }

    const partes = [
      crear('div', { class: 'ficha-lista' }, [
        crear('span', { class: 'ficha-titulo', texto: nombreCompleto(rival) }),
        crear('span', {
          class: 'ficha-detalle',
          texto: [rival.club, rival.fechaNacimiento ? `n. ${formatearFecha(rival.fechaNacimiento)}` : '']
            .filter(Boolean).join(' · '),
        }),
      ]),
      crear('button', {
        type: 'button', class: 'boton', texto: 'Editar ficha del rival',
        onclick: () => ir('rival', {
          id: rival.id,
          volverA: 'asalto-nuevo',
          datosVuelta: { ...datos, rivalIdElegido: rival.id },
        }),
      }),
    ];

    // La mano del rival no puede quedarse vacía: es uno de los filtros de
    // las estadísticas, y sin ella ese asalto quedaría fuera. Si la ficha no
    // la tiene, se pide aquí mismo antes de poder guardar.
    if (!rival.mano) {
      partes.push(desplegable(`Mano de ${nombreCompleto(rival)} (obligatorio)`,
        opcionesPara(MANOS, generoDelUsuario()), manoElegida, (valor) => {
          manoElegida = valor;
          avisoMano.hidden = true;
        }, { vacio: '— Elige —' }).bloque);
      partes.push(crear('p', {
        class: 'ayuda',
        texto: 'Su ficha no dice con qué mano tira. Hace falta para las ' +
               'estadísticas, y se guardará en su ficha. Si no lo sabes, marca ' +
               '"Desconocido": ese asalto no aparecerá al filtrar por mano.',
      }));
    }

    rellenar(elegido, partes);
  }

  const avisoMano = crear('p', {
    class: 'aviso', hidden: true,
    texto: 'Falta indicar con qué mano tira el rival.',
  });

  const numero = campo('Número de asalto de la sesión', {
    value: asalto.numero || '', type: 'number', inputmode: 'numeric', placeholder: '1',
  });
  const fecha = campo('Fecha', { value: asalto.fecha || hoy(), type: 'date' });
  const fatiga = deslizador('Fatiga percibida', {
    min: 1, max: 5, valor: asalto.fatiga || FATIGA_POR_DEFECTO,
  });
  const nota = campoLargo('Nota', { value: asalto.nota || '' });

  // --- Competición ---
  // Antes era un campo de texto que había que teclear en cada asalto. Ahora
  // se elige de las que tengas guardadas, que se traen del calendario de la
  // federación o se añaden a mano.
  let competicionId = datos.competicionIdElegida ?? asalto.competicionId ?? null;

  const competiciones = (await listar(ALMACENES.competiciones))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const selectorCompeticion = crear('select', {
    class: 'entrada',
    onchange: (evento) => { competicionId = Number(evento.target.value) || null; },
  });
  selectorCompeticion.append(crear('option', {
    value: '', texto: '— Ninguna (entrenamiento) —',
  }));
  for (const competicion of competiciones) {
    const opcion = crear('option', {
      value: competicion.id,
      texto: [competicion.nombre, competicion.categoria, formatearFecha(competicion.fecha)]
        .filter(Boolean).join(' · '),
    });
    if (competicion.id === competicionId) opcion.selected = true;
    selectorCompeticion.append(opcion);
  }

  const aviso = crear('p', { class: 'aviso', texto: 'Elige un rival.', hidden: true });

  anadir(contenedor,
    cabecera(esNuevo ? 'Nuevo asalto' : 'Editar asalto',
             () => ir(esNuevo ? 'inicio' : 'asalto', { id: datos.id })),

    bloque('Rival', crear('div', {}, [
      elegido,
      buscador.bloque,
      candidatos,
      avisoMano,
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
    bloque('Competición', crear('div', {}, [
      selectorCompeticion,
      crear('button', {
        type: 'button', class: 'boton', texto: 'Añadir una competición',
        onclick: () => ir('competicion', {
          volverA: 'asalto-nuevo',
          alCrear: (id) => ir('asalto-nuevo', { ...datos, competicionIdElegida: id }),
        }),
      }),
    ])),
    desplegable('Fase', FASES, fase, (valor) => { fase = valor; },
                { vacio: '— Sin indicar —' }).bloque,
    fatiga.bloque,
    nota.bloque,
    aviso,

    crear('button', {
      type: 'button', class: 'boton boton-principal',
      texto: esNuevo ? 'Crear asalto' : 'Guardar cambios',
      onclick: async () => {
        if (!rivalId) { aviso.hidden = false; return; }
        aviso.hidden = true;

        // Sin la mano del rival no se guarda: las estadísticas se filtran por
        // ella y un asalto sin ese dato quedaría cojo.
        const rival = rivalActual();
        if (rival && !rival.mano) {
          if (!manoElegida) {
            avisoMano.hidden = false;
            avisoMano.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
          await guardar(ALMACENES.tiradores, { ...rival, mano: manoElegida });
        }

        const ficha = {
          ...(asalto.id !== undefined ? { id: asalto.id } : {}),
          rivalId,
          numero: numero.entrada.value ? Number(numero.entrada.value) : null,
          fecha: fecha.entrada.value || hoy(),
          tipoSesion,
          competicionId,
          fase,
          // El club no se pregunta aquí: ya está en la ficha del rival.
          fatiga: Number(fatiga.entrada.value),
          nota: nota.entrada.value.trim(),
        };

        const id = await guardar(ALMACENES.asaltos, ficha);
        ir('asalto', { id });
      },
    }),
  );

  // Si ya venía un rival elegido —porque estás editando el asalto o acabas
  // de darlo de alta— hay que pintarlo ahora.
  pintarElegido();
}

// --- Detalle de un asalto: sus tiempos --------------------------------

export async function pantallaAsalto(contenedor, datos = {}) {
  const asalto = await obtener(ALMACENES.asaltos, datos.id);
  if (!asalto) { ir('inicio'); return; }

  const [rival, tiempos, competicion] = await Promise.all([
    obtener(ALMACENES.tiradores, asalto.rivalId),
    listarPor(ALMACENES.tiempos, 'por-asalto', asalto.id),
    asalto.competicionId != null
      ? obtener(ALMACENES.competiciones, asalto.competicionId)
      : Promise.resolve(null),
  ]);
  tiempos.sort((a, b) => a.orden - b.orden);

  const contexto = [
    formatearFecha(asalto.fecha),
    asalto.numero ? `Asalto ${asalto.numero}` : '',
    etiquetaDe(TIPOS_DE_SESION, asalto.tipoSesion),
    nombreDeCompeticion(competicion, asalto),
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

  anadir(contenedor,
    cabecera(rival ? nombreCompleto(rival) : 'Rival borrado', () => ir('inicio')),

    crear('p', { class: 'ayuda', texto: contexto }),
    // El club del rival sale de su ficha, no se vuelve a preguntar en cada asalto.
    rivalEnUnaLinea(rival),

    rival ? crear('button', {
      type: 'button', class: 'boton', texto: 'Editar ficha del rival',
      onclick: () => ir('rival', {
        id: rival.id,
        volverA: 'asalto',
        datosVuelta: { id: asalto.id },
      }),
    }) : null,

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

/**
 * Cómo se nombra la competición de un asalto.
 * Los asaltos de antes de que existieran las competiciones guardaban el
 * torneo como texto suelto; si lo tienen, se sigue mostrando.
 */
function nombreDeCompeticion(competicion, asalto) {
  if (competicion) return competicion.nombre;
  return asalto.torneo || '';
}

/** Resume al rival en una línea: mano, club y altura, lo que haya. */
function rivalEnUnaLinea(rival) {
  if (!rival) return null;
  const genero = generoDelUsuario();
  const partes = [
    etiquetaDe(MANOS, rival.mano, genero),
    rival.empunadura ? etiquetaDe(EMPUNADURAS, rival.empunadura) : null,
    rival.club,
    etiquetaDe(ESTATURAS, rival.estatura, genero),
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
