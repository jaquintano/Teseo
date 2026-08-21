// El tanteo de un asalto.
//
// Un doble suma a los dos: tres tocados a favor, uno en contra y dos dobles
// dejan un 5-3. Los intercambios sin resultado —los que están a medio
// etiquetar, o los que acabaron en nada— no mueven el marcador.
//
// Y el tanteo NO se reinicia con cada vídeo. Un asalto de directa se graba en
// dos o tres tiempos, y el segundo empieza donde lo dejó el primero: por eso
// hace falta saber con qué marcador se llega a cada uno.
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
 * Cómo va el marcador después de cada intercambio.
 *
 * @param {Array<object>} intercambios en el orden en que se tiraron
 * @param {{favor: number, contra: number}} inicial lo que traían los tiempos
 *        anteriores del mismo asalto
 * @returns {Array<{intercambio: object, favor: number, contra: number}>}
 */
export function tanteoCorrido(intercambios, inicial = { favor: 0, contra: 0 }) {
  let favor = inicial.favor;
  let contra = inicial.contra;

  return intercambios.map((intercambio) => {
    const suma = loQueSuma(intercambio.resultado);
    favor += suma.favor;
    contra += suma.contra;
    return { intercambio, favor, contra };
  });
}
