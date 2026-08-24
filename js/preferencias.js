// Preferencias de uso: cómo quiere el usuario que se le hable.
//
// Van aparte de los ajustes avanzados porque no son lo mismo. Aquéllos son
// números finos que casi nadie toca; esto es una casilla de Configuración.
//
// De momento sólo hay una: si se enseñan o no los textos de ayuda. Teseo está
// lleno de explicaciones, que están bien el primer día y sobran el día
// ochenta, cuando ya te sabes la aplicación y lo único que quieres es que las
// pantallas sean cortas.
//
// Cómo se aplica: NO se repinta nada ni se toca ninguna pantalla. Se pone o
// se quita una clase en el <body> y el CSS esconde los párrafos marcados como
// explicación. Así vale para toda la aplicación de una vez, incluidas las
// pantallas que se pinten después, y apagarla y encenderla es instantáneo.
//
// Qué se esconde y qué no: sólo la prosa que explica. Lo que dice el estado
// de las cosas —"3 asaltos", "Analizando…", "Sin datos todavía", el resumen
// de un asalto, los avisos— se queda siempre, porque sin eso la pantalla no
// se entiende, y porque un aviso escondido es una trampa. La pantalla de
// Ayuda tampoco se toca: ahí se va a leer.

import { ALMACENES, obtener, guardarConClave } from './db.js';

const CLAVE = 'preferencias';

// De fábrica la ayuda se ve: quien acaba de instalar Teseo la necesita, y
// quien no la quiera la apaga una vez y ya está.
const PORDEFECTO = { ayudaVisible: true };

let enMemoria = { ...PORDEFECTO };

/** ¿Se enseñan los textos de ayuda? Síncrono: se llama al pintar. */
export function ayudaVisible() {
  return enMemoria.ayudaVisible !== false;
}

/** Pone o quita la clase que el CSS mira. */
function aplicar() {
  document.body.classList.toggle('sin-ayuda', !ayudaVisible());
}

/** Se llama una vez al arrancar. */
export async function cargarPreferencias() {
  const guardadas = await obtener(ALMACENES.ajustes, CLAVE);
  enMemoria = { ...PORDEFECTO, ...(guardadas || {}) };
  aplicar();
  return { ...enMemoria };
}

/** Enciende o apaga la ayuda, la guarda y la aplica al momento. */
export async function fijarAyudaVisible(valor) {
  enMemoria.ayudaVisible = valor !== false;
  await guardarConClave(ALMACENES.ajustes, CLAVE, { ...enMemoria });
  aplicar();
  return enMemoria.ayudaVisible;
}
