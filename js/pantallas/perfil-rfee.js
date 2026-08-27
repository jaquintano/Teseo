// Buscarte a ti mismo en el ranking de la federación.
//
// Es la vía rápida para crear tu perfil: en vez de teclear nombre, apellidos,
// fecha de nacimiento y club, eliges tu categoría y te buscas en la lista.
// De ahí sale también tu género, que es el que manda en toda la aplicación.
//
// Lo único que la federación no publica es la mano y la empuñadura, así que
// eso se rellena después.

import { anadir, crear, rellenar, cabecera, ir, bloque, campo } from '../ui.js';
import {
  nombreCompleto, coincide, etiquetaDe, GENEROS,
  GENERO_POR_DEFECTO, CATEGORIA_POR_DEFECTO,
} from '../constantes.js';
import { listarRankings, cargarRanking } from '../rfee.js';

export async function pantallaPerfilRfee(contenedor) {
  const rankings = await listarRankings();

  anadir(contenedor, cabecera('Búscate en la RFEE', () => ir('perfil')));

  if (rankings.length === 0) {
    anadir(contenedor,
      crear('p', {
        class: 'aviso',
        texto: 'Teseo no trae ningún ranking todavía. Tendrás que escribir tus ' +
               'datos a mano.',
      }),
      crear('button', {
        type: 'button', class: 'boton boton-principal', texto: 'Escribirlos a mano',
        onclick: () => ir('perfil', { aMano: true }),
      }),
    );
    return;
  }

  const unicos = (campo) => [...new Set(rankings.map((r) => r[campo]))];

  // De partida, lo mismo que trae rellena la ficha propia; si ese ranking no
  // se ha descargado, el primero que haya.
  const dePartida = (campo, preferido) => {
    const valores = unicos(campo);
    return valores.includes(preferido) ? preferido : valores[0];
  };

  let temporada = unicos('temporada')[0];
  let categoria = dePartida('categoria', CATEGORIA_POR_DEFECTO);
  // Los rankings dicen "Femenino", no "F".
  let genero = dePartida('genero', etiquetaDe(GENEROS, GENERO_POR_DEFECTO));

  const resultados = crear('div');
  const buscador = campo('Buscar por nombre', {
    placeholder: 'Escribe parte de tu nombre o apellidos',
    oninput: () => pintarLista(),
  });

  let tiradoresDelRanking = [];

  const selector = (campoRanking, valorInicial, alCambiar) => {
    const s = crear('select', {
      class: 'entrada',
      onchange: (evento) => { alCambiar(evento.target.value); cargar(); },
    });
    for (const valor of unicos(campoRanking)) {
      const opcion = crear('option', { value: valor, texto: valor });
      if (valor === valorInicial) opcion.selected = true;
      s.append(opcion);
    }
    return s;
  };

  anadir(contenedor,
    crear('p', {
      class: 'ayuda explicacion',
      texto: 'Elige tu categoría y búscate en la lista. Con eso quedan puestos ' +
             'tu nombre, tu fecha de nacimiento, tu club y tu género.',
    }),

    bloque('Temporada', selector('temporada', temporada, (v) => { temporada = v; })),
    bloque('Arma', crear('p', { class: 'valor-fijo', texto: 'Espada' })),
    bloque('Categoría', selector('categoria', categoria, (v) => { categoria = v; })),
    bloque('Género', selector('genero', genero, (v) => { genero = v; })),

    buscador.bloque,
    resultados,

    crear('button', {
      type: 'button', class: 'boton', texto: 'No me encuentro: escribirlo a mano',
      onclick: () => ir('perfil', { aMano: true }),
    }),
  );

  cargar();

  // ------------------------------------------------------------------

  async function cargar() {
    const elegido = rankings.find((r) => r.temporada === temporada
                                      && r.categoria === categoria
                                      && r.genero === genero);

    if (!elegido) {
      tiradoresDelRanking = [];
      rellenar(resultados, crear('p', {
        class: 'aviso',
        texto: 'Teseo no trae ese ranking. Prueba otra combinación.',
      }));
      return;
    }

    rellenar(resultados, crear('p', { class: 'ayuda', texto: 'Cargando…' }));
    const ranking = await cargarRanking(elegido.fichero);
    tiradoresDelRanking = ranking.tiradores.map((fila) => ({ fila, ranking }));
    pintarLista();
  }

  function pintarLista() {
    if (tiradoresDelRanking.length === 0) return;

    const busqueda = buscador.entrada.value.trim();
    const visibles = busqueda
      ? tiradoresDelRanking.filter(({ fila }) =>
          coincide(fila.nombre + ' ' + fila.apellidos + ' ' + fila.club, busqueda))
      : tiradoresDelRanking;

    const cuerpo = crear('tbody', {}, visibles.map(({ fila, ranking }) => crear('tr', {
      class: 'fila-rival',
      onclick: () => elegirme(fila, ranking),
    }, [
      crear('td', { texto: nombreCompleto(fila) }),
      crear('td', { class: 'apagado', texto: fila.club || '—' }),
    ])));

    rellenar(resultados, [
      crear('p', {
        class: 'ayuda',
        texto: busqueda
          ? `${visibles.length} de ${tiradoresDelRanking.length} tiradores.`
          : `${tiradoresDelRanking.length} tiradores. Toca el tuyo.`,
      }),
      visibles.length === 0
        ? crear('p', { class: 'ayuda', texto: 'Nadie coincide con esa búsqueda.' })
        : crear('div', { class: 'tabla-scroll' }, [
            crear('table', { class: 'tabla-rivales' }, [
              crear('thead', {}, [
                crear('tr', {}, [
                  crear('th', { texto: 'Tirador' }),
                  crear('th', { texto: 'Club' }),
                ]),
              ]),
              cuerpo,
            ]),
          ]),
    ]);
  }

  /** Se ha reconocido en la lista: se pasa a la ficha, ya rellena. */
  function elegirme(fila, ranking) {
    ir('perfil', {
      ficha: {
        nombre: fila.nombre,
        apellidos: fila.apellidos,
        fechaNacimiento: fila.fechaNacimiento,
        club: fila.club,
        genero: ranking.genero === 'Femenino' ? 'F' : 'M',
        // Ya sabemos una categoría en la que compite: la del ranking en el
        // que se ha encontrado. Puede añadir más, que es lo normal.
        categorias: [ranking.categoria],
        mano: null,
        empunadura: null,
        idRfee: fila.idRfee,
        categoriaRfee: ranking.categoria,
        temporadaRfee: ranking.temporada,
        origen: 'rfee',
      },
    });
  }
}
