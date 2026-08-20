// Pantallas de rivales: la lista y la ficha de uno.
//
// Los rivales se guardan aparte porque se repiten mucho de un torneo a otro:
// interesa darlos de alta una vez y luego elegirlos de la lista.
//
// Desde que se pueden traer rankings enteros de la federación, la lista puede
// tener cientos de fichas. Por eso es una tabla con scroll y buscador, y por
// eso se ordena poniendo arriba a quienes más te has cruzado.

import { crear, rellenar, cabecera, ir, campo } from '../ui.js';
import { fichaTirador } from './ficha-tirador.js';
import { etiquetaDe, MANOS, nombreCompleto, normalizar } from '../constantes.js';
import {
  ALMACENES, listarRivales, listar, guardar, obtener, borrar, listarPor,
} from '../db.js';

export async function pantallaRivales(contenedor, datos = {}) {
  const volverA = datos.volverA || 'inicio';
  const [rivales, asaltos] = await Promise.all([
    listarRivales(),
    listar(ALMACENES.asaltos),
  ]);

  // Cuántos asaltos has disputado contra cada uno.
  const cuenta = new Map();
  for (const asalto of asaltos) {
    cuenta.set(asalto.rivalId, (cuenta.get(asalto.rivalId) || 0) + 1);
  }

  // Primero los que más veces te has cruzado; a igualdad, por orden alfabético.
  const ordenados = [...rivales].sort((a, b) => {
    const diferencia = (cuenta.get(b.id) || 0) - (cuenta.get(a.id) || 0);
    if (diferencia !== 0) return diferencia;
    return nombreCompleto(a).localeCompare(nombreCompleto(b), 'es');
  });

  const cuerpo = crear('tbody');
  const buscador = campo('Buscar', { placeholder: 'Nombre o club', oninput: pintarFilas });
  const contador = crear('p', { class: 'ayuda' });

  contenedor.append(
    cabecera('Rivales', () => ir(volverA)),

    crear('button', {
      type: 'button', class: 'boton boton-principal', texto: 'Nuevo rival a mano',
      onclick: () => ir('rival', { volverA: 'rivales' }),
    }),
    crear('button', {
      type: 'button', class: 'boton', texto: 'Traer de la RFEE',
      onclick: () => ir('importar-rfee'),
    }),

    rivales.length === 0 ? crear('p', {
      class: 'ayuda',
      texto: 'Todavía no hay ningún rival. Da de alta el primero, o trae una ' +
             'categoría entera del ranking de la federación.',
    }) : null,

    rivales.length > 0 ? buscador.bloque : null,
    contador,

    rivales.length > 0 ? crear('div', { class: 'tabla-scroll' }, [
      crear('table', { class: 'tabla-rivales' }, [
        crear('thead', {}, [
          crear('tr', {}, [
            crear('th', { texto: 'Tirador' }),
            crear('th', { texto: 'Club' }),
            crear('th', { class: 'derecha', texto: 'Asaltos' }),
            crear('th', { texto: 'Mano' }),
          ]),
        ]),
        cuerpo,
      ]),
    ]) : null,
  );

  pintarFilas();

  // ------------------------------------------------------------------

  function pintarFilas() {
    const busqueda = normalizar(buscador.entrada.value);
    const visibles = busqueda
      ? ordenados.filter((r) => normalizar(nombreCompleto(r) + ' ' + (r.club || '')).includes(busqueda))
      : ordenados;

    contador.textContent = busqueda
      ? `${visibles.length} de ${ordenados.length} rivales.`
      : `${ordenados.length} rival${ordenados.length === 1 ? '' : 'es'}.`;

    rellenar(cuerpo, visibles.map((rival) => crear('tr', {
      class: 'fila-rival',
      onclick: () => ir('rival', { id: rival.id, volverA: 'rivales' }),
    }, [
      crear('td', { texto: nombreCompleto(rival) }),
      crear('td', { class: 'apagado', texto: rival.club || '—' }),
      crear('td', { class: 'derecha', texto: String(cuenta.get(rival.id) || 0) }),
      // La mano es la que falta cuando el rival viene de la federación, y
      // hace falta para las estadísticas. Por eso se señala.
      rival.mano
        ? crear('td', { texto: etiquetaDe(MANOS, rival.mano) })
        : crear('td', { class: 'falta', texto: 'falta' }),
    ])));

    if (visibles.length === 0) {
      rellenar(cuerpo, crear('tr', {}, [
        crear('td', { colspan: '4', class: 'apagado', texto: 'Nadie coincide con esa búsqueda.' }),
      ]));
    }
  }
}

export async function pantallaRival(contenedor, datos = {}) {
  const rival = datos.id !== undefined
    ? await obtener(ALMACENES.tiradores, datos.id)
    : {};
  const esNuevo = datos.id === undefined;
  const volverA = datos.volverA || 'rivales';

  const { formulario, leer } = fichaTirador(rival);

  const botones = [
    crear('button', {
      type: 'button',
      class: 'boton boton-principal',
      texto: esNuevo ? 'Crear rival' : 'Guardar cambios',
      onclick: async () => {
        const ficha = leer();
        if (!ficha) return;
        const id = await guardar(ALMACENES.tiradores, ficha);
        // Si veníamos de crear un asalto, volvemos allí con el rival ya elegido.
        if (datos.alCrear) datos.alCrear(id);
        else ir(volverA, datos.datosVuelta || {});
      },
    }),
  ];

  if (!esNuevo) {
    botones.push(crear('button', {
      type: 'button',
      class: 'boton boton-peligro',
      texto: 'Borrar rival',
      onclick: async () => {
        const asaltos = await listarPor(ALMACENES.asaltos, 'por-rival', rival.id);
        if (asaltos.length > 0) {
          alert(`No se puede borrar: tiene ${asaltos.length} asalto(s) guardado(s). ` +
                'Borra antes esos asaltos.');
          return;
        }
        if (!confirm(`¿Borrar a ${nombreCompleto(rival)}?`)) return;
        await borrar(ALMACENES.tiradores, rival.id);
        ir(volverA, datos.datosVuelta || {});
      },
    }));
  }

  contenedor.append(
    cabecera(esNuevo ? 'Nuevo rival' : nombreCompleto(rival),
             () => ir(volverA, datos.datosVuelta || {})),

    rival.origen === 'rfee' ? crear('p', {
      class: 'ayuda',
      texto: `Ficha traída del ranking de la RFEE (${rival.categoriaRfee}, ` +
             `${rival.temporadaRfee}). La mano no la publican: ponla tú.`,
    }) : null,

    formulario,
    ...botones,
  );
}
