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
// Dos apuntes sobre los datos, porque condicionan todo lo que sigue.
//
// Uno: de cada intercambio se guarda la acción final de los DOS, la propia y
// la del rival, con la misma estructura. Casi todas las cuentas miran la
// propia; "con qué te tocan" mira la suya.
//
// Y dos: las zonas también son de los dos. `zonaRival` es donde tocaste tú y
// `zonaPropia` donde te tocaron, así que un tocado a favor llena la primera,
// uno en contra la segunda, y un doble las dos.

import {
  ACCIONES_OFENSIVAS, ZONAS_TOCADAS, ZONAS_PISTA, TRAMOS,
} from './constantes.js';
import { tanteosDeLosTiempos, tanteoCorrido, situacionDe } from './tanteo.js';

/**
 * Añade a cada intercambio el contexto que hace falta para las cuentas:
 * de qué asalto es, contra qué rival, y en qué tramo del asalto cayó.
 *
 * @param {{asaltos: Array, tiempos: Array, intercambios: Array, tiradores: Array}} datos
 * @returns {Array} los intercambios, enriquecidos
 */
export function prepararIntercambios({ asaltos = [], tiempos = [], intercambios = [], tiradores = [] }) {
  // Lo que ha propuesto la detección automática y nadie ha confirmado todavía
  // no son datos: son candidatos. Fuera de las cuentas hasta que se confirmen.
  intercambios = intercambios.filter((intercambio) => !intercambio.propuesto);

  const tiradorPorId = new Map(tiradores.map((t) => [t.id, t]));
  const asaltoPorId = new Map(asaltos.map((a) => [a.id, a]));
  const tiempoPorId = new Map(tiempos.map((t) => [t.id, t]));

  const porTiempo = new Map();
  for (const intercambio of intercambios) {
    if (!porTiempo.has(intercambio.tiempoId)) porTiempo.set(intercambio.tiempoId, []);
    porTiempo.get(intercambio.tiempoId).push(intercambio);
  }

  // Cómo iba el marcador al empezar cada intercambio, por id.
  const marcadorDe = new Map();

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

    // Y el marcador con el que se llegó a cada intercambio, que para eso se
    // guarda con qué empieza cada tiempo.
    const inicialesDeTiempo = tanteosDeLosTiempos(suyos, (t) => porTiempo.get(t.id) || []);
    for (const tiempo of suyos) {
      const enOrden = [...(porTiempo.get(tiempo.id) || [])].sort((a, b) => a.instante - b.instante);
      for (const paso of tanteoCorrido(enOrden, inicialesDeTiempo.get(tiempo.id))) {
        marcadorDe.set(paso.intercambio.id, paso.antes);
      }
    }
  }

  return intercambios.map((intercambio) => {
    const marcador = marcadorDe.get(intercambio.id) || { favor: 0, contra: 0 };
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
      // Cómo iba el marcador ANTES de este intercambio: es el estado con el
      // que se decidió cómo tirarlo.
      favorAntes: marcador.favor,
      contraAntes: marcador.contra,
      situacion: situacionDe(marcador),
    };
  });
}

/**
 * Deja sólo los intercambios que cumplen los filtros. Un filtro sin valor
 * (null o undefined) no filtra nada.
 *
 * @param {Array} preparados
 * @param {{rivalId?: number, manoRival?: string, numeroAsalto?: number,
 *          situacion?: string}} filtros
 */
export function filtrar(preparados, filtros = {}) {
  return preparados.filter((i) => {
    if (filtros.rivalId != null && i.rivalId !== filtros.rivalId) return false;
    if (filtros.manoRival != null && i.manoRival !== filtros.manoRival) return false;
    if (filtros.numeroAsalto != null && i.numeroAsalto !== filtros.numeroAsalto) return false;
    if (filtros.situacion != null && i.situacion !== filtros.situacion) return false;
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

  // Cómo acabó cada uno el intercambio. Puede no estar contestado, así que
  // todo lo que sigue tiene que aguantar un intercambio a medio etiquetar.
  const mia = (i) => i.accionPropia || {};
  const suya = (i) => i.accionRival || {};

  // --- Ofensivas ---

  // Eficacia por acción: cuántas veces la hiciste y cuántas acabó en tocado.
  const eficaciaPorAccion = ACCIONES_OFENSIVAS.map((accion) => {
    const intentos = intercambios.filter((i) => mia(i).accion === accion.id
                                            && mia(i).tipo === 'ofensiva');
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

  // Iniciativa: con qué acabas tú los intercambios. El contraataque es una
  // acción ofensiva más, pero se cuenta aparte de los ataques: saber cuánto
  // contraatacas es media lectura de cómo tiras.
  const esContraataque = (i) => mia(i).tipo === 'ofensiva'
                             && mia(i).accion === 'contraataque';
  const ataques = intercambios.filter((i) => mia(i).tipo === 'ofensiva'
                                          && !esContraataque(i)).length;
  const defensas = intercambios.filter((i) => mia(i).tipo === 'defensiva').length;
  const contraataques = intercambios.filter(esContraataque).length;
  const conAccion = ataques + defensas + contraataques;
  const iniciativa = {
    ataques,
    defensas,
    contraataques,
    sinAccion: total - conAccion,
    porcentajeAtaque: conAccion ? (ataques / conAccion) * 100 : 0,
  };

  // --- Defensivas ---

  // Parada-respuesta: de las veces que paraste Y respondiste, cuántas
  // acabaron en tocado tuyo. La parada que se queda sin respuesta se cuenta
  // aparte: no es un intento fallido de tocar, es otra cosa, y meterla en el
  // mismo saco hundiría el porcentaje sin querer decir nada.
  const paradas = intercambios.filter((i) =>
    mia(i).tipo === 'ofensiva' && mia(i).accion === 'parada');
  const paradaRespuesta = {
    intentos: paradas.length,
    conseguidos: paradas.filter((i) => i.resultado === 'favor').length,
    dobles: paradas.filter((i) => i.resultado === 'doble').length,
    sinRespuesta: intercambios.filter((i) =>
      mia(i).tipo === 'defensiva' && mia(i).accion === 'parada').length,
    porcentaje: paradas.length
      ? (paradas.filter((i) => i.resultado === 'favor').length / paradas.length) * 100
      : 0,
  };

  // Con qué te tocan. Ahora que se apunta también la acción del rival, ésta
  // es la pregunta que antes no se podía contestar: no cómo defiendes tú,
  // sino qué te están haciendo cuando encajas.
  const accionesQueTeTocan = ACCIONES_OFENSIVAS.map((accion) => ({
    id: accion.id,
    etiqueta: accion.etiqueta,
    cuenta: enContra.filter((i) => suya(i).tipo === 'ofensiva'
                                && suya(i).accion === accion.id).length,
  }));
  const totalQueTeTocan = accionesQueTeTocan.reduce((suma, a) => suma + a.cuenta, 0);
  const recibidosPorAccionDelRival = {
    total: totalQueTeTocan,
    filas: accionesQueTeTocan.map((a) => ({
      ...a,
      porcentaje: totalQueTeTocan ? (a.cuenta / totalQueTeTocan) * 100 : 0,
    })),
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
      tocadosPorZona: repartirPor(aFavor, ZONAS_TOCADAS, 'zonaRival'),
      tocadosPorZonaPista: repartirPor(aFavor, ZONAS_PISTA, 'zonaPista'),
    },

    defensivas: {
      paradaRespuesta,
      recibidosPorAccionDelRival,
      recibidosPorZona: repartirPor(enContra, ZONAS_TOCADAS, 'zonaPropia'),
      recibidosPorZonaPista: repartirPor(enContra, ZONAS_PISTA, 'zonaPista'),
    },

    dobles: {
      cuenta: dobles.length,
      sobreTocados: tocados,
      porcentaje: tocados ? (dobles.length / tocados) * 100 : 0,
    },
  };
}
