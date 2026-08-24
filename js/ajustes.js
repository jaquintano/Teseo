// Ajustes avanzados: las constantes que se pueden tocar sin tocar el código.
//
// Todo lo que hay aquí tiene un valor de fábrica que funciona, y quien no
// entre nunca en Configuración → Ajustes avanzados no notará que existen. Por
// eso viven aparte: no son preferencias de uso corriente, son números finos
// que dependen de cómo grabes y de cómo tires.
//
// Se leen MUCHAS veces y desde sitios que no pueden esperar —pintar la tabla,
// abrir un intercambio—, así que se cargan una vez al arrancar y se quedan en
// memoria. `ajuste(id)` es síncrono a propósito; quien los cambia es la
// pantalla de configuración, y ella misma actualiza la copia en memoria.

import { ALMACENES, obtener, guardarConClave } from './db.js';

// Todos los ajustes en un solo objeto de la tabla de ajustes: son cuatro
// números y no merecen una fila cada uno.
const CLAVE = 'avanzados';

/**
 * El catálogo. El orden es el que se ve en la pantalla, y `grupo` los junta.
 *
 * `paso` es lo que sube o baja cada toque en las flechas del teclado
 * numérico, y `min`/`max` están para que un dedo torpe no deje la aplicación
 * inservible: nada de aquí puede tomar un valor que rompa algo.
 */
export const AJUSTES = [
  {
    id: 'segundosAntes',
    grupo: 'Intercambios',
    etiqueta: 'Segundos antes del tocado',
    ayuda: 'Cuánta carrerilla se ve al tocar un intercambio en la tabla o en la ' +
           'línea de tiempo. Sirve para entender de dónde viene la acción.',
    fabrica: 2,
    min: 0,
    max: 15,
    paso: 0.5,
  },
  {
    id: 'segundosDespues',
    grupo: 'Intercambios',
    etiqueta: 'Segundos después del tocado',
    ayuda: 'Cuánto se sigue viendo después. El vídeo se para solo al llegar.',
    fabrica: 0.5,
    min: 0,
    max: 15,
    paso: 0.5,
  },
  {
    id: 'segundosDeLampara',
    grupo: 'Detección automática',
    etiqueta: 'Segundos que la luz tiene que aguantar',
    ayuda: 'Lo que separa una lámpara de un dígito del tanteo es el tiempo. La ' +
           'lámpara de espada se queda encendida unos dos segundos, hasta que el ' +
           'árbitro rearma; el tanteo, cuando cambia, parpadea cada dos décimas. ' +
           'Aquí se dice cuánto tiene que aguantar la luz para creérsela. Subirlo ' +
           'quita falsos positivos y baja el riesgo de perder tocados; bajarlo, ' +
           'al revés. Por encima de la duración real de la lámpara no se detecta ' +
           'nada.',
    fabrica: 0.8,
    min: 0.2,
    max: 3,
    paso: 0.1,
  },
  {
    id: 'segundosDeRearme',
    grupo: 'Intercambios',
    etiqueta: 'Silencio tras un tocado confirmado',
    ayuda: 'Desde que suena un tocado hasta que los tiradores vuelven a estar en ' +
           'guardia pasan ocho segundos largos: el árbitro concede, se vuelve a ' +
           'la línea y se rearma. Cualquier propuesta de la detección automática ' +
           'que caiga en ese rato es casi con seguridad un falso positivo —una ' +
           'punta probada en la guardia del contrario—, así que al confirmar un ' +
           'tocado se descartan solas. Ponlo a 0 para no descartar ninguna.',
    fabrica: 8,
    min: 0,
    max: 60,
    paso: 1,
  },
];

const PORDEFECTO = Object.fromEntries(AJUSTES.map((uno) => [uno.id, uno.fabrica]));

// La copia en memoria. Arranca con los valores de fábrica para que `ajuste()`
// devuelva algo sensato aunque se llame antes de cargar nada.
let enMemoria = { ...PORDEFECTO };

/** La ficha de un ajuste por su identificador. */
export function fichaDe(id) {
  return AJUSTES.find((uno) => uno.id === id) || null;
}

/** Lo que vale ahora mismo. Síncrono: se llama desde el pintado. */
export function ajuste(id) {
  const valor = enMemoria[id];
  return typeof valor === 'number' && isFinite(valor) ? valor : PORDEFECTO[id];
}

/** Deja el valor dentro de lo que su ficha admite. */
function acotar(ficha, valor) {
  const numero = Number(valor);
  if (!isFinite(numero)) return ficha.fabrica;
  return Math.min(ficha.max, Math.max(ficha.min, numero));
}

/** Se llama una vez al arrancar. Lo que falte se queda en su valor de fábrica. */
export async function cargarAjustes() {
  const guardados = await obtener(ALMACENES.ajustes, CLAVE);
  enMemoria = { ...PORDEFECTO };
  if (!guardados) return { ...enMemoria };

  for (const ficha of AJUSTES) {
    if (guardados[ficha.id] !== undefined) {
      enMemoria[ficha.id] = acotar(ficha, guardados[ficha.id]);
    }
  }
  return { ...enMemoria };
}

/** Cambia un ajuste y lo guarda. Devuelve lo que ha quedado, ya acotado. */
export async function fijarAjuste(id, valor) {
  const ficha = fichaDe(id);
  if (!ficha) return null;

  enMemoria[id] = acotar(ficha, valor);
  await guardarConClave(ALMACENES.ajustes, CLAVE, { ...enMemoria });
  return enMemoria[id];
}

/** Devuelve todo a como venía de fábrica. */
export async function restablecerAjustes() {
  enMemoria = { ...PORDEFECTO };
  await guardarConClave(ALMACENES.ajustes, CLAVE, { ...enMemoria });
}

/** ¿Hay algo cambiado respecto a los valores de fábrica? */
export function hayAjustesTocados() {
  return AJUSTES.some((ficha) => ajuste(ficha.id) !== ficha.fabrica);
}

/** Los ajustes agrupados, en el orden del catálogo. */
export function porGrupos() {
  const grupos = new Map();
  for (const ficha of AJUSTES) {
    if (!grupos.has(ficha.grupo)) grupos.set(ficha.grupo, []);
    grupos.get(ficha.grupo).push(ficha);
  }
  return [...grupos.entries()];
}
