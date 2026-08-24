// Descarga el calendario de competiciones de la federación y lo guarda como
// fichero de datos dentro del proyecto.
//
// ESTO NO FORMA PARTE DE LA APLICACIÓN. Se ejecuta en el ordenador:
//
//   node herramientas/traer-competiciones.js --temporada 2025-2026
//   node herramientas/traer-competiciones.js --todo [--ultimas 2]
//
// Igual que con los rankings, Teseo no puede pedírselo a la federación desde
// el navegador, así que se descarga antes y viaja dentro de la aplicación.
//
// De una tacada se traen todas las categorías y ambos géneros de espada
// individual: un par de cientos de competiciones por temporada, así que no
// merece la pena partirlo en ficheros más pequeños.
//
// Por qué hacen falta DOS páginas
// -------------------------------
// La federación cuenta lo mismo en dos sitios distintos, y ninguno de los dos
// lo cuenta entero:
//
// - "Resultados" lista lo que ya se ha celebrado. Es de donde salía todo
//   hasta ahora, y por eso no aparecía ni una competición futura: en una
//   temporada recién empezada esa página viene VACÍA.
//
// - "Calendario" lista lo convocado, con fecha y sede, antes de que se tire.
//   Pero se deja atrás cosas que sí están en Resultados.
//
// Así que se piden las dos y se juntan. Lo que salga en las dos se queda una
// sola vez: se reconocen por el identificador de la federación y, si no lo
// llevan, por nombre, fecha, categoría, género y población.

const fs = require('fs');
const path = require('path');
const {
  soloTexto, fechaISO, filasDeLaTabla, TEMPORADAS, ultimasTemporadas,
} = require('./comun.js');

const BASE_RESULTADOS = 'https://app.skermo.org/calendar/public/rfee/results';
const BASE_CALENDARIO = 'https://app.skermo.org/calendar/public/rfee';
const RAIZ = path.resolve(__dirname, '..');

// Espada siempre, e individual siempre: Teseo va de asaltos de uno contra uno.
const ARMA = 'E';
const MODALIDAD_INDIVIDUAL = '1';

// La casilla "Con resultado" de la web es engañosa: se envía siempre, y lo
// que cambia es su valor. 2 significa "sólo las que tienen resultados" y 1
// "todas". Y si no se envía, el servidor hace como si fuera 2.
//
// Queremos todas: hay competiciones internacionales de las que la federación
// no publica resultados pero en las que sí se compite, y esas también
// interesan. Con 1 pasamos de 83 a 239 competiciones por temporada.
const TODAS_CON_Y_SIN_RESULTADO = '1';

/** Las dos direcciones de una temporada, con los mismos filtros. */
function direcciones(temporada) {
  const filtros = 'season=' + TEMPORADAS[temporada] +
                  '&weapon%5B%5D=' + ARMA +
                  '&modality%5B%5D=' + MODALIDAD_INDIVIDUAL;

  return {
    resultados: BASE_RESULTADOS + '?' + filtros + '&owa=' + TODAS_CON_Y_SIN_RESULTADO,

    // Las dos casillas del calendario importan, y mucho:
    //
    // - "Ver anteriores" (showPrevious): sin ella sólo se enseña lo que aún
    //   está por venir, y perderíamos media temporada según avance.
    //
    // - "Comp. externas" (showExt): sin ella no salen las internacionales.
    //   En la temporada 2026-2027 es la diferencia entre 2 competiciones
    //   y 148.
    calendario: BASE_CALENDARIO + '?' + filtros + '&showPrevious=1&showExt=1',
  };
}

/**
 * Las columnas de la tabla, por orden y ya sin las que sólo salen en el
 * móvil: fecha, nombre, arma, género, categoría, modalidad, población y
 * enlaces. Las dos páginas se leen igual.
 */
function extraerCompeticiones(html) {
  const competiciones = [];

  for (const { cruda, celdas } of filasDeLaTabla(html)) {
    if (celdas.length < 7) continue;

    const nombre = soloTexto(celdas[1]);
    if (!nombre) continue;

    // En Resultados el identificador va en el enlace a la clasificación. En
    // Calendario no hay clasificación que enlazar todavía, así que sale de la
    // ventana de detalle de la fila, que es #detail<id>. Es el mismo número.
    const enlace = cruda.match(/\/competition\/(\d+)/) || cruda.match(/#detail(\d+)/);

    competiciones.push({
      idRfee: enlace ? Number(enlace[1]) : null,
      nombre,
      fecha: fechaISO(soloTexto(celdas[0])),
      genero: soloTexto(celdas[3]) === 'Femenino' ? 'F' : 'M',
      categoria: soloTexto(celdas[4]),
      poblacion: soloTexto(celdas[6]),
    });
  }

  return competiciones;
}

/**
 * Cómo se reconoce la misma competición cuando no lleva identificador.
 *
 * Un mismo torneo se parte en una competición por categoría y género, y el
 * circuito europeo celebra el mismo día pruebas con el mismo nombre en
 * ciudades distintas. Hacen falta los cinco datos.
 */
function clave(competicion) {
  return [competicion.nombre, competicion.fecha, competicion.categoria,
          competicion.genero, competicion.poblacion].join('|').toUpperCase();
}

/**
 * Junta las listas de las dos páginas sin repetir nada.
 *
 * Manda la primera en la que aparezca. Lo único que se toma de la segunda es
 * el identificador cuando la primera no lo traía: Resultados sólo lo enseña
 * si hay clasificación publicada, y el Calendario lo lleva siempre.
 */
function unir(...listas) {
  const porId = new Map();
  const porClave = new Map();
  const todas = [];

  for (const competicion of listas.flat()) {
    const conocida = (competicion.idRfee != null && porId.get(competicion.idRfee))
                  || porClave.get(clave(competicion));

    if (conocida) {
      if (conocida.idRfee == null && competicion.idRfee != null) {
        conocida.idRfee = competicion.idRfee;
        porId.set(competicion.idRfee, conocida);
      }
      continue;
    }

    todas.push(competicion);
    porClave.set(clave(competicion), competicion);
    if (competicion.idRfee != null) porId.set(competicion.idRfee, competicion);
  }

  return todas;
}

const esperar = (milisegundos) => new Promise((seguir) => setTimeout(seguir, milisegundos));

async function traerTabla(url) {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error('La federación respondió ' + respuesta.status);
  return extraerCompeticiones(await respuesta.text());
}

async function traerUna(temporada) {
  const urls = direcciones(temporada);

  // Si falla cualquiera de las dos, el error sube y la temporada se queda
  // como estaba. Mejor eso que guardar media lista y que al usuario le
  // desaparezcan competiciones que ayer estaban.
  const deResultados = await traerTabla(urls.resultados);
  await esperar(1200);
  const delCalendario = await traerTabla(urls.calendario);

  const competiciones = unir(deResultados, delCalendario);
  if (competiciones.length === 0) return 'vacio';

  // Orden propio y estable, para que el fichero sólo cambie cuando cambie
  // algo de verdad y no porque la federación las devuelva en otro orden.
  competiciones.sort((a, b) => {
    if (a.idRfee != null && b.idRfee != null) return a.idRfee - b.idRfee;
    if (a.idRfee != null) return -1;
    if (b.idRfee != null) return 1;
    return (a.fecha + a.nombre).localeCompare(b.fecha + b.nombre, 'es');
  });

  const nombreFichero = 'competiciones-' + temporada + '-' + ARMA + '.json';
  const destino = path.join(RAIZ, 'datos', nombreFichero);

  if (fs.existsSync(destino)) {
    const previo = JSON.parse(fs.readFileSync(destino, 'utf8'));
    if (JSON.stringify(previo.competiciones) === JSON.stringify(competiciones)) {
      return 'sin-cambios';
    }
  }

  fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify({
    temporada,
    arma: 'Espada',
    modalidad: 'Individual',
    origen: [urls.resultados, urls.calendario],
    descargadoEl: new Date().toISOString(),
    competiciones,
  }, null, 1) + '\n');

  const soloEnCalendario = competiciones.length - deResultados.length;
  return 'guardado: ' + competiciones.length + ' competiciones, ' +
         soloEnCalendario + ' de ellas sólo en el calendario';
}

/** Rehace datos/competiciones.json, el índice de lo que hay disponible. */
function actualizarIndice() {
  const carpeta = path.join(RAIZ, 'datos');
  const ficheros = fs.readdirSync(carpeta)
    .filter((f) => f.startsWith('competiciones-') && f.endsWith('.json'))
    .sort();

  const indice = ficheros.map((fichero) => {
    const datos = JSON.parse(fs.readFileSync(path.join(carpeta, fichero), 'utf8'));
    return {
      fichero,
      temporada: datos.temporada,
      arma: datos.arma,
      cuantas: datos.competiciones.length,
      descargadoEl: datos.descargadoEl,
    };
  });

  fs.writeFileSync(path.join(carpeta, 'competiciones.json'),
                   JSON.stringify(indice, null, 1) + '\n');
  console.log('Índice actualizado: ' + indice.length + ' temporada(s) disponibles.');
}

async function principal() {
  const args = process.argv.slice(2);
  const valor = (nombre) => {
    const i = args.indexOf('--' + nombre);
    return i >= 0 ? args[i + 1] : null;
  };

  const temporadas = args.includes('--todo')
    ? ultimasTemporadas(Number(valor('ultimas') || 2))
    : [valor('temporada')];

  if (temporadas.some((t) => !TEMPORADAS[t])) {
    console.error('Uso:');
    console.error('  node herramientas/traer-competiciones.js --temporada 2025-2026');
    console.error('  node herramientas/traer-competiciones.js --todo [--ultimas 2]');
    console.error('  Temporadas: ' + Object.keys(TEMPORADAS).join(', '));
    process.exit(1);
  }

  for (const temporada of temporadas) {
    try {
      const resultado = await traerUna(temporada);
      console.log('  ' + temporada + ': ' + resultado);
    } catch (error) {
      console.warn('  ' + temporada + ': ERROR ' + error.message);
    }
    await esperar(1200);
  }

  actualizarIndice();
}

principal().catch((error) => {
  console.error('Error: ' + error.message);
  process.exit(1);
});
