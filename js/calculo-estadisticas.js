// Cálculo de estadísticas.
//
// ESTE MÓDULO ES INDEPENDIENTE A PROPÓSITO. No toca la pantalla ni la base de
// datos: recibe datos, devuelve números. Sólo depende de constantes.js, que a
// su vez son listas de opciones sin código. Los dos ficheros juntos se pueden
// llevar a cualquier otro sitio —por ejemplo, a una herramienta para el
// entrenador— sin arrastrar nada más de Teseo.
//
// Se usa en tres pasos:
//
//   const preparados = prepararIntercambios({ asaltos, tiempos, intercambios, tiradores });
//   const elegidos   = filtrar(preparados, { manoRival: 'zurdo' });
//   const numeros    = calcular(elegidos);
//
// Un apunte sobre las capas, porque condiciona todo lo que sigue: las
// acciones etiquetadas son las del propio tirador, no las del rival. Cuando
// el resultado es "tocado a favor", la zona del cuerpo es donde tocó él;
// cuando es "en contra", es donde le tocaron.

import {
  ACCIONES_OFENSIVAS, ZONAS_CUERPO, ZONAS_PISTA, TRAMOS,
} from './constantes.js';

/**
 * Añade a cada intercambio el contexto que hace falta para las cuentas:
 * de qué asalto es, contra qué rival, y en qué tramo del asalto cayó.
 *
 * @param {{asaltos: Array, tiempos: Array, intercambios: Array, tiradores: Array}} datos
 * @returns {Array} los intercambios, enriquecidos
 */
export function prepararIntercambios({ asaltos = [], tiempos = [], intercambios = [], tiradores = [] }) {
  const tiradorPorId = new Map(tiradores.map((t) => [t.id, t]));
  const asaltoPorId = new Map(asaltos.map((a) => [a.id, a]));
  const tiempoPorId = new Map(tiempos.map((t) => [t.id, t]));

  // Si un vídeo no dejó leer su duración, usamos como duración el instante
  // del último intercambio etiquetado en él. Es una aproximación, pero mejor
  // que descartar el tiempo entero del reparto por tramos.
  const ultimoInstante = new Map();
  for (const intercambio of intercambios) {
    const previo = ultimoInstante.get(intercambio.tiempoId) || 0;
    if (intercambio.instante > previo) ultimoInstante.set(intercambio.tiempoId, intercambio.instante);
  }

  const duracionDe = (tiempo) => {
    if (typeof tiempo.duracion === 'number' && isFinite(tiempo.duracion) && tiempo.duracion > 0) {
      return tiempo.duracion;
    }
    return ultimoInstante.get(tiempo.id) || 0;
  };

  // Para cada asalto, encadenamos sus tiempos en una sola línea continua.
  const lineaDeAsalto = new Map();
  for (const asalto of asaltos) {
    const suyos = tiempos
      .filter((t) => t.asaltoId === asalto.id)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));

    const desplazamiento = new Map();
    let acumulado = 0;
    for (const tiempo of suyos) {
      desplazamiento.set(tiempo.id, acumulado);
      acumulado += duracionDe(tiempo);
    }
    lineaDeAsalto.set(asalto.id, { desplazamiento, total: acumulado });
  }

  return intercambios.map((intercambio) => {
    const tiempo = tiempoPorId.get(intercambio.tiempoId);
    const asaltoId = intercambio.asaltoId ?? (tiempo ? tiempo.asaltoId : undefined);
    const asalto = asaltoPorId.get(asaltoId);
    const rival = asalto ? tiradorPorId.get(asalto.rivalId) : undefined;

    let posicion = null;
    let tramo = null;
    const linea = lineaDeAsalto.get(asaltoId);
    if (linea && linea.total > 0 && tiempo) {
      const desde = linea.desplazamiento.get(tiempo.id) || 0;
      posicion = (desde + intercambio.instante) / linea.total;
      tramo = posicion < 1 / 3 ? 'principio' : posicion < 2 / 3 ? 'medio' : 'final';
    }

    return {
      ...intercambio,
      asaltoId,
      rivalId: asalto ? asalto.rivalId : null,
      manoRival: rival ? rival.mano : null,
      numeroAsalto: asalto ? asalto.numero : null,
      fecha: asalto ? asalto.fecha : null,
      posicion,
      tramo,
    };
  });
}

/**
 * Deja sólo los intercambios que cumplen los filtros. Un filtro sin valor
 * (null o undefined) no filtra nada.
 *
 * @param {Array} preparados
 * @param {{rivalId?: number, manoRival?: string, numeroAsalto?: number}} filtros
 */
export function filtrar(preparados, filtros = {}) {
  return preparados.filter((i) => {
    if (filtros.rivalId != null && i.rivalId !== filtros.rivalId) return false;
    if (filtros.manoRival != null && i.manoRival !== filtros.manoRival) return false;
    if (filtros.numeroAsalto != null && i.numeroAsalto !== filtros.numeroAsalto) return false;
    return true;
  });
}

/** Cuenta cuántos hay de cada id de un catálogo. Devuelve filas ordenadas. */
function repartirPor(intercambios, catalogo, campo) {
  const cuenta = new Map(catalogo.map((o) => [o.id, 0]));
  let sinIndicar = 0;

  for (const i of intercambios) {
    const valor = i[campo];
    if (valor == null) sinIndicar++;
    else if (cuenta.has(valor)) cuenta.set(valor, cuenta.get(valor) + 1);
  }

  const total = catalogo.reduce((suma, o) => suma + cuenta.get(o.id), 0);
  return {
    total,
    sinIndicar,
    filas: catalogo.map((o) => ({
      id: o.id,
      etiqueta: o.etiqueta,
      cuenta: cuenta.get(o.id),
      porcentaje: total ? (cuenta.get(o.id) / total) * 100 : 0,
    })),
  };
}

/**
 * Calcula todas las estadísticas de un conjunto de intercambios.
 * @param {Array} intercambios ya preparados y filtrados
 */
export function calcular(intercambios) {
  const total = intercambios.length;
  const aFavor = intercambios.filter((i) => i.resultado === 'favor');
  const enContra = intercambios.filter((i) => i.resultado === 'contra');
  const dobles = intercambios.filter((i) => i.resultado === 'doble');
  const sinTocado = intercambios.filter((i) => i.resultado === 'nada');

  // --- Ofensivas ---

  // Eficacia por acción: cuántas veces la intentó y cuántas acabó en tocado.
  const eficaciaPorAccion = ACCIONES_OFENSIVAS.map((accion) => {
    const intentos = intercambios.filter((i) => i.ofensiva === accion.id);
    const conseguidos = intentos.filter((i) => i.resultado === 'favor').length;
    const doblesAccion = intentos.filter((i) => i.resultado === 'doble').length;
    return {
      id: accion.id,
      etiqueta: accion.etiqueta,
      intentos: intentos.length,
      conseguidos,
      dobles: doblesAccion,
      porcentaje: intentos.length ? (conseguidos / intentos.length) * 100 : 0,
    };
  });

  // Iniciativa. Si un intercambio lleva marcadas las dos acciones, cuenta
  // como ataque: quien inicia manda, aunque después tuviera que defenderse.
  const ataques = intercambios.filter((i) => i.ofensiva != null).length;
  const defensas = intercambios.filter((i) => i.ofensiva == null && i.defensiva != null).length;
  const conAccion = ataques + defensas;
  const iniciativa = {
    ataques,
    defensas,
    sinAccion: total - conAccion,
    porcentajeAtaque: conAccion ? (ataques / conAccion) * 100 : 0,
  };

  // --- Defensivas ---

  // Parada-respuesta: de las veces que paró, cuántas acabaron en tocado suyo.
  const paradas = intercambios.filter((i) => i.defensiva === 'parada');
  const paradaRespuesta = {
    intentos: paradas.length,
    conseguidos: paradas.filter((i) => i.resultado === 'favor').length,
    dobles: paradas.filter((i) => i.resultado === 'doble').length,
    porcentaje: paradas.length
      ? (paradas.filter((i) => i.resultado === 'favor').length / paradas.length) * 100
      : 0,
  };

  // --- Dobles ---
  // Sobre el total de tocados, no sobre todos los intercambios: la pregunta
  // interesante es cuántos de los tocados se fueron en doble.
  const tocados = aFavor.length + enContra.length + dobles.length;

  return {
    resumen: {
      intercambios: total,
      aFavor: aFavor.length,
      enContra: enContra.length,
      dobles: dobles.length,
      sinTocado: sinTocado.length,
      asaltos: new Set(intercambios.map((i) => i.asaltoId)).size,
    },

    ofensivas: {
      eficaciaPorAccion,
      iniciativa,
      tocadosPorTramo: repartirPor(aFavor, TRAMOS, 'tramo'),
      tocadosPorZonaPista: repartirPor(aFavor, ZONAS_PISTA, 'zonaPista'),
    },

    defensivas: {
      paradaRespuesta,
      recibidosPorZonaCuerpo: repartirPor(enContra, ZONAS_CUERPO, 'zonaCuerpo'),
      recibidosPorZonaPista: repartirPor(enContra, ZONAS_PISTA, 'zonaPista'),
    },

    dobles: {
      cuenta: dobles.length,
      sobreTocados: tocados,
      porcentaje: tocados ? (dobles.length / tocados) * 100 : 0,
    },
  };
}
