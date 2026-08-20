// Pantalla de importación de rivales desde el ranking de la federación.
//
// Sólo pregunta la temporada. El arma es siempre espada, el género es el tuyo
// y las categorías son en las que compites: todo eso ya está en tu perfil y
// no tiene sentido volver a pedírtelo.
//
// Los rankings vienen empaquetados dentro de Teseo (carpeta datos/), así que
// esto funciona sin cobertura.

import { anadir, crear, rellenar, cabecera, ir, bloque, desplegable } from '../ui.js';
import { nombreCompleto, etiquetaDe, CATEGORIAS } from '../constantes.js';
import { generoDelUsuario, categoriasDelUsuario } from '../genero.js';
import { ALMACENES, guardar, listar } from '../db.js';
import { planParaMisCategorias, rellenarHuecos, temporadasDisponibles } from '../rfee.js';

export async function pantallaImportarRfee(contenedor) {
  const temporadas = await temporadasDisponibles();
  const genero = generoDelUsuario();
  const categorias = categoriasDelUsuario();

  anadir(contenedor, cabecera('Traer rivales de la RFEE', () => ir('rivales')));

  if (temporadas.length === 0) {
    anadir(contenedor, crear('p', {
      class: 'aviso',
      texto: 'Teseo no trae ningún ranking todavía. Hay que descargarlos antes ' +
             'con la herramienta del proyecto.',
    }));
    return;
  }

  if (categorias.length === 0) {
    anadir(contenedor,
      crear('p', {
        class: 'aviso',
        texto: 'Tu perfil no dice en qué categorías compites, y de ahí sale qué ' +
               'rivales traerte.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Ir a mi perfil',
        onclick: () => ir('perfil', { volverA: 'rivales' }),
      }),
    );
    return;
  }

  let temporada = temporadas[0];
  const resultado = crear('div');

  anadir(contenedor,
    crear('p', {
      class: 'ayuda',
      texto: `Se traen los rivales de ${categorias.map((c) => etiquetaDe(CATEGORIAS, c)).join(' y ')}, ` +
             `espada, ${genero === 'F' ? 'femenino' : 'masculino'}. Sale de tu perfil.`,
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

    // Todos, incluido tu propio perfil: si te elegiste del ranking, no debes
    // aparecer luego como rival de ti mismo.
    const locales = await listar(ALMACENES.tiradores);
    const plan = await planParaMisCategorias({ temporada, genero, categorias }, locales);

    if (plan.categorias.length === 0) {
      rellenar(resultado, crear('p', {
        class: 'aviso',
        texto: `Teseo no trae rankings de tus categorías para ${temporada}.`,
      }));
      return;
    }

    const muestra = (fichas, cuantas = 5) => fichas.slice(0, cuantas)
      .map((f) => nombreCompleto(f.ficha || f)).join(' · ')
      + (fichas.length > cuantas ? ` … y ${fichas.length - cuantas} más` : '');

    rellenar(resultado, [
      crear('p', {
        class: 'ayuda',
        texto: `Rankings encontrados: ${plan.categorias.join(', ')}.`,
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
                   '. Nunca se toca la mano, la estatura ni tus notas.',
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
               'Se te pedirá la primera vez que crees un asalto contra cada uno.',
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
