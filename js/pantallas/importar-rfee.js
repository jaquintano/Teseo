// Pantalla de importación desde la federación.
//
// Los rankings vienen empaquetados dentro de Teseo (carpeta datos/). Aquí se
// elige cuál, se enseña qué va a pasar, y sólo entonces se guarda.

import { crear, rellenar, cabecera, ir, bloque, formatearFecha } from '../ui.js';
import { nombreCompleto } from '../constantes.js';
import { ALMACENES, guardar, listarRivales } from '../db.js';
import {
  listarRankings, cargarRanking, planificarImportacion, rellenarHuecos,
} from '../rfee.js';

export async function pantallaImportarRfee(contenedor) {
  const rankings = await listarRankings();

  contenedor.append(cabecera('Traer de la RFEE', () => ir('rivales')));

  if (rankings.length === 0) {
    contenedor.append(crear('p', {
      class: 'aviso',
      texto: 'Teseo no trae ningún ranking todavía. Hay que descargarlos antes ' +
             'con la herramienta del proyecto.',
    }));
    return;
  }

  // Los desplegables se construyen con lo que hay de verdad, para no ofrecer
  // combinaciones que no existan.
  const unicos = (campo) => [...new Set(rankings.map((r) => r[campo]))];

  let temporada = unicos('temporada')[0];
  let categoria = unicos('categoria')[0];
  let genero = unicos('genero')[0];

  const resultado = crear('div');

  const selector = (campo, valorInicial, alCambiar) => {
    const s = crear('select', { class: 'entrada', onchange: (e) => { alCambiar(e.target.value); refrescar(); } });
    for (const valor of unicos(campo)) {
      const o = crear('option', { value: valor, texto: valor });
      if (valor === valorInicial) o.selected = true;
      s.append(o);
    }
    return s;
  };

  contenedor.append(
    crear('p', {
      class: 'ayuda',
      texto: 'Los rankings viajan dentro de Teseo, así que esto funciona sin ' +
             'cobertura. No se piden a la federación en este momento.',
    }),

    bloque('Temporada', selector('temporada', temporada, (v) => { temporada = v; })),
    bloque('Arma', crear('p', { class: 'valor-fijo', texto: 'Espada' })),
    bloque('Categoría', selector('categoria', categoria, (v) => { categoria = v; })),
    bloque('Género', selector('genero', genero, (v) => { genero = v; })),

    resultado,
  );

  refrescar();

  // ------------------------------------------------------------------

  function rankingElegido() {
    return rankings.find((r) => r.temporada === temporada
                             && r.categoria === categoria
                             && r.genero === genero);
  }

  async function refrescar() {
    const elegido = rankingElegido();

    if (!elegido) {
      rellenar(resultado, crear('p', {
        class: 'aviso',
        texto: 'Teseo no trae ese ranking. Prueba otra combinación, o pide que ' +
               'se descargue.',
      }));
      return;
    }

    rellenar(resultado, crear('p', { class: 'ayuda', texto: 'Comprobando…' }));

    const [ranking, locales] = await Promise.all([
      cargarRanking(elegido.fichero),
      listarRivales(),
    ]);
    const plan = planificarImportacion(ranking, locales);

    const muestra = (fichas, cuantas = 5) => fichas.slice(0, cuantas)
      .map((f) => nombreCompleto(f.ficha || f)).join(' · ')
      + (fichas.length > cuantas ? ` … y ${fichas.length - cuantas} más` : '');

    rellenar(resultado, [
      crear('p', {
        class: 'ayuda',
        texto: `${ranking.tiradores.length} tiradores en el ranking, descargado el ` +
               `${formatearFecha(ranking.descargadoEl)}.`,
      }),

      crear('div', { class: 'resumen' }, [
        dato(plan.nuevos.length, 'nuevos'),
        dato(plan.completables.length, 'a completar'),
        dato(plan.sinCambios, 'ya al día'),
      ]),

      plan.nuevos.length > 0
        ? crear('p', { class: 'ayuda', texto: 'Se añadirán: ' + muestra(plan.nuevos) })
        : null,

      plan.completables.length > 0
        ? crear('p', {
            class: 'ayuda',
            texto: 'Se rellenarán huecos de: ' + muestra(plan.completables) +
                   '. Nunca se toca la mano, la altura ni tus notas.',
          })
        : null,

      plan.nuevos.length === 0 && plan.completables.length === 0
        ? crear('p', { class: 'ayuda', texto: 'No hay nada que hacer: ya los tienes todos.' })
        : crear('button', {
            type: 'button', class: 'boton boton-principal',
            texto: `Importar (${plan.nuevos.length + plan.completables.length})`,
            onclick: (evento) => importar(evento.target, plan),
          }),

      crear('p', {
        class: 'ayuda',
        texto: 'La federación no publica la mano, así que llegarán sin ella. ' +
               'Se te pedirá la primera vez que crees un asalto contra cada una.',
      }),
    ]);
  }

  async function importar(boton, plan) {
    boton.classList.add('desactivado');
    boton.textContent = 'Importando…';

    for (const ficha of plan.nuevos) {
      await guardar(ALMACENES.tiradores, ficha);
    }
    for (const { local, ficha, cambios } of plan.completables) {
      await guardar(ALMACENES.tiradores, rellenarHuecos(local, ficha, cambios));
    }

    ir('rivales');
  }

  function dato(valor, etiqueta) {
    return crear('div', { class: 'dato' }, [
      crear('span', { class: 'dato-valor', texto: String(valor) }),
      crear('span', { class: 'dato-etiqueta', texto: etiqueta }),
    ]);
  }
}
