// Descarga un ranking de la Real Federación Española de Esgrima y lo guarda
// como fichero de datos dentro del proyecto.
//
// ESTO NO FORMA PARTE DE LA APLICACIÓN. Se ejecuta en el ordenador, a mano:
//
//   node herramientas/traer-ranking.js --temporada 2025-2026 --categoria M15 --genero F
//
// ¿Por qué no lo hace Teseo directamente? Porque no puede. El navegador
// impide que una página lea la respuesta de otro sitio web salvo que ese
// sitio lo autorice, y app.skermo.org no lo autoriza. Comprobado: la
// petición llega, pero la respuesta vuelve ilegible. Desde aquí, sin
// navegador de por medio, esa restricción no existe.
//
// Los ficheros que genera se sirven desde el propio Teseo, así que la
// aplicación los lee como lee su CSS: mismo origen, sin permisos, y además
// funcionan sin cobertura.

const fs = require('fs');
const path = require('path');

const BASE = 'https://app.skermo.org/ranking-rfee/public/RFEE';
const RAIZ = path.resolve(__dirname, '..');

// Los códigos que usa la federación en la dirección.
const TEMPORADAS = {
  '2017-2018': '2', '2018-2019': '3', '2019-2020': '10', '2020-2021': '11',
  '2021-2022': '12', '2022-2023': '13', '2023-2024': '14', '2024-2025': '15',
  '2025-2026': '16', '2026-2027': '17',
};

const CATEGORIAS = {
  M13: '12', M15: '4', M17: '5', M20: '6', ABS: '7',
  VET30: '13', VET40: '14', VET50: '17', VET60: '18', VET70: '19',
};

// En Teseo hablamos de masculino y femenino; la federación usa M y W.
const GENEROS = { M: 'M', masculino: 'M', F: 'W', W: 'W', femenino: 'W' };

// Espada siempre. Teseo es de espada.
const ARMA = 'E';

// --- Utilidades -------------------------------------------------------

const ENTIDADES = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
};

/** Convierte &Iacute; y compañía en la letra que representan. */
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

// --- Lectura de la tabla ----------------------------------------------

function extraerTiradores(html) {
  const inicio = html.indexOf('<tbody');
  const fin = html.indexOf('</tbody>');
  if (inicio < 0 || fin < 0) throw new Error('No se encontró la tabla. ¿Ha cambiado la página?');

  const cuerpo = html.slice(inicio, fin);
  const filas = cuerpo.split(/<tr[^>]*>/i).slice(1);
  const tiradores = [];

  for (const fila of filas) {
    const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (celdas.length < 5) continue;

    // El identificador del tirador va en el enlace: .../RFEE/1918?...
    const enlace = fila.match(/\/RFEE\/(\d+)\?/);

    // La celda del nombre trae la posición pegada delante, dentro de un
    // <span> que sólo se ve en pantallas pequeñas. Se va con las etiquetas,
    // pero por si acaso quitamos también el "1." que pudiera quedar suelto.
    const nombre = soloTexto(celdas[1]).replace(/^\d+\.\s*/, '');
    const apellidos = soloTexto(celdas[2]);
    if (!nombre && !apellidos) continue;

    tiradores.push({
      idRfee: enlace ? Number(enlace[1]) : null,
      nombre,
      apellidos,
      fechaNacimiento: fechaISO(soloTexto(celdas[3])),
      club: soloTexto(celdas[4]),
    });
  }

  return tiradores;
}

// --- Programa ---------------------------------------------------------

function leerArgumentos() {
  const args = process.argv.slice(2);
  const valor = (nombre) => {
    const i = args.indexOf('--' + nombre);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    temporada: valor('temporada'),
    categoria: valor('categoria'),
    genero: valor('genero'),
    todo: args.includes('--todo'),
    ultimas: Number(valor('ultimas') || 2),
  };
}

/** Las N temporadas más recientes de las que conocemos. */
function ultimasTemporadas(cuantas) {
  return Object.keys(TEMPORADAS).slice(-cuantas);
}

/**
 * Descarga un ranking y lo guarda.
 * @returns {'guardado'|'sin-cambios'|'vacio'}
 */
async function traerUno(temporada, categoria, codigoGenero) {
  const url = BASE + '?season=' + TEMPORADAS[temporada] + '&weapon=' + ARMA +
              '&category=' + CATEGORIAS[categoria] + '&gender=' + codigoGenero;

  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error('La federación respondió ' + respuesta.status);

  const tiradores = extraerTiradores(await respuesta.text());
  // Hay combinaciones sin nadie (categorías de veteranos, por ejemplo). No es
  // un error: sencillamente no se guarda nada.
  if (tiradores.length === 0) return 'vacio';

  const nombreFichero = 'ranking-' + temporada + '-' + ARMA + '-' + categoria + '-' + codigoGenero + '.json';
  const destino = path.join(RAIZ, 'datos', nombreFichero);

  // Si los tiradores son exactamente los mismos, no reescribimos el fichero.
  // Si no, la fecha de descarga cambiaría cada día y habría un commit diario
  // aunque no se hubiera movido nada.
  if (fs.existsSync(destino)) {
    const previo = JSON.parse(fs.readFileSync(destino, 'utf8'));
    if (JSON.stringify(previo.tiradores) === JSON.stringify(tiradores)) return 'sin-cambios';
  }

  const contenido = {
    temporada,
    arma: 'Espada',
    categoria,
    genero: codigoGenero === 'W' ? 'Femenino' : 'Masculino',
    origen: url,
    descargadoEl: new Date().toISOString(),
    tiradores,
  };

  fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(contenido, null, 1) + '\n');
  return 'guardado';
}

/** Baja todas las combinaciones: últimas temporadas, todas las categorías, ambos géneros. */
async function traerTodo(cuantasTemporadas) {
  const temporadas = ultimasTemporadas(cuantasTemporadas);
  const categorias = Object.keys(CATEGORIAS);
  const generos = ['M', 'W'];

  console.log('Temporadas: ' + temporadas.join(', '));
  console.log('Categorías: ' + categorias.join(', '));

  const cuenta = { guardado: 0, 'sin-cambios': 0, vacio: 0, error: 0 };

  for (const temporada of temporadas) {
    for (const categoria of categorias) {
      for (const genero of generos) {
        const etiqueta = `${temporada} ${categoria} ${genero === 'W' ? 'F' : 'M'}`;
        try {
          const resultado = await traerUno(temporada, categoria, genero);
          cuenta[resultado]++;
          console.log(`  ${etiqueta}: ${resultado}`);
        } catch (error) {
          cuenta.error++;
          console.warn(`  ${etiqueta}: ERROR ${error.message}`);
        }
        // Un respiro entre peticiones: son unas cuantas y no hay prisa.
        await new Promise((seguir) => setTimeout(seguir, 1200));
      }
    }
  }

  console.log(`Resumen: ${cuenta.guardado} guardados, ${cuenta['sin-cambios']} sin cambios, ` +
              `${cuenta.vacio} vacíos, ${cuenta.error} con error.`);

  if (cuenta.guardado === 0 && cuenta.error > 0) {
    throw new Error('No se pudo traer ningún ranking.');
  }
}

/**
 * Rehace datos/rankings.json, que es la lista de lo que hay disponible.
 * Teseo la lee para saber qué puede ofrecer en el formulario de importar.
 */
function actualizarIndice() {
  const carpeta = path.join(RAIZ, 'datos');
  const ficheros = fs.readdirSync(carpeta)
    .filter((f) => f.startsWith('ranking-') && f.endsWith('.json'))
    .sort();

  const indice = ficheros.map((fichero) => {
    const datos = JSON.parse(fs.readFileSync(path.join(carpeta, fichero), 'utf8'));
    return {
      fichero,
      temporada: datos.temporada,
      arma: datos.arma,
      categoria: datos.categoria,
      genero: datos.genero,
      cuantos: datos.tiradores.length,
      descargadoEl: datos.descargadoEl,
    };
  });

  fs.writeFileSync(path.join(carpeta, 'rankings.json'),
                   JSON.stringify(indice, null, 1) + '\n');
  console.log('Índice actualizado: ' + indice.length + ' ranking(s) disponibles.');
}

async function principal() {
  const { temporada, categoria, genero, todo, ultimas } = leerArgumentos();

  if (todo) {
    await traerTodo(ultimas);
    actualizarIndice();
    return;
  }

  if (!TEMPORADAS[temporada] || !CATEGORIAS[categoria] || !GENEROS[genero]) {
    console.error('Uso:');
    console.error('  node herramientas/traer-ranking.js --temporada 2025-2026 --categoria M15 --genero F');
    console.error('  node herramientas/traer-ranking.js --todo [--ultimas 2]');
    console.error('  Temporadas: ' + Object.keys(TEMPORADAS).join(', '));
    console.error('  Categorías: ' + Object.keys(CATEGORIAS).join(', '));
    console.error('  Géneros:    M (masculino) o F (femenino)');
    process.exit(1);
  }

  const resultado = await traerUno(temporada, categoria, GENEROS[genero]);
  console.log(`${temporada} ${categoria} ${genero}: ${resultado}`);

  actualizarIndice();
}

principal().catch((error) => {
  console.error('Error: ' + error.message);
  process.exit(1);
});
