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

/**
 * Las filas de la tabla principal, ya troceadas en celdas.
 *
 * Dos cosas de las páginas de la federación que obligan a hilar fino:
 *
 * - Cada fila del calendario lleva dentro una ventana de detalle con OTRA
 *   tabla, la de inscritos. Así que no vale cortar por el primer </tbody> ni
 *   partir por <tr>: hay que llevar la cuenta de las tablas anidadas y no
 *   hacer caso de nada de lo que caiga dentro de ellas.
 *
 * - Hay celdas que sólo se enseñan en móvil —las marcadas hidden-lg—, y son
 *   un resumen repetido de las columnas anteriores: "E ABS", "Ind.". Se dejan
 *   fuera, porque son las que hacen que la misma columna caiga en un sitio
 *   distinto en cada página.
 */
function filasDeLaTabla(html) {
  const inicio = html.indexOf('<tbody');
  if (inicio < 0) throw new Error('No se encontró la tabla. ¿Ha cambiado la página?');

  const etiquetas = /<(\/?)(tbody|table|tr|td)\b([^>]*)>/gi;
  etiquetas.lastIndex = inicio;

  const filas = [];
  let tbodys = 0;    // <tbody> abiertos: al cerrarse el primero, se acabó
  let anidadas = 0;  // tablas metidas dentro de una fila
  let fila = null;
  let celda = null;

  let etiqueta;
  while ((etiqueta = etiquetas.exec(html)) !== null) {
    const [, cierra, nombre, atributos] = etiqueta;
    const cerrando = cierra === '/';

    if (nombre.toLowerCase() === 'tbody') {
      tbodys += cerrando ? -1 : 1;
      if (tbodys === 0) break;
      continue;
    }

    if (nombre.toLowerCase() === 'table') {
      anidadas = Math.max(0, anidadas + (cerrando ? -1 : 1));
      continue;
    }

    if (anidadas > 0) continue;

    if (nombre.toLowerCase() === 'tr') {
      if (cerrando) {
        if (fila) filas.push({ cruda: html.slice(fila.desde, etiquetas.lastIndex), celdas: fila.celdas });
        fila = null;
        celda = null;
      } else {
        fila = { desde: etiqueta.index, celdas: [] };
      }
      continue;
    }

    // Aquí ya sólo quedan las celdas.
    if (!fila) continue;
    if (cerrando) {
      if (celda && !celda.deMovil) fila.celdas.push(html.slice(celda.desde, etiqueta.index));
      celda = null;
    } else {
      celda = { desde: etiquetas.lastIndex, deMovil: /hidden-lg/.test(atributos) };
    }
  }

  return filas;
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
