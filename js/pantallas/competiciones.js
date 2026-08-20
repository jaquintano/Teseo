// Pantallas de competiciones: la lista, la ficha de una y la importación.
//
// Funciona como la de rivales: puedes escribirlas a mano o traerlas del
// calendario de la federación. Un asalto puede apuntar a una competición, y
// así el contexto deja de teclearse en cada asalto.

import {
  anadir, crear, rellenar, cabecera, ir, campo, campoLargo, bloque, desplegable,
  formatearFecha,
} from '../ui.js';
import { normalizar } from '../constantes.js';
import { generoDelUsuario, categoriasDelUsuario } from '../genero.js';
import { ALMACENES, listar, listarPor, guardar, obtener, borrar } from '../db.js';
import {
  planParaMisCategorias, temporadasDisponibles, resumirCompeticion,
} from '../competiciones.js';

/** Las tuyas, de la más reciente a la más antigua. */
async function listarCompeticiones() {
  const todas = await listar(ALMACENES.competiciones);
  return todas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')
                           || a.nombre.localeCompare(b.nombre, 'es'));
}

// --- Lista ------------------------------------------------------------

export async function pantallaCompeticiones(contenedor, datos = {}) {
  const volverA = datos.volverA || 'menu';
  const [competiciones, asaltos] = await Promise.all([
    listarCompeticiones(),
    listar(ALMACENES.asaltos),
  ]);

  // Cuántos asaltos has registrado en cada una.
  const cuenta = new Map();
  for (const asalto of asaltos) {
    if (asalto.competicionId == null) continue;
    cuenta.set(asalto.competicionId, (cuenta.get(asalto.competicionId) || 0) + 1);
  }

  const cuerpo = crear('tbody');
  const buscador = campo('Buscar', { placeholder: 'Nombre o población', oninput: pintarFilas });
  const contador = crear('p', { class: 'ayuda' });

  anadir(contenedor,
    cabecera('Competiciones', () => ir(volverA)),

    crear('button', {
      type: 'button', class: 'boton boton-principal', texto: 'Nueva competición a mano',
      onclick: () => ir('competicion', { volverA: 'competiciones' }),
    }),
    // Con el calendario ya traído, volver a traerlo es ponerlo al día.
    crear('button', {
      type: 'button', class: 'boton',
      texto: competiciones.length === 0
        ? 'Traer del calendario de la RFEE'
        : 'Actualizar del calendario de la RFEE',
      onclick: () => ir('importar-competiciones'),
    }),

    competiciones.length === 0 ? crear('p', {
      class: 'ayuda',
      texto: 'Todavía no hay ninguna competición. Tráelas del calendario de la ' +
             'federación, o añade a mano las de tu club.',
    }) : null,

    competiciones.length > 0 ? buscador.bloque : null,
    contador,

    competiciones.length > 0 ? crear('div', { class: 'tabla-scroll' }, [
      crear('table', { class: 'tabla-rivales' }, [
        crear('thead', {}, [
          crear('tr', {}, [
            crear('th', { texto: 'Competición' }),
            crear('th', { texto: 'Fecha' }),
            crear('th', { class: 'derecha', texto: 'Asaltos' }),
          ]),
        ]),
        cuerpo,
      ]),
    ]) : null,
  );

  pintarFilas();

  function pintarFilas() {
    const busqueda = normalizar(buscador.entrada.value);
    const visibles = busqueda
      ? competiciones.filter((c) => normalizar(c.nombre + ' ' + (c.poblacion || '')).includes(busqueda))
      : competiciones;

    contador.textContent = busqueda
      ? `${visibles.length} de ${competiciones.length} competiciones.`
      : `${competiciones.length} competici${competiciones.length === 1 ? 'ón' : 'ones'}.`;

    rellenar(cuerpo, visibles.map((competicion) => crear('tr', {
      class: 'fila-rival',
      onclick: () => ir('competicion', { id: competicion.id, volverA: 'competiciones' }),
    }, [
      crear('td', {}, [
        crear('span', { texto: competicion.nombre }),
        crear('span', { class: 'segunda-linea', texto: resumirCompeticion(competicion) }),
      ]),
      crear('td', { class: 'apagado', texto: formatearFecha(competicion.fecha) }),
      crear('td', { class: 'derecha', texto: String(cuenta.get(competicion.id) || 0) }),
    ])));

    if (visibles.length === 0) {
      rellenar(cuerpo, crear('tr', {}, [
        crear('td', { colspan: '3', class: 'apagado', texto: 'Ninguna coincide con esa búsqueda.' }),
      ]));
    }
  }
}

// --- Ficha de una competición -----------------------------------------

export async function pantallaCompeticion(contenedor, datos = {}) {
  const competicion = datos.id !== undefined
    ? await obtener(ALMACENES.competiciones, datos.id)
    : {};
  const esNueva = datos.id === undefined;
  const volverA = datos.volverA || 'competiciones';

  const nombre = campo('Nombre', {
    value: competicion.nombre || '', placeholder: 'Nombre de la competición',
  });
  const fecha = campo('Fecha', { value: competicion.fecha || '', type: 'date' });
  const poblacion = campo('Población', {
    value: competicion.poblacion || '', placeholder: 'Dónde se celebró',
  });
  const notas = campoLargo('Notas', {
    value: competicion.notas || '', placeholder: 'Cómo fue, qué salió bien, qué no',
  });

  const aviso = crear('p', { class: 'aviso', texto: 'El nombre es obligatorio.', hidden: true });

  const botones = [
    crear('button', {
      type: 'button', class: 'boton boton-principal',
      texto: esNueva ? 'Crear competición' : 'Guardar cambios',
      onclick: async () => {
        const valorNombre = nombre.entrada.value.trim();
        if (!valorNombre) { aviso.hidden = false; nombre.entrada.focus(); return; }

        await guardar(ALMACENES.competiciones, {
          ...competicion,
          nombre: valorNombre,
          fecha: fecha.entrada.value || null,
          poblacion: poblacion.entrada.value.trim(),
          notas: notas.entrada.value.trim(),
          genero: competicion.genero || generoDelUsuario(),
          origen: competicion.origen || 'manual',
        });

        ir(volverA, datos.datosVuelta || {});
      },
    }),
  ];

  if (!esNueva) {
    botones.push(crear('button', {
      type: 'button', class: 'boton boton-peligro', texto: 'Borrar competición',
      onclick: async () => {
        const suyos = await listarPor(ALMACENES.asaltos, 'por-competicion', competicion.id);
        if (suyos.length > 0) {
          alert(`No se puede borrar: tiene ${suyos.length} asalto(s) registrado(s). ` +
                'Cámbiales la competición o bórralos antes.');
          return;
        }
        if (!confirm(`¿Borrar "${competicion.nombre}"?`)) return;
        await borrar(ALMACENES.competiciones, competicion.id);
        ir(volverA, datos.datosVuelta || {});
      },
    }));
  }

  anadir(contenedor,
    cabecera(esNueva ? 'Nueva competición' : competicion.nombre,
             () => ir(volverA, datos.datosVuelta || {})),

    competicion.origen === 'rfee' ? crear('p', {
      class: 'ayuda',
      texto: `Traída del calendario de la RFEE (${competicion.categoria}, ` +
             `temporada ${competicion.temporada}).`,
    }) : null,

    nombre.bloque,
    fecha.bloque,
    poblacion.bloque,
    notas.bloque,
    aviso,
    ...botones,
  );
}


// --- Importación del calendario ---------------------------------------
//
// Sólo pregunta la temporada. El arma es espada, la modalidad individual, el
// género el tuyo y las categorías en las que compites: todo eso ya está en
// tu perfil.

export async function pantallaImportarCompeticiones(contenedor) {
  const temporadas = await temporadasDisponibles();
  const genero = generoDelUsuario();
  const categorias = categoriasDelUsuario();

  anadir(contenedor, cabecera('Traer del calendario', () => ir('competiciones')));

  if (temporadas.length === 0) {
    anadir(contenedor, crear('p', {
      class: 'aviso',
      texto: 'Teseo no trae ningún calendario todavía. Hay que descargarlo antes ' +
             'con la herramienta del proyecto.',
    }));
    return;
  }

  if (categorias.length === 0) {
    anadir(contenedor,
      crear('p', {
        class: 'aviso',
        texto: 'Tu perfil no dice en qué categorías compites, y de ahí sale qué ' +
               'competiciones traerte.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Ir a mi perfil',
        onclick: () => ir('perfil', { volverA: 'competiciones' }),
      }),
    );
    return;
  }

  let temporada = temporadas[0];
  const resultado = crear('div');

  anadir(contenedor,
    crear('p', {
      class: 'ayuda',
      texto: `Se traen las competiciones de ${categorias.join(' y ')}, espada ` +
             `individual, ${genero === 'F' ? 'femenino' : 'masculino'}. Sale de tu perfil.`,
    }),

    bloque('Temporada', desplegable('',
      temporadas.map((t) => ({ id: t, etiqueta: t })), temporada,
      (valor) => { temporada = valor; refrescar(); }).entrada),

    resultado,
  );

  refrescar();

  async function refrescar() {
    rellenar(resultado, crear('p', { class: 'ayuda', texto: 'Comprobando…' }));

    const locales = await listar(ALMACENES.competiciones);
    const plan = await planParaMisCategorias({ temporada, genero, categorias }, locales);

    if (plan.categorias.length === 0) {
      rellenar(resultado, crear('p', {
        class: 'aviso',
        texto: `Teseo no trae competiciones de tus categorías para ${temporada}.`,
      }));
      return;
    }

    rellenar(resultado, [
      crear('p', {
        class: 'ayuda',
        texto: `Categorías encontradas: ${plan.categorias.join(', ')}.`,
      }),

      crear('div', { class: 'resumen' }, [
        dato(plan.nuevas.length, 'nuevas'),
        dato(plan.yaEstan, 'ya las tienes'),
      ]),

      plan.nuevas.length === 0
        ? crear('p', { class: 'ayuda', texto: 'No hay nada que traer.' })
        : crear('button', {
            type: 'button', class: 'boton boton-principal',
            texto: `Importar (${plan.nuevas.length})`,
            onclick: async (evento) => {
              evento.target.classList.add('desactivado');
              evento.target.textContent = 'Importando…';
              for (const ficha of plan.nuevas) {
                await guardar(ALMACENES.competiciones, ficha);
              }
              ir('competiciones');
            },
          }),
    ]);
  }

  function dato(valor, etiqueta) {
    return crear('div', { class: 'dato' }, [
      crear('span', { class: 'dato-valor', texto: String(valor) }),
      crear('span', { class: 'dato-etiqueta', texto: etiqueta }),
    ]);
  }
}
