// Pantallas de asaltos: la lista, el alta y el detalle de uno.
//
// Recuerda la estructura: un asalto tiene uno o varios TIEMPOS (en poule
// suele ser uno; en directas, dos o tres), y cada tiempo tiene su vídeo.

import {
  anadir, crear, rellenar, cabecera, ir, campo, campoLargo, bloque, desplegable,
  deslizador, colorDeEscala, formatearFecha, formatearBytes, formatearSegundos,
} from '../ui.js';
import {
  TIPOS_DE_SESION, TIPO_DE_SESION_POR_DEFECTO, FASES, MANOS, EMPUNADURAS,
  ESTATURAS, etiquetaDe, nombreCompleto, coincide, opcionesPara,
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

// Cómo se agrupan los asaltos. Lo que agrupa desaparece de las filas: es lo
// que permite que la tabla quepa en un móvil sin desplazarla de lado.
//
// Por fecha no se agrupa: una competición se tira en un día, así que sería
// partir los mismos montones dos veces.
const AGRUPACIONES = [
  { id: 'competicion', etiqueta: 'Competición' },
  { id: 'rival', etiqueta: 'Rival' },
];

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
  const rivalPorId = new Map(tiradores.map((t) => [t.id, t]));

  asaltos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id);

  const filtros = { rival: null, competicion: null, tipoSesion: null };
  let agrupacion = 'competicion';

  const tabla = crear('div');
  const contador = crear('p', { class: 'ayuda' });

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

    asaltos.length === 0 ? crear('p', {
      class: 'ayuda',
      texto: 'Todavía no has registrado ningún asalto. Empieza por crear uno.',
    }) : null,

    // Una temporada entera son cientos de asaltos: sin filtrar ni agrupar,
    // la lista no hay quien la lea.
    asaltos.length > 0 ? crear('details', { class: 'filtros' }, [
      crear('summary', { texto: 'Filtros y agrupación' }),

      desplegable('Agrupar por', AGRUPACIONES, agrupacion,
        (valor) => { agrupacion = valor || 'competicion'; pintar(); }).bloque,

      ...selectoresDeFiltro(),
    ]) : null,

    asaltos.length > 0 ? contador : null,
    tabla,
  );

  if (asaltos.length > 0) pintar();

  // ------------------------------------------------------------------

  /** Sólo se ofrece filtrar por lo que de verdad aparece en tus asaltos. */
  function selectoresDeFiltro() {
    const deRival = [...new Set(asaltos.map((a) => a.rivalId))]
      .map((id) => ({ id: String(id), etiqueta: nombreDeRival(rivalPorId.get(id)) }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

    // Las competiciones, de la más reciente a la más antigua, y los asaltos
    // que no son de ninguna al final.
    const deCompeticion = [...new Set(asaltos.map((a) => claveDeCompeticion(a)))]
      .map((clave) => ({ clave, ...tituloDeCompeticion(clave) }))
      .sort((a, b) => (b.orden || '').localeCompare(a.orden || ''))
      .map(({ clave, titulo }) => ({ id: clave, etiqueta: titulo }));

    const deTipo = TIPOS_DE_SESION.filter((t) => asaltos.some((a) => a.tipoSesion === t.id));

    return [
      deRival.length > 1 ? desplegable('Rival', deRival, null,
        (valor) => { filtros.rival = valor; pintar(); },
        { vacio: 'Todos los rivales' }).bloque : null,

      deCompeticion.length > 1 ? desplegable('Competición', deCompeticion, null,
        (valor) => { filtros.competicion = valor; pintar(); },
        { vacio: 'Todas las competiciones' }).bloque : null,

      deTipo.length > 1 ? desplegable('Tipo de sesión', deTipo, null,
        (valor) => { filtros.tipoSesion = valor; pintar(); },
        { vacio: 'Todos los tipos' }).bloque : null,
    ];
  }

  /**
   * Con qué competición va un asalto. Los de antes de que existieran las
   * competiciones guardaban el torneo como texto suelto, y ésos se agrupan
   * por ese texto.
   */
  function claveDeCompeticion(asalto) {
    if (asalto.competicionId != null && competicionPorId.has(asalto.competicionId)) {
      return `c${asalto.competicionId}`;
    }
    return asalto.torneo ? `t${asalto.torneo}` : 'sin';
  }

  function tituloDeCompeticion(clave) {
    if (clave === 'sin') return { titulo: 'Sin competición', orden: '' };
    if (clave.startsWith('t')) return { titulo: clave.slice(1), orden: '' };

    const competicion = competicionPorId.get(Number(clave.slice(1)));
    return {
      titulo: competicion.nombre,
      detalle: formatearFecha(competicion.fecha),
      orden: competicion.fecha || '',
    };
  }

  function pasaFiltros(asalto) {
    if (filtros.rival && String(asalto.rivalId) !== filtros.rival) return false;
    if (filtros.competicion && claveDeCompeticion(asalto) !== filtros.competicion) return false;
    if (filtros.tipoSesion && asalto.tipoSesion !== filtros.tipoSesion) return false;
    return true;
  }

  function grupoDe(asalto) {
    if (agrupacion === 'rival') {
      return {
        clave: `r${asalto.rivalId}`,
        titulo: nombreDeRival(rivalPorId.get(asalto.rivalId)),
      };
    }
    const clave = claveDeCompeticion(asalto);
    return { clave, ...tituloDeCompeticion(clave) };
  }

  function agrupar(lista) {
    const grupos = new Map();
    for (const asalto of lista) {
      const grupo = grupoDe(asalto);
      if (!grupos.has(grupo.clave)) grupos.set(grupo.clave, { ...grupo, asaltos: [] });
      grupos.get(grupo.clave).asaltos.push(asalto);
    }

    const salida = [...grupos.values()];
    // Por rival mandan aquéllos con los que más te has cruzado. Si no, arriba
    // lo más reciente: manda la fecha del asalto más nuevo del grupo y no la
    // de la competición, que puede estar mal puesta en el calendario.
    if (agrupacion === 'rival') {
      salida.sort((a, b) => b.asaltos.length - a.asaltos.length
                         || a.titulo.localeCompare(b.titulo, 'es'));
    } else {
      const masReciente = (grupo) => grupo.asaltos[0].fecha || '';
      salida.sort((a, b) => masReciente(b).localeCompare(masReciente(a)));
    }
    return salida;
  }

  function filaDe(asalto) {
    const competicion = competicionPorId.get(asalto.competicionId);
    const enCompeticion = nombreDeCompeticion(competicion, asalto);
    const tipo = etiquetaDe(TIPOS_DE_SESION, asalto.tipoSesion);

    // La columna principal dice lo que no está ya en la cabecera del grupo.
    const principal = agrupacion === 'rival'
      ? (enCompeticion || tipo || 'Sin competición')
      : nombreDeRival(rivalPorId.get(asalto.rivalId));

    // Agrupando por competición, la fecha ya la dice la cabecera del grupo:
    // sólo hace falta en los asaltos que no son de ninguna.
    const secundaria = agrupacion === 'rival'
      ? formatearFecha(asalto.fecha)
      : (enCompeticion ? '' : [tipo, formatearFecha(asalto.fecha)].filter(Boolean).join(' · '));

    return crear('tr', {
      class: 'fila-rival',
      onclick: () => ir('asalto', { id: asalto.id }),
    }, [
      crear('td', {}, [
        crear('span', { texto: principal }),
        secundaria ? crear('span', { class: 'segunda-linea', texto: secundaria }) : null,
      ]),
      crear('td', { class: 'apagado', texto: etiquetaDe(FASES, asalto.fase) || '—' }),
      crear('td', { class: 'derecha' }, [puntoDeFatiga(asalto.fatiga)]),
    ]);
  }

  function pintar() {
    const visibles = asaltos.filter(pasaFiltros);

    contador.textContent = visibles.length === asaltos.length
      ? `${asaltos.length} asalto${asaltos.length === 1 ? '' : 's'}.`
      : `${visibles.length} de ${asaltos.length} asaltos.`;

    if (visibles.length === 0) {
      rellenar(tabla, crear('p', {
        class: 'ayuda', texto: 'Ningún asalto cumple estos filtros.',
      }));
      return;
    }

    const cuerpo = crear('tbody');
    for (const grupo of agrupar(visibles)) {
      cuerpo.append(crear('tr', { class: 'fila-grupo' }, [
        crear('td', { colspan: '3' }, [
          crear('span', { texto: grupo.titulo }),
          grupo.detalle ? crear('span', { class: 'apagado', texto: ` · ${grupo.detalle}` }) : null,
          crear('span', { class: 'cuenta-grupo', texto: String(grupo.asaltos.length) }),
        ]),
      ]));
      for (const asalto of grupo.asaltos) cuerpo.append(filaDe(asalto));
    }

    rellenar(tabla, crear('div', { class: 'tabla-scroll' }, [
      crear('table', { class: 'tabla-rivales' }, [
        crear('thead', {}, [
          crear('tr', {}, [
            crear('th', { texto: agrupacion === 'rival' ? 'Competición' : 'Tirador' }),
            crear('th', { texto: 'Fase' }),
            crear('th', { class: 'derecha', texto: 'Fatiga' }),
          ]),
        ]),
        cuerpo,
      ]),
    ]));
  }
}

function nombreDeRival(rival) {
  return rival ? nombreCompleto(rival) : 'Rival borrado';
}

/** La fatiga, con la misma escala de color que la barra del formulario. */
function puntoDeFatiga(fatiga) {
  if (!fatiga) return crear('span', { class: 'apagado', texto: '—' });

  const punto = crear('span', {
    class: 'punto-fatiga',
    texto: String(fatiga),
    title: `Fatiga ${fatiga} de 5`,
  });
  punto.style.background = colorDeEscala((fatiga - 1) / 4);
  return punto;
}

// --- Alta y edición de un asalto --------------------------------------

export async function pantallaAsaltoNuevo(contenedor, datos = {}) {
  const asalto = datos.id !== undefined ? await obtener(ALMACENES.asaltos, datos.id) : {};
  const esNuevo = datos.id === undefined;
  const rivales = await listarRivales();

  // Si venimos de corregir la ficha del rival, ya llega elegido.
  let rivalId = datos.rivalIdElegido ?? asalto.rivalId ?? null;
  let tipoSesion = asalto.tipoSesion || TIPO_DE_SESION_POR_DEFECTO;
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
    const busqueda = buscador.entrada.value.trim();
    if (!busqueda) { rellenar(candidatos, []); return; }

    const encontrados = rivales
      .filter((r) => coincide(nombreCompleto(r) + ' ' + (r.club || ''), busqueda));
    // De pie en la sala no se lee una lista larga; si no está entre los
    // primeros, más vale escribir otra palabra que ponerse a buscar.
    const primeros = encontrados.slice(0, 8);

    rellenar(candidatos, encontrados.length === 0
      ? crear('p', {
          class: 'ayuda',
          texto: 'Nadie coincide. Los rivales se dan de alta en Menú → Rivales.',
        })
      : primeros.map((r) => crear('button', {
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

    if (encontrados.length > primeros.length) {
      candidatos.append(crear('p', {
        class: 'ayuda',
        texto: `Y ${encontrados.length - primeros.length} más. Escribe otra ` +
               'palabra para afinar.',
      }));
    }
  }

  function pintarElegido() {
    const rival = rivalActual();

    // Con uno ya elegido, el buscador de abajo sirve para cambiarlo.
    buscador.rotulo.textContent = rival ? 'Cambiar rival' : 'Buscar rival';

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

  const fecha = campo('Fecha', { value: asalto.fecha || hoy(), type: 'date' });
  const fatiga = deslizador('Fatiga percibida', {
    min: 1, max: 5, valor: asalto.fatiga || FATIGA_POR_DEFECTO,
  });
  const nota = campoLargo('Nota', { value: asalto.nota || '' });

  // --- Competición ---
  // Sólo se elige entre las que ya tengas guardadas. Darlas de alta, tocarlas
  // o borrarlas es cosa de Menú → Competiciones: aquí sólo se apunta cuál.
  let competicionId = asalto.competicionId ?? null;

  const competiciones = (await listar(ALMACENES.competiciones))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const selectorCompeticion = crear('select', {
    class: 'entrada',
    onchange: (evento) => { competicionId = Number(evento.target.value) || null; },
  });
  selectorCompeticion.append(crear('option', {
    value: '', texto: '— Sin indicar —',
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

  // La competición y la fase sólo tienen sentido si el asalto es de
  // competición; en un entrenamiento estorban.
  const bloqueCompeticion = bloque('Competición', selectorCompeticion);
  const bloqueFase = desplegable('Fase', FASES, fase, (valor) => { fase = valor; },
                                 { vacio: '— Sin indicar —' }).bloque;

  function refrescarPorTipo() {
    const esDeCompeticion = tipoSesion === 'competicion';
    bloqueCompeticion.hidden = !esDeCompeticion;
    bloqueFase.hidden = !esDeCompeticion;
  }

  anadir(contenedor,
    cabecera(esNuevo ? 'Nuevo asalto' : 'Editar asalto',
             () => ir(esNuevo ? 'inicio' : 'asalto', { id: datos.id })),

    bloque('Rival', crear('div', {}, [
      elegido,
      // Los rivales se dan de alta en su pantalla, no aquí: al crear un
      // asalto se elige entre los que ya tienes.
      rivales.length === 0 ? crear('p', {
        class: 'ayuda',
        texto: 'Todavía no hay ningún rival. Se dan de alta en Menú → Rivales, ' +
               'a mano o trayéndolos del ranking de la federación.',
      }) : buscador.bloque,
      candidatos,
      avisoMano,
    ])),

    fecha.bloque,
    desplegable('Tipo de sesión', TIPOS_DE_SESION, tipoSesion, (valor) => {
      tipoSesion = valor;
      refrescarPorTipo();
    }).bloque,
    bloqueCompeticion,
    bloqueFase,
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

        // Fuera de una competición no hay ni torneo ni fase que apuntar, así
        // que no se quedan guardados de un cambio de idea.
        const esDeCompeticion = tipoSesion === 'competicion';

        const ficha = {
          ...(asalto.id !== undefined ? { id: asalto.id } : {}),
          rivalId,
          // El número de asalto ya no se pregunta, pero el que tuvieran los
          // asaltos viejos se conserva: las estadísticas filtran por él.
          numero: asalto.numero ?? null,
          fecha: fecha.entrada.value || hoy(),
          tipoSesion,
          competicionId: esDeCompeticion ? competicionId : null,
          fase: esDeCompeticion ? fase : null,
          // El club no se pregunta aquí: ya está en la ficha del rival.
          fatiga: Number(fatiga.entrada.value),
          nota: nota.entrada.value.trim(),
        };

        const id = await guardar(ALMACENES.asaltos, ficha);
        ir('asalto', { id });
      },
    }),
  );

  // Si ya venía un rival elegido —porque estás editando el asalto o vuelves
  // de corregir su ficha— hay que pintarlo ahora.
  pintarElegido();
  refrescarPorTipo();
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
