// Pantallas de rivales: la lista y la ficha de uno.
//
// Los rivales se guardan aparte porque se repiten mucho de un torneo a otro:
// interesa darlos de alta una vez y luego elegirlos de la lista.

import { crear, cabecera, ir } from '../ui.js';
import { fichaTirador } from './ficha-tirador.js';
import { etiquetaDe, MANOS } from '../constantes.js';
import {
  ALMACENES, listarRivales, guardar, obtener, borrar, listarPor,
} from '../db.js';

export async function pantallaRivales(contenedor, datos = {}) {
  const rivales = await listarRivales();
  const volverA = datos.volverA || 'inicio';

  const lista = crear('div', { class: 'lista' });

  if (rivales.length === 0) {
    lista.append(crear('p', {
      class: 'ayuda',
      texto: 'Todavía no hay ningún rival. Da de alta el primero.',
    }));
  }

  for (const rival of rivales) {
    const detalles = [
      etiquetaDe(MANOS, rival.mano),
      rival.club,
      rival.altura ? `${rival.altura} cm` : '',
    ].filter(Boolean).join(' · ');

    lista.append(crear('button', {
      type: 'button',
      class: 'ficha-lista',
      onclick: () => ir('rival', { id: rival.id, volverA: 'rivales' }),
    }, [
      crear('span', { class: 'ficha-titulo', texto: rival.nombre }),
      detalles ? crear('span', { class: 'ficha-detalle', texto: detalles }) : null,
    ]));
  }

  contenedor.append(
    cabecera('Rivales', () => ir(volverA)),
    crear('button', {
      type: 'button',
      class: 'boton boton-principal',
      texto: 'Nuevo rival',
      onclick: () => ir('rival', { volverA: 'rivales' }),
    }),
    lista,
  );
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
        else ir(volverA);
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
        if (!confirm(`¿Borrar a ${rival.nombre}?`)) return;
        await borrar(ALMACENES.tiradores, rival.id);
        ir(volverA);
      },
    }));
  }

  contenedor.append(
    cabecera(esNuevo ? 'Nuevo rival' : rival.nombre, () => ir(volverA)),
    formulario,
    ...botones,
  );
}
