// El ranking de la federación, tal cual lo publica.
//
// No pregunta ni el arma ni el género ni la temporada: espada, el tuyo y la
// más reciente que Teseo traiga. Sólo se elige la categoría, que es lo único
// en lo que se duda cuando compites en dos.
//
// Los rankings viajan dentro de Teseo (carpeta datos/), así que esto también
// funciona sin cobertura.

import { anadir, crear, rellenar, cabecera, ir, desplegable } from '../ui.js';
import { CATEGORIA_POR_DEFECTO, nombreCompleto } from '../constantes.js';
import { generoDelUsuario } from '../genero.js';
import { listarRankings, cargarRanking } from '../rfee.js';
import { obtenerPerfilPropio } from '../db.js';

// La federación aparca ahí a quien no tiene puesto todavía.
const SIN_PUESTO = 9999;

export async function pantallaRanking(contenedor) {
  const [indice, perfil] = await Promise.all([listarRankings(), obtenerPerfilPropio()]);
  const etiquetaGenero = generoDelUsuario() === 'F' ? 'Femenino' : 'Masculino';

  const mios = indice.filter((r) => r.genero === etiquetaGenero && r.cuantos > 0);

  anadir(contenedor, cabecera('Ranking', () => ir('menu')));

  if (mios.length === 0) {
    anadir(contenedor, crear('p', {
      class: 'aviso',
      texto: 'Teseo no trae ningún ranking todavía. Hay que descargarlo antes ' +
             'con la herramienta del proyecto.',
    }));
    return;
  }

  // De cada categoría, la temporada más reciente que haya.
  const porCategoria = new Map();
  for (const ranking of mios) {
    const previo = porCategoria.get(ranking.categoria);
    if (!previo || ranking.temporada > previo.temporada) {
      porCategoria.set(ranking.categoria, ranking);
    }
  }

  const categorias = [...porCategoria.keys()].sort();
  let categoria = categorias.includes(CATEGORIA_POR_DEFECTO)
    ? CATEGORIA_POR_DEFECTO
    : categorias[0];

  const resultado = crear('div');

  anadir(contenedor,
    desplegable('Categoría', categorias.map((c) => ({ id: c, etiqueta: c })), categoria,
      (valor) => { categoria = valor || categorias[0]; pintar(); }).bloque,
    resultado,
  );

  pintar();

  // ------------------------------------------------------------------

  async function pintar() {
    const ranking = porCategoria.get(categoria);
    rellenar(resultado, crear('p', { class: 'ayuda', texto: 'Cargando…' }));

    let datos;
    try {
      datos = await cargarRanking(ranking.fichero);
    } catch (error) {
      rellenar(resultado, crear('p', {
        class: 'aviso', texto: `No se pudo leer el ranking: ${error.message}`,
      }));
      return;
    }

    // Puede haber cambiado de categoría mientras se leía el fichero.
    if (ranking !== porCategoria.get(categoria)) return;

    const cuerpo = crear('tbody', {}, datos.tiradores.map((fila) => {
      const esMio = perfil && perfil.idRfee != null && fila.idRfee === perfil.idRfee;
      return crear('tr', { class: esMio ? 'fila-activa' : null }, [
        crear('td', {
          class: 'apagado derecha',
          texto: fila.posicion && fila.posicion < SIN_PUESTO ? String(fila.posicion) : '—',
        }),
        crear('td', { texto: nombreCompleto(fila) }),
        crear('td', { class: 'apagado', texto: fila.club || '—' }),
        crear('td', { class: 'derecha tanteo', texto: puntos(fila.puntos) }),
      ]);
    }));

    rellenar(resultado, [
      crear('p', {
        class: 'ayuda',
        texto: `${datos.tiradores.length} en ${datos.categoria} ${datos.genero.toLowerCase()}, ` +
               `temporada ${datos.temporada}.`,
      }),
      crear('div', { class: 'tabla-scroll' }, [
        crear('table', { class: 'tabla-rivales' }, [
          crear('thead', {}, [
            crear('tr', {}, [
              crear('th', { class: 'derecha', texto: 'Pos.' }),
              crear('th', { texto: 'Tirador' }),
              crear('th', { texto: 'Club' }),
              crear('th', { class: 'derecha', texto: 'Puntos' }),
            ]),
          ]),
          cuerpo,
        ]),
      ]),
    ]);
  }
}

/** Los puntos como los canta la federación: miles con punto y dos decimales. */
function puntos(valor) {
  if (valor == null) return '—';
  return valor.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
