// Pantalla de estadísticas.
//
// Aquí sólo se pinta. Las cuentas las hace calculo-estadisticas.js, que no
// sabe nada de pantallas ni de base de datos y se puede llevar aparte.

import { anadir, crear, rellenar, cabecera, ir, bloque, grupoOpciones } from '../ui.js';
import { MANOS, SITUACIONES, nombreCompleto, opcionesPara } from '../constantes.js';
import { generoDelUsuario } from '../genero.js';
import { ALMACENES, listar, listarRivales } from '../db.js';
import { prepararIntercambios, filtrar, calcular } from '../calculo-estadisticas.js';

const unaCifra = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** Fila con etiqueta, barra proporcional y cifras. */
function filaBarra(etiqueta, cuenta, porcentaje, maximo) {
  const ancho = maximo > 0 ? (cuenta / maximo) * 100 : 0;
  return crear('div', { class: 'fila-stat' }, [
    crear('span', { class: 'fila-etiqueta', texto: etiqueta }),
    crear('div', { class: 'barra' }, [
      crear('div', { class: 'barra-relleno', style: `width: ${ancho}%` }),
    ]),
    crear('span', {
      class: 'fila-cifra',
      texto: porcentaje === null ? `${cuenta}` : `${cuenta} · ${unaCifra(porcentaje)} %`,
    }),
  ]);
}

/** Bloque de reparto: una barra por cada opción con datos. */
function reparto(titulo, datos, ayuda) {
  const conDatos = datos.filas.filter((f) => f.cuenta > 0);
  const maximo = Math.max(0, ...datos.filas.map((f) => f.cuenta));

  return crear('section', { class: 'bloque-stat' }, [
    crear('h3', { class: 'subtitulo-seccion', texto: titulo }),
    ayuda ? crear('p', { class: 'ayuda explicacion', texto: ayuda }) : null,
    conDatos.length === 0
      ? crear('p', { class: 'ayuda', texto: 'Sin datos todavía.' })
      : crear('div', {}, conDatos.map((f) => filaBarra(f.etiqueta, f.cuenta, f.porcentaje, maximo))),
    datos.sinIndicar > 0
      ? crear('p', { class: 'ayuda', texto: `${datos.sinIndicar} sin indicar.` })
      : null,
  ]);
}

export async function pantallaEstadisticas(contenedor) {
  const [asaltos, tiempos, intercambios, tiradores, rivales] = await Promise.all([
    listar(ALMACENES.asaltos),
    listar(ALMACENES.tiempos),
    listar(ALMACENES.intercambios),
    listar(ALMACENES.tiradores),
    listarRivales(),
  ]);

  const preparados = prepararIntercambios({ asaltos, tiempos, intercambios, tiradores });

  // El número de asalto de la sesión ya no se pregunta al crear un asalto,
  // pero los que se apuntaron en su día siguen ahí y se pueden seguir
  // filtrando. Si no queda ninguno, el filtro no se ofrece.
  const numeros = [...new Set(asaltos.map((a) => a.numero).filter((n) => n != null))]
    .sort((a, b) => a - b);

  const filtros = { rivalId: null, manoRival: null, numeroAsalto: null, situacion: null };
  const resultados = crear('div');

  // --- Filtros ---
  const selectorRival = crear('select', {
    class: 'entrada',
    onchange: (e) => { filtros.rivalId = e.target.value ? Number(e.target.value) : null; pintar(); },
  });
  selectorRival.append(crear('option', { value: '', texto: 'Todos los rivales' }));
  for (const rival of rivales) {
    selectorRival.append(crear('option', { value: rival.id, texto: nombreCompleto(rival) }));
  }

  const selectorNumero = crear('select', {
    class: 'entrada',
    onchange: (e) => { filtros.numeroAsalto = e.target.value ? Number(e.target.value) : null; pintar(); },
  });
  selectorNumero.append(crear('option', { value: '', texto: 'Todos los asaltos' }));
  for (const n of numeros) {
    selectorNumero.append(crear('option', { value: n, texto: `Asalto ${n} de la sesión` }));
  }

  anadir(contenedor,
    cabecera('Estadísticas', () => ir('menu')),

    crear('details', { class: 'filtros' }, [
      crear('summary', { texto: 'Filtros' }),
      bloque('Rival', selectorRival),
      bloque('Mano del rival', grupoOpciones(opcionesPara(MANOS, generoDelUsuario()), null,
        (valor) => { filtros.manoRival = valor; pintar(); }, { clase: 'tres-columnas' })),

      // No se juega igual ganando que perdiendo.
      bloque('Cómo iba el marcador', grupoOpciones(SITUACIONES, null,
        (valor) => { filtros.situacion = valor; pintar(); }, { clase: 'tres-columnas' })),
      numeros.length > 0 ? bloque('Número de asalto', selectorNumero) : null,
    ]),

    resultados,
  );

  pintar();

  // ------------------------------------------------------------------

  function pintar() {
    const elegidos = filtrar(preparados, filtros);
    const e = calcular(elegidos);

    if (e.resumen.intercambios === 0) {
      rellenar(resultados, crear('p', {
        class: intercambios.length === 0 ? 'ayuda explicacion' : 'ayuda',
        texto: intercambios.length === 0
          ? 'Todavía no has etiquetado ningún intercambio. Las estadísticas ' +
            'aparecerán en cuanto empieces.'
          : 'Ningún intercambio cumple estos filtros.',
      }));
      return;
    }

    const r = e.resumen;
    const maxEficacia = Math.max(0, ...e.ofensivas.eficaciaPorAccion.map((f) => f.intentos));

    rellenar(resultados, [
      // --- Resumen ---
      crear('div', { class: 'resumen' }, [
        dato(r.intercambios, 'intercambios'),
        dato(r.asaltos, r.asaltos === 1 ? 'asalto' : 'asaltos'),
        dato(r.aFavor, 'a favor'),
        dato(r.enContra, 'en contra'),
        dato(r.dobles, 'dobles'),
      ]),

      // --- Ofensivas ---
      crear('h2', { class: 'titulo-bloque', texto: 'Ofensivas' }),

      crear('section', { class: 'bloque-stat' }, [
        crear('h3', { class: 'subtitulo-seccion', texto: 'Eficacia por acción' }),
        crear('p', { class: 'ayuda explicacion', texto: 'Veces que la intentaste y de ésas cuántas acabaron en tocado tuyo.' }),
        ...e.ofensivas.eficaciaPorAccion
          .filter((f) => f.intentos > 0)
          .map((f) => crear('div', { class: 'fila-stat' }, [
            crear('span', { class: 'fila-etiqueta', texto: f.etiqueta }),
            crear('div', { class: 'barra' }, [
              crear('div', { class: 'barra-relleno barra-fondo', style: `width: ${maxEficacia ? (f.intentos / maxEficacia) * 100 : 0}%` }),
              crear('div', { class: 'barra-relleno barra-exito', style: `width: ${maxEficacia ? (f.conseguidos / maxEficacia) * 100 : 0}%` }),
            ]),
            crear('span', { class: 'fila-cifra', texto: `${f.conseguidos}/${f.intentos} · ${unaCifra(f.porcentaje)} %` }),
          ])),
        e.ofensivas.eficaciaPorAccion.every((f) => f.intentos === 0)
          ? crear('p', { class: 'ayuda', texto: 'Sin datos todavía.' }) : null,
      ]),

      crear('section', { class: 'bloque-stat' }, [
        crear('h3', { class: 'subtitulo-seccion', texto: 'Iniciativa' }),
        crear('p', { class: 'ayuda explicacion', texto: 'Con qué acabas tú los intercambios: atacando, defendiendo o contraatacando.' }),
        ...(() => {
          const ini = e.ofensivas.iniciativa;
          const mayor = Math.max(ini.ataques, ini.defensas, ini.contraataques);
          const parte = (cuantos) => (ini.ataques + ini.defensas + ini.contraataques
            ? (cuantos / (ini.ataques + ini.defensas + ini.contraataques)) * 100 : 0);
          return [
            filaBarra('Atacando', ini.ataques, parte(ini.ataques), mayor),
            filaBarra('Defendiendo', ini.defensas, parte(ini.defensas), mayor),
            filaBarra('Contraatacando', ini.contraataques, parte(ini.contraataques), mayor),
          ];
        })(),
        e.ofensivas.iniciativa.sinAccion > 0
          ? crear('p', { class: 'ayuda', texto: `${e.ofensivas.iniciativa.sinAccion} intercambio(s) sin acción marcada.` })
          : null,
      ]),

      reparto('Tocados a favor por tramo', e.ofensivas.tocadosPorTramo,
              'El asalto entero repartido en tercios, encadenando sus tiempos.'),

      reparto('Tocados a favor por zona del rival', e.ofensivas.tocadosPorZona,
              'Dónde le tocas: careta, mano, brazo…'),

      reparto('Tocados a favor por zona de la pista', e.ofensivas.tocadosPorZonaPista),

      // --- Defensivas ---
      crear('h2', { class: 'titulo-bloque', texto: 'Defensivas' }),

      crear('section', { class: 'bloque-stat' }, [
        crear('h3', { class: 'subtitulo-seccion', texto: 'Parada-respuesta' }),
        crear('p', { class: 'ayuda explicacion', texto: 'De las veces que paraste, cuántas acabaron en tocado tuyo.' }),
        e.defensivas.paradaRespuesta.intentos === 0
          ? crear('p', { class: 'ayuda', texto: 'Sin datos todavía.' })
          : crear('div', { class: 'resumen' }, [
              dato(e.defensivas.paradaRespuesta.intentos, 'paradas'),
              dato(e.defensivas.paradaRespuesta.conseguidos, 'con tocado'),
              dato(`${unaCifra(e.defensivas.paradaRespuesta.porcentaje)} %`, 'eficacia'),
            ]),
      ]),

      reparto('Con qué te tocan', e.defensivas.recibidosPorAccionDelRival,
              'La acción con la que el rival acabó cada tocado en contra.'),

      reparto('Tocados recibidos por zona propia', e.defensivas.recibidosPorZona,
              'Dónde te tocan a ti.'),

      reparto('Tocados recibidos por zona de la pista', e.defensivas.recibidosPorZonaPista),

      // --- Dobles ---
      crear('h2', { class: 'titulo-bloque', texto: 'Dobles' }),
      crear('section', { class: 'bloque-stat' }, [
        crear('p', { class: 'ayuda explicacion', texto: 'Sobre el total de tocados, no sobre todos los intercambios.' }),
        crear('div', { class: 'resumen' }, [
          dato(e.dobles.cuenta, 'dobles'),
          dato(e.dobles.sobreTocados, 'tocados'),
          dato(`${unaCifra(e.dobles.porcentaje)} %`, 'del total'),
        ]),
      ]),
    ]);
  }

  function dato(valor, etiqueta) {
    return crear('div', { class: 'dato' }, [
      crear('span', { class: 'dato-valor', texto: String(valor) }),
      crear('span', { class: 'dato-etiqueta', texto: etiqueta }),
    ]);
  }
}
