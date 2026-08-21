// El ranking de la federación, tal cual lo publica.
//
// No pregunta ni el arma ni el género: espada y el tuyo. Se eligen la
// temporada y la categoría, que es en lo único que se duda —compites en dos
// categorías, y a veces quieres mirar cómo acabó el año pasado—.
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

  // Los que no traen a nadie no se ofrecen: una temporada que aún no ha
  // empezado está descargada pero vacía.
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

  const temporadas = [...new Set(mios.map((r) => r.temporada))].sort().reverse();
  let temporada = temporadas[0];
  let categoria = null;

  // Para no pintar el ranking que llega tarde encima del que se pidió después.
  let peticion = 0;

  const filtros = crear('div');
  const resultado = crear('div');

  anadir(contenedor, filtros, resultado);

  pintarFiltros();
  pintar();

  // ------------------------------------------------------------------

  /** Las categorías que tienen ranking en una temporada. */
  function categoriasDe(cual) {
    return [...new Set(mios.filter((r) => r.temporada === cual).map((r) => r.categoria))].sort();
  }

  /**
   * Los dos desplegables. Se rehacen al cambiar de temporada, porque no todas
   * traen las mismas categorías.
   */
  function pintarFiltros() {
    const categorias = categoriasDe(temporada);
    if (!categorias.includes(categoria)) {
      categoria = categorias.includes(CATEGORIA_POR_DEFECTO)
        ? CATEGORIA_POR_DEFECTO
        : categorias[0];
    }

    rellenar(filtros, [
      desplegable('Temporada', temporadas.map((t) => ({ id: t, etiqueta: t })), temporada,
        (valor) => {
          temporada = valor || temporadas[0];
          pintarFiltros();
          pintar();
        }).bloque,

      desplegable('Categoría', categorias.map((c) => ({ id: c, etiqueta: c })), categoria,
        (valor) => { categoria = valor || categorias[0]; pintar(); }).bloque,
    ]);
  }

  async function pintar() {
    const ranking = mios.find((r) => r.temporada === temporada && r.categoria === categoria);
    if (!ranking) { rellenar(resultado, []); return; }

    const mia = ++peticion;
    rellenar(resultado, crear('p', { class: 'ayuda', texto: 'Cargando…' }));

    let datos;
    try {
      datos = await cargarRanking(ranking.fichero);
    } catch (error) {
      if (mia !== peticion) return;
      rellenar(resultado, crear('p', {
        class: 'aviso', texto: `No se pudo leer el ranking: ${error.message}`,
      }));
      return;
    }

    // Puede haberse pedido otro mientras se leía el fichero.
    if (mia !== peticion) return;

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
        texto: `${datos.tiradores.length} en ${datos.categoria} ${datos.genero.toLowerCase()}.`,
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
