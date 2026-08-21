// El tanteo de un asalto.
//
// Un doble suma a los dos: tres tocados a favor, uno en contra y dos dobles
// dejan un 5-3. Los intercambios sin resultado —los que están a medio
// etiquetar, o los que acabaron en nada— no mueven el marcador.
//
// Y el tanteo NO se reinicia con cada vídeo. Un asalto de directa se graba en
// dos o tres tiempos, y el segundo empieza donde lo dejó el primero.
//
// Qué se guarda y qué se deduce
// -----------------------------
// Lo único que no se puede deducir de las etiquetas es CON QUÉ MARCADOR
// EMPIEZA CADA TIEMPO, porque el vídeo tiene agujeros: puede no haber vídeo
// del primer tiempo, o puede cortarse antes de acabar y perderse varios
// tocados. Por eso `tiempo.tanteoInicial` se guarda y se puede corregir a
// mano, y todo lo demás se deriva de los intercambios.
//
// Al revés —guardar el marcador en cada intercambio— se descuadraría en
// cuanto se corrigiera una etiqueta: los de después seguirían diciendo lo de
// antes.
//
// Aquí no hay ni base de datos ni pantalla: se le pasan listas y devuelve
// números.

/** Lo que suma un resultado a cada lado del marcador. */
function loQueSuma(resultado) {
  return {
    favor: resultado === 'favor' || resultado === 'doble' ? 1 : 0,
    contra: resultado === 'contra' || resultado === 'doble' ? 1 : 0,
  };
}

/** Cuántos tocados hay a un lado y al otro en un montón de intercambios. */
export function contarTocados(intercambios) {
  let favor = 0;
  let contra = 0;

  for (const intercambio of intercambios) {
    const suma = loQueSuma(intercambio.resultado);
    favor += suma.favor;
    contra += suma.contra;
  }

  return { favor, contra };
}

/**
 * Con qué marcador empieza cada tiempo de un asalto.
 *
 * Se recorren en orden arrastrando la cuenta. Si un tiempo trae corrección a
 * mano, manda ella y el arrastre se reengancha ahí: es la forma de decir
 * "aquí faltan tocados que no se grabaron".
 *
 * @param {Array<object>} tiempos los del asalto, en cualquier orden
 * @param {(tiempo:object) => Array<object>} intercambiosDe
 * @returns {Map<number, {favor:number, contra:number}>} por id de tiempo
 */
export function tanteosDeLosTiempos(tiempos, intercambiosDe) {
  const enOrden = [...tiempos].sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const salida = new Map();
  let arrastre = { favor: 0, contra: 0 };

  for (const tiempo of enOrden) {
    const inicial = tiempo.tanteoInicial || arrastre;
    salida.set(tiempo.id, inicial);

    const suyos = contarTocados(intercambiosDe(tiempo));
    arrastre = {
      favor: inicial.favor + suyos.favor,
      contra: inicial.contra + suyos.contra,
    };
  }

  return salida;
}

/**
 * Cómo va el marcador después de cada intercambio.
 *
 * @param {Array<object>} intercambios en el orden en que se tiraron
 * @param {{favor: number, contra: number}} inicial con qué empieza el tiempo
 * @returns {Array<{intercambio:object, antes:object, favor:number, contra:number}>}
 *          `antes` es cómo iba al empezar ese intercambio, que es lo que
 *          cuenta para las estadísticas: es el marcador con el que decidiste
 *          cómo tirarlo.
 */
export function tanteoCorrido(intercambios, inicial = { favor: 0, contra: 0 }) {
  let favor = inicial.favor;
  let contra = inicial.contra;

  return intercambios.map((intercambio) => {
    const antes = { favor, contra };
    const suma = loQueSuma(intercambio.resultado);
    favor += suma.favor;
    contra += suma.contra;
    return { intercambio, antes, favor, contra };
  });
}

/** Ganando, perdiendo o empate, mirando el marcador que sea. */
export function situacionDe({ favor, contra }) {
  if (favor > contra) return 'ganando';
  if (favor < contra) return 'perdiendo';
  return 'empate';
}
