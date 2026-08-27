// Pantallas de asaltos: la lista, el alta y el detalle de uno.
//
// Recuerda la estructura: un asalto tiene uno o varios TIEMPOS (en poule
// suele ser uno; en directas, dos o tres), y cada tiempo tiene su vídeo.

import {
  anadir, crear, rellenar, cabecera, ir, campo, campoLargo, bloque, desplegable,
  formatearFecha, formatearBytes, formatearSegundos,
} from '../ui.js';
import {
  FASES, PRIORIDADES, MANOS, EMPUNADURAS, etiquetaDe, nombreCompleto,
  coincide, opcionesPara,
} from '../constantes.js';
import { generoDelUsuario } from '../genero.js';
import { resumirCompeticion } from '../competiciones.js';
import {
  ALMACENES, guardar, obtener, listar, listarPor, listarRivales, obtenerPerfilPropio,
  guardarVideo, borrarAsalto, borrarTiempo, comprobarLegible,
} from '../db.js';


// Dentro de una competición, el orden de las fases ES el orden del día: la
// poule es lo primero que se tira y la final lo último. Para enseñar lo más
// reciente arriba, se recorre al revés.
const ORDEN_DE_FASE = new Map(FASES.map((fase, posicion) => [fase.id, posicion]));

/**
 * Cómo se nombra una competición al elegirla: primero la categoría, que es
 * por donde se busca cuando compites en dos, y luego el torneo, dónde se
 * celebra y el día.
 *
 * La población no sobra: el circuito reparte el mismo torneo, con el mismo
 * nombre y la misma categoría, por media Europa. Sin la ciudad, dos entradas
 * seguidas de la lista son indistinguibles y se elige la que no era.
 */
function etiquetaDeCompeticion(competicion) {
  return [competicion.categoria, competicion.nombre, competicion.poblacion,
          formatearFecha(competicion.fecha)]
    .filter(Boolean).join(' · ');
}

/**
 * Aunque se lean empezando por la categoría, se colocan por fecha: la última
 * arriba, que es la que estás apuntando.
 */
function compararCompeticiones(a, b) {
  return (b.fecha || '').localeCompare(a.fecha || '')
      || (a.categoria || '').localeCompare(b.categoria || '', 'es')
      || (a.nombre || '').localeCompare(b.nombre || '', 'es');
}

/**
 * El año en que nació un rival, que es lo único que se enseña de su fecha.
 * Las fichas traídas de la federación llegaron con la fecha entera.
 */
function anoDeNacimiento(tirador) {
  return (tirador.fechaNacimiento || '').slice(0, 4);
}

/** Cuándo se tiró un asalto: lo dice su competición. */
function fechaDeAsalto(asalto, competicion) {
  // Los asaltos viejos guardaban su propia fecha, de cuando se preguntaba.
  return (competicion && competicion.fecha) || asalto.fecha || '';
}

// --- Lista de asaltos (pantalla de inicio) ----------------------------

// Cómo se agrupan los asaltos. Lo que agrupa desaparece de las filas: es lo
// que permite que la tabla quepa en un móvil sin desplazarla de lado.
const AGRUPACIONES = [
  { id: 'ninguna', etiqueta: 'Sin agrupar' },
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

  const filtros = { rival: null, competicion: null };
  let agrupacion = 'ninguna';

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
      class: 'ayuda explicacion',
      texto: 'Todavía no has registrado ningún asalto. Empieza por crear uno.',
    }) : null,

    // Una temporada entera son cientos de asaltos: sin filtrar ni agrupar,
    // la lista no hay quien la lea.
    asaltos.length > 0 ? crear('details', { class: 'filtros' }, [
      crear('summary', { texto: 'Filtros y agrupación' }),

      desplegable('Agrupar por', AGRUPACIONES, agrupacion,
        (valor) => { agrupacion = valor || 'ninguna'; pintar(); }).bloque,

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

    // De la más reciente a la más antigua, igual que al elegirla en el
    // asalto. Los que no son de ninguna competición, al final.
    const deCompeticion = [...new Set(asaltos.map((a) => claveDeCompeticion(a)))]
      .map((clave) => ({ clave, ...tituloDeCompeticion(clave) }))
      .sort((a, b) => {
        if (!a.competicion || !b.competicion) return a.competicion ? -1 : 1;
        return compararCompeticiones(a.competicion, b.competicion);
      })
      .map(({ clave, etiqueta }) => ({ id: clave, etiqueta }));

    return [
      deRival.length > 1 ? desplegable('Rival', deRival, null,
        (valor) => { filtros.rival = valor; pintar(); },
        { vacio: 'Todos los rivales' }).bloque : null,

      deCompeticion.length > 1 ? desplegable('Competición', deCompeticion, null,
        (valor) => { filtros.competicion = valor; pintar(); },
        { vacio: 'Todas las competiciones' }).bloque : null,
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

  /**
   * Cómo se llama un montón de asaltos: `titulo` y `detalle` son para la
   * cabecera del grupo, donde manda el nombre del torneo, y `etiqueta` para
   * el desplegable, donde se busca por categoría.
   */
  function tituloDeCompeticion(clave) {
    if (clave === 'sin') {
      return { titulo: 'Sin competición', etiqueta: 'Sin competición', orden: '' };
    }
    if (clave.startsWith('t')) {
      return { titulo: clave.slice(1), etiqueta: clave.slice(1), orden: '' };
    }

    const competicion = competicionPorId.get(Number(clave.slice(1)));
    return {
      competicion,
      titulo: competicion.nombre,
      // Misma razón que en la etiqueta: la ciudad es lo que distingue dos
      // competiciones que se llaman igual.
      detalle: [competicion.poblacion, formatearFecha(competicion.fecha)]
        .filter(Boolean).join(' · '),
      etiqueta: etiquetaDeCompeticion(competicion),
      orden: competicion.fecha || '',
    };
  }

  function pasaFiltros(asalto) {
    if (filtros.rival && String(asalto.rivalId) !== filtros.rival) return false;
    if (filtros.competicion && claveDeCompeticion(asalto) !== filtros.competicion) return false;
    return true;
  }

  function fechaDe(asalto) {
    return fechaDeAsalto(asalto, competicionPorId.get(asalto.competicionId));
  }

  /**
   * Sin agrupar, el orden es el de siempre en una lista: lo último que has
   * apuntado, arriba. Agrupando manda el calendario: el día de la competición
   * y, dentro de ella, la fase, que en un torneo es la hora del día. Los
   * asaltos sin fase quedan detrás de los que la tienen.
   */
  function ordenar(lista) {
    if (agrupacion === 'ninguna') return [...lista].sort((a, b) => b.id - a.id);

    const posicionDeFase = (asalto) => ORDEN_DE_FASE.get(asalto.fase) ?? -1;
    return [...lista].sort((a, b) =>
      fechaDe(b).localeCompare(fechaDe(a))
      || posicionDeFase(b) - posicionDeFase(a)
      || b.id - a.id);
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
    // Por rival mandan aquéllos con los que más te has cruzado; por
    // competición, la más reciente arriba. Dentro de cada montón el orden ya
    // viene dado, que los asaltos se ordenaron al cargarlos.
    if (agrupacion === 'rival') {
      salida.sort((a, b) => b.asaltos.length - a.asaltos.length
                         || a.titulo.localeCompare(b.titulo, 'es'));
    } else {
      salida.sort((a, b) => (b.orden || '').localeCompare(a.orden || ''));
    }
    return salida;
  }

  function filaDe(asalto) {
    const competicion = competicionPorId.get(asalto.competicionId);
    const enCompeticion = nombreDeCompeticion(competicion, asalto);

    // La columna principal dice lo que no está ya en la cabecera del grupo.
    const principal = agrupacion === 'rival'
      ? (enCompeticion || 'Sin competición')
      : nombreDeRival(rivalPorId.get(asalto.rivalId));

    // Sin cabecera de grupo, cada fila tiene que decir de dónde sale.
    // Agrupando por competición, en cambio, la fecha ya la dice la cabecera.
    let secundaria;
    if (agrupacion === 'ninguna') {
      secundaria = [enCompeticion, formatearFecha(fechaDe(asalto))].filter(Boolean).join(' · ');
    } else if (agrupacion === 'rival') {
      secundaria = formatearFecha(fechaDe(asalto));
    } else {
      secundaria = enCompeticion ? '' : formatearFecha(asalto.fecha);
    }

    return crear('tr', {
      class: 'fila-rival',
      onclick: () => ir('asalto', { id: asalto.id }),
    }, [
      crear('td', {}, [
        crear('span', { texto: principal }),
        secundaria ? crear('span', { class: 'segunda-linea', texto: secundaria }) : null,
      ]),
      crear('td', { class: 'apagado', texto: etiquetaDe(FASES, asalto.fase) || '—' }),
      crear('td', { class: 'derecha' }, [resultadoDelAsalto(asalto)]),
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
    const ordenados = ordenar(visibles);

    if (agrupacion === 'ninguna') {
      for (const asalto of ordenados) cuerpo.append(filaDe(asalto));
    } else {
      for (const grupo of agrupar(ordenados)) {
        cuerpo.append(crear('tr', { class: 'fila-grupo' }, [
          crear('td', { colspan: '3' }, [
            crear('span', { texto: grupo.titulo }),
            grupo.detalle ? crear('span', { class: 'apagado', texto: ` · ${grupo.detalle}` }) : null,
            crear('span', { class: 'cuenta-grupo', texto: String(grupo.asaltos.length) }),
          ]),
        ]));
        for (const asalto of grupo.asaltos) cuerpo.append(filaDe(asalto));
      }
    }

    rellenar(tabla, crear('div', { class: 'tabla-scroll' }, [
      crear('table', { class: 'tabla-rivales' }, [
        crear('thead', {}, [
          crear('tr', {}, [
            crear('th', { texto: agrupacion === 'rival' ? 'Competición' : 'Tirador' }),
            crear('th', { texto: 'Fase' }),
            crear('th', { class: 'derecha', texto: 'Resultado' }),
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

/**
 * Cómo acabó el asalto: tus tocados a la izquierda, los del rival a la
 * derecha. Verde si ganaste y rojo si perdiste, que es lo primero que se
 * busca al mirar la lista.
 */
function resultadoDelAsalto(asalto) {
  const final = asalto.tanteoFinal;
  if (!final) return crear('span', { class: 'apagado', texto: '—' });

  // En poule un asalto puede acabar en tablas si se agota el tiempo.
  const como = final.favor > final.contra ? ' victoria'
             : final.favor < final.contra ? ' derrota' : ' empate';

  return crear('span', {
    class: 'tanteo-pastilla' + como,
    texto: `${final.favor}–${final.contra}`,
  });
}

// --- Alta y edición de un asalto --------------------------------------

export async function pantallaAsaltoNuevo(contenedor, datos = {}) {
  const asalto = datos.id !== undefined ? await obtener(ALMACENES.asaltos, datos.id) : {};
  const esNuevo = datos.id === undefined;
  const rivales = await listarRivales();

  let rivalId = asalto.rivalId ?? null;
  let fase = asalto.fase || null;
  let prioridad = asalto.prioridad || null;

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

    // Sólo se enseña quién es. Corregir su ficha es cosa de Menú → Rivales.
    const partes = [
      crear('div', { class: 'ficha-lista' }, [
        crear('span', { class: 'ficha-titulo', texto: nombreCompleto(rival) }),
        crear('span', {
          class: 'ficha-detalle',
          texto: [rival.club, anoDeNacimiento(rival) ? `n. ${anoDeNacimiento(rival)}` : '']
            .filter(Boolean).join(' · '),
        }),
      ]),
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
        class: 'ayuda explicacion',
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


  // El resultado del asalto. Se pregunta aparte de las etiquetas porque el
  // vídeo puede no tenerlo todo: lo que se apunta aquí es cómo acabó de
  // verdad, lo diga o no la grabación.
  const tocadosFavor = crear('input', {
    class: 'entrada corta', type: 'number', min: 0, inputmode: 'numeric',
    'aria-label': 'Tus tocados',
    value: asalto.tanteoFinal ? asalto.tanteoFinal.favor : '',
  });
  const tocadosContra = crear('input', {
    class: 'entrada corta', type: 'number', min: 0, inputmode: 'numeric',
    'aria-label': 'Tocados del rival',
    value: asalto.tanteoFinal ? asalto.tanteoFinal.contra : '',
  });

  const bloqueResultado = crear('div', { class: 'bloque-campo' }, [
    crear('span', { class: 'etiqueta-campo', texto: 'Resultado final' }),
    crear('div', { class: 'resultado-final' }, [
      tocadosFavor,
      crear('span', { class: 'separador-resultado', texto: '–' }),
      tocadosContra,
    ]),
    crear('p', { class: 'ayuda explicacion', texto: 'Los tuyos a la izquierda, los del rival a la derecha.' }),
  ]);

  /** Lo que se guarda del resultado: nada si no has puesto ninguno. */
  function leerResultado() {
    const mios = tocadosFavor.value.trim();
    const suyos = tocadosContra.value.trim();
    if (mios === '' && suyos === '') return null;
    return {
      favor: Math.max(0, Number(mios) || 0),
      contra: Math.max(0, Number(suyos) || 0),
    };
  }
  const nota = campoLargo('Nota', { value: asalto.nota || '' });

  // --- Competición ---
  // Sólo se elige entre las que ya tengas guardadas. Darlas de alta, tocarlas
  // o borrarlas es cosa de Menú → Competiciones: aquí sólo se apunta cuál.
  let competicionId = asalto.competicionId ?? null;

  const guardadas = (await listar(ALMACENES.competiciones)).sort(compararCompeticiones);

  // En cuanto marcas una competición con el corazón, el desplegable se queda
  // sólo con las marcadas: el calendario de la federación son doscientas por
  // temporada y las tuyas son cuatro. Sin ninguna marcada salen todas, que es
  // como funcionaba antes.
  //
  // La del asalto que estás editando no se cae nunca aunque no tenga corazón:
  // si desapareciera de la lista, guardar volvería a dejar el asalto sin
  // competición sin haber tocado nada.
  const hayFavoritas = guardadas.some((c) => c.favorita);
  const competiciones = hayFavoritas
    ? guardadas.filter((c) => c.favorita || c.id === competicionId)
    : guardadas;

  const selectorCompeticion = crear('select', {
    class: 'entrada',
    onchange: (evento) => {
      competicionId = Number(evento.target.value) || null;
      pintarFecha();
    },
  });
  selectorCompeticion.append(crear('option', {
    value: '', texto: '— Sin indicar —',
  }));
  for (const competicion of competiciones) {
    const opcion = crear('option', {
      value: competicion.id,
      texto: etiquetaDeCompeticion(competicion),
    });
    if (competicion.id === competicionId) opcion.selected = true;
    selectorCompeticion.append(opcion);
  }

  const aviso = crear('p', { class: 'aviso', texto: 'Elige un rival.', hidden: true });

  // --- La fecha, sólo cuando no hay competición ---
  //
  // Lo normal es que un asalto salga de una competición, y de ella sale su
  // fecha. Pero la federación tarda en publicar el calendario, y darla de alta
  // a mano para salir del paso acaba en competiciones duplicadas: es mejor
  // dejar el asalto sin ella y asignársela cuando aparezca.
  //
  // Entonces la fecha hay que preguntarla, porque es lo único que sitúa al
  // asalto en el tiempo. Se pregunta y no se pone sola: se etiqueta con
  // retraso —grabas el sábado y lo repasas el martes—, y una fecha puesta a
  // escondidas colocaría el asalto en el día equivocado sin que te enteres.
  // Con hoy ya escrito, quien no quiera pensarlo no piensa.
  const hoy = new Date().toISOString().slice(0, 10);
  const fecha = campo('Fecha del asalto', {
    type: 'date', value: asalto.fecha || hoy,
  });
  const ayudaFecha = crear('p', {
    class: 'ayuda explicacion',
    texto: 'Sin competición, esto es lo único que dice cuándo se tiró. Cuando la ' +
           'federación publique el torneo, tráelo desde Competiciones y asígnalo ' +
           'aquí: entonces mandará su fecha.',
  });
  const bloqueFecha = crear('div', {}, [fecha.bloque, ayudaFecha]);

  function pintarFecha() {
    bloqueFecha.hidden = competicionId != null;
  }
  pintarFecha();

  anadir(contenedor,
    cabecera(esNuevo ? 'Nuevo asalto' : 'Editar asalto',
             () => ir(esNuevo ? 'inicio' : 'asalto', { id: datos.id })),

    bloque('Rival', crear('div', {}, [
      elegido,
      // Los rivales se dan de alta en su pantalla, no aquí: al crear un
      // asalto se elige entre los que ya tienes.
      rivales.length === 0 ? crear('p', {
        class: 'ayuda explicacion',
        texto: 'Todavía no hay ningún rival. Se dan de alta en Menú → Rivales, ' +
               'a mano o trayéndolos del ranking de la federación.',
      }) : buscador.bloque,
      candidatos,
      avisoMano,
    ])),

    bloque('Competición', crear('div', {}, [
      selectorCompeticion,
      hayFavoritas ? crear('p', {
        class: 'ayuda explicacion',
        texto: 'Sólo salen las que has marcado con el corazón en Competiciones.',
      }) : null,
    ])),
    bloqueFecha,
    desplegable('Fase', FASES, fase, (valor) => { fase = valor; },
                { vacio: '— Sin indicar —' }).bloque,
    bloqueResultado,
    desplegable('Prioridad', PRIORIDADES, prioridad, (valor) => { prioridad = valor; },
                { vacio: '— No hubo —' }).bloque,
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
          // El número de asalto ya no se pregunta, pero el que tuvieran los
          // asaltos viejos se conserva: las estadísticas filtran por él.
          numero: asalto.numero ?? null,
          // Con competición, la fecha sale de ella y ésta se guarda de todas
          // formas: si algún día se le quita la competición, el asalto no se
          // queda sin cuándo.
          fecha: fecha.entrada.value || asalto.fecha || null,
          competicionId,
          fase,
          tanteoFinal: leerResultado(),
          prioridad,
          // El club no se pregunta aquí: ya está en la ficha del rival.
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
    asalto.tanteoFinal ? `${asalto.tanteoFinal.favor}–${asalto.tanteoFinal.contra}` : '',
    nombreDeCompeticion(competicion, asalto),
    formatearFecha(fechaDeAsalto(asalto, competicion)),
    asalto.numero ? `Asalto ${asalto.numero}` : '',
    etiquetaDe(FASES, asalto.fase),
  ].filter(Boolean).join(' · ');

  const listaTiempos = crear('div', { class: 'lista' });
  await pintarTiempos(listaTiempos, asalto, tiempos);

  // Tu color en el asalto se preguntaba también aquí, y sobraba: se pregunta
  // en el tiempo, que es donde se etiqueta y el único sitio donde puedes
  // comprobarlo mirando el vídeo. Preguntarlo dos veces sólo servía para
  // contestar de memoria, y de memoria nadie se acuerda de qué lámpara le
  // tocó. El dato sigue colgando del asalto y valiendo para todos sus
  // tiempos: lo que se ha ido es la pregunta repetida.

  // --- Añadir un tiempo con su vídeo ---
  const progreso = crear('p', { class: 'progreso' });
  const entrada = crear('input', {
    type: 'file', accept: 'video/*', class: 'oculto-visualmente',
    id: 'selector-tiempo',
  });
  const etiquetaBoton = crear('label', {
    class: 'boton boton-principal boton-compacto', for: 'selector-tiempo',
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

    // Un empujón, no un regaño: el asalto está perfectamente bien así, pero
    // con la competición puesta cuenta para sus estadísticas y se agrupa con
    // los demás del mismo torneo.
    !competicion && !asalto.torneo ? crear('p', {
      class: 'ayuda explicacion',
      texto: 'Sin competición. Cuando la federación la publique, tráela desde ' +
             'Menú → Competiciones y asígnala aquí con "Editar datos del asalto".',
    }) : null,
    // El club del rival sale de su ficha, no se vuelve a preguntar en cada asalto.
    rivalEnUnaLinea(rival),

    crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Editar datos del asalto',
      onclick: () => ir('asalto-nuevo', { id: asalto.id }),
    }),

    crear('h3', { class: 'subtitulo-seccion', texto: 'Tiempos' }),
    crear('p', {
      class: 'ayuda explicacion',
      texto: 'Un asalto de poule suele tener un solo tiempo. En directas, dos o ' +
             'tres. Añade cada uno con su vídeo.',
    }),
    listaTiempos,
    entrada,
    etiquetaBoton,
    progreso,

    // Al final del todo y con su color: borrar un asalto se lleva por delante
    // los vídeos y las etiquetas, y no hay copia en ninguna parte.
    crear('button', {
      type: 'button', class: 'boton boton-peligro boton-compacto', texto: 'Borrar asalto',
      onclick: async () => {
        if (!confirm('¿Borrar este asalto con sus vídeos y sus etiquetas?')) return;
        await borrarAsalto(asalto.id);
        ir('inicio');
      },
    }),
  );
}

/**
 * Cómo se nombra la competición de un asalto: el torneo y dónde se tiró.
 *
 * La ciudad va pegada al nombre y no aparte porque el mismo torneo, con la
 * misma categoría y a veces el mismo día, se celebra en media Europa. Sin
 * ella, dos asaltos de sitios distintos se leen igual.
 *
 * Los asaltos de antes de que existieran las competiciones guardaban el
 * torneo como texto suelto; si lo tienen, se sigue mostrando tal cual.
 */
function nombreDeCompeticion(competicion, asalto) {
  if (competicion) {
    return [competicion.nombre, competicion.poblacion].filter(Boolean).join(' · ');
  }
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
  ].filter(Boolean);
  if (partes.length === 0) return null;
  return crear('p', { class: 'ayuda', texto: partes.join(' · ') });
}

/** Pinta la lista de tiempos de un asalto. */
async function pintarTiempos(lista, asalto, tiempos) {
  lista.textContent = '';

  if (tiempos.length === 0) {
    lista.append(crear('p', {
      class: 'ayuda explicacion',
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
