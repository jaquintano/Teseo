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
// individual: son unas 80 competiciones por temporada, así que no merece la
// pena partirlo en ficheros más pequeños.

const fs = require('fs');
const path = require('path');
const {
  soloTexto, fechaISO, filasDeLaTabla, TEMPORADAS, ultimasTemporadas,
} = require('./comun.js');

const BASE = 'https://app.skermo.org/calendar/public/rfee/results';
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

/**
 * Las columnas de la tabla, por orden:
 * fecha, nombre, arma, género, categoría, modalidad, etiqueta corta,
 * población y enlaces.
 */
function extraerCompeticiones(html) {
  const competiciones = [];

  for (const { cruda, celdas } of filasDeLaTabla(html)) {
    if (celdas.length < 8) continue;

    const nombre = soloTexto(celdas[1]);
    if (!nombre) continue;

    // El identificador va en el enlace a los resultados de la competición.
    const enlace = cruda.match(/\/competition\/(\d+)/);

    competiciones.push({
      idRfee: enlace ? Number(enlace[1]) : null,
      nombre,
      fecha: fechaISO(soloTexto(celdas[0])),
      genero: soloTexto(celdas[3]) === 'Femenino' ? 'F' : 'M',
      categoria: soloTexto(celdas[4]),
      poblacion: soloTexto(celdas[7]),
    });
  }

  return competiciones;
}

async function traerUna(temporada) {
  const url = BASE + '?season=' + TEMPORADAS[temporada] +
              '&weapon%5B%5D=' + ARMA +
              '&modality%5B%5D=' + MODALIDAD_INDIVIDUAL +
              '&owa=' + TODAS_CON_Y_SIN_RESULTADO;

  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error('La federación respondió ' + respuesta.status);

  const competiciones = extraerCompeticiones(await respuesta.text());
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
    origen: url,
    descargadoEl: new Date().toISOString(),
    competiciones,
  }, null, 1) + '\n');

  return 'guardado';
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
    await new Promise((seguir) => setTimeout(seguir, 1200));
  }

  actualizarIndice();
}

principal().catch((error) => {
  console.error('Error: ' + error.message);
  process.exit(1);
});
