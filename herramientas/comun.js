// Piezas compartidas por las herramientas que descargan datos de la
// federación. No forman parte de la aplicación.

const ENTIDADES = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
};

/** Convierte &Ntilde; y compañía en la letra que representan. */
function decodificar(texto) {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (entero, nombre) => ENTIDADES[nombre] ?? entero);
}

/** Deja el contenido de texto de un trozo de HTML, sin etiquetas. */
function soloTexto(html) {
  return decodificar(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** 04/07/2011 -> 2011-07-04, que es como se ordena y se guarda bien. */
function fechaISO(texto) {
  const partes = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!partes) return null;
  return partes[3] + '-' + partes[2] + '-' + partes[1];
}

/** Devuelve las filas del primer <tbody>, ya troceadas en celdas. */
function filasDeLaTabla(html) {
  const inicio = html.indexOf('<tbody');
  const fin = html.indexOf('</tbody>');
  if (inicio < 0 || fin < 0) throw new Error('No se encontró la tabla. ¿Ha cambiado la página?');

  return html.slice(inicio, fin)
    .split(/<tr[^>]*>/i)
    .slice(1)
    .map((fila) => ({
      cruda: fila,
      celdas: [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]),
    }));
}

// Los códigos que usa la federación en la dirección.
const TEMPORADAS = {
  '2017-2018': '2', '2018-2019': '3', '2019-2020': '10', '2020-2021': '11',
  '2021-2022': '12', '2022-2023': '13', '2023-2024': '14', '2024-2025': '15',
  '2025-2026': '16', '2026-2027': '17',
};

/** Las N temporadas más recientes de las que conocemos. */
function ultimasTemporadas(cuantas) {
  return Object.keys(TEMPORADAS).slice(-cuantas);
}

module.exports = {
  decodificar, soloTexto, fechaISO, filasDeLaTabla, TEMPORADAS, ultimasTemporadas,
};
