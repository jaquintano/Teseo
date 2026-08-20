// Rellenar de golpe rivales y competiciones.
//
// Se ofrece cuando la aplicación está vacía, que es justo cuando más pereza
// da ponerse a dar de alta gente a mano. Con las categorías del perfil ya
// sabemos qué traer, así que sólo queda elegir la temporada y pulsar.

import { crear, rellenar, cabecera, ir, bloque, desplegable } from '../ui.js';
import { etiquetaDe, CATEGORIAS } from '../constantes.js';
import { generoDelUsuario, categoriasDelUsuario } from '../genero.js';
import { ALMACENES, guardar, listar } from '../db.js';
import {
  planParaMisCategorias as planRivales, rellenarHuecos, temporadasDisponibles as temporadasRanking,
} from '../rfee.js';
import {
  planParaMisCategorias as planCompeticiones, temporadasDisponibles as temporadasCalendario,
} from '../competiciones.js';

export async function pantallaPreparar(contenedor) {
  const genero = generoDelUsuario();
  const categorias = categoriasDelUsuario();

  const [deRanking, deCalendario] = await Promise.all([
    temporadasRanking(), temporadasCalendario(),
  ]);
  // Las temporadas de las que hay algo, sea ranking o calendario.
  const temporadas = [...new Set([...deRanking, ...deCalendario])].sort().reverse();

  contenedor.append(cabecera('Rellenar mis datos', () => ir('inicio')));

  if (categorias.length === 0 || temporadas.length === 0) {
    contenedor.append(crear('p', {
      class: 'aviso',
      texto: categorias.length === 0
        ? 'Tu perfil no dice en qué categorías compites, y de ahí sale qué traerte.'
        : 'Teseo no trae datos de la federación todavía.',
    }));
    return;
  }

  let temporada = temporadas[0];
  const resultado = crear('div');

  contenedor.append(
    crear('p', {
      class: 'texto-ayuda',
      texto: `Se traerán los rivales y las competiciones de ` +
             `${categorias.map((c) => etiquetaDe(CATEGORIAS, c)).join(' y ')}, espada, ` +
             `${genero === 'F' ? 'femenino' : 'masculino'}. Sale de tu perfil, así que ` +
             'no hay que elegir nada más.',
    }),

    bloque('Temporada', desplegable('',
      temporadas.map((t) => ({ id: t, etiqueta: t })), temporada,
      (valor) => { temporada = valor; refrescar(); }).entrada),

    resultado,
  );

  refrescar();

  // ------------------------------------------------------------------

  async function refrescar() {
    rellenar(resultado, crear('p', { class: 'ayuda', texto: 'Comprobando…' }));

    const quien = { temporada, genero, categorias };
    const [tiradores, competiciones] = await Promise.all([
      listar(ALMACENES.tiradores), listar(ALMACENES.competiciones),
    ]);
    const [rivales, torneos] = await Promise.all([
      planRivales(quien, tiradores),
      planCompeticiones(quien, competiciones),
    ]);

    const cuantos = rivales.nuevos.length + rivales.completables.length + torneos.nuevas.length;

    rellenar(resultado, [
      crear('div', { class: 'resumen' }, [
        dato(rivales.nuevos.length, 'rivales'),
        dato(torneos.nuevas.length, 'competiciones'),
      ]),

      rivales.categorias.length === 0 && torneos.categorias.length === 0
        ? crear('p', {
            class: 'aviso',
            texto: `Teseo no trae datos de tus categorías para ${temporada}.`,
          })
        : null,

      cuantos === 0
        ? crear('p', { class: 'ayuda', texto: 'Ya tienes todo lo de esta temporada.' })
        : crear('button', {
            type: 'button', class: 'boton boton-principal',
            texto: 'Traerlo todo',
            onclick: async (evento) => {
              evento.target.classList.add('desactivado');
              evento.target.textContent = 'Trayendo…';

              for (const ficha of rivales.nuevos) {
                await guardar(ALMACENES.tiradores, ficha);
              }
              for (const { local, ficha, cambios } of rivales.completables) {
                await guardar(ALMACENES.tiradores, rellenarHuecos(local, ficha, cambios));
              }
              for (const ficha of torneos.nuevas) {
                await guardar(ALMACENES.competiciones, ficha);
              }

              ir('inicio');
            },
          }),

      crear('p', {
        class: 'ayuda',
        texto: 'Los rivales llegan sin la mano, porque la federación no la ' +
               'publica. Se te irá pidiendo la primera vez que crees un asalto ' +
               'contra cada uno.',
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
