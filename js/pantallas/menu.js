// Menú y pantalla de configuración.

import { anadir, crear, rellenar, cabecera, ir, formatearBytes } from '../ui.js';
import {
  ALMACENES, estimarEspacio, pedirPersistencia, obtenerPerfilPropio, borrarTodo,
  listar, listarRivales, borrar,
} from '../db.js';
import { textoDelRegistro } from '../registro.js';
import { sePuedeInstalar, instalar } from '../instalacion.js';
import { concordar } from '../genero.js';
import { nombreCompleto } from '../constantes.js';
import { porGrupos, ajuste, fijarAjuste, restablecerAjustes, hayAjustesTocados } from '../ajustes.js';

export async function pantallaMenu(contenedor) {
  const perfil = await obtenerPerfilPropio();

  anadir(contenedor,
    cabecera('Menú', () => ir('inicio')),

    perfil ? crear('p', {
      class: 'ayuda',
      texto: `${concordar('Conectad', 'o', 'a')} como ${nombreCompleto(perfil)}.`,
    }) : null,

    crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Mi perfil',
      onclick: () => ir('perfil', { volverA: 'menu' }),
    }),
    crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Rivales',
      onclick: () => ir('rivales', { volverA: 'menu' }),
    }),
    crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Ranking',
      onclick: () => ir('ranking'),
    }),
    crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Competiciones',
      onclick: () => ir('competiciones', { volverA: 'menu' }),
    }),
    crear('button', {
      type: 'button', class: 'boton boton-principal boton-compacto', texto: 'Estadísticas',
      onclick: () => ir('estadisticas'),
    }),
    crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Ayuda',
      onclick: () => ir('ayuda'),
    }),
    crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Configuración',
      onclick: () => ir('configuracion'),
    }),

    // Sólo aparece si el navegador ofrece instalar y no lo está ya.
    sePuedeInstalar() ? crear('button', {
      type: 'button', class: 'boton boton-compacto', texto: 'Instalar en la pantalla de inicio',
      onclick: async () => { await instalar(); ir('menu'); },
    }) : null,

    crear('img', {
      class: 'logo-menu',
      src: './iconos/logo-teseo.jpg',
      alt: 'Teseo, by CETC',
    }),
  );
}

export async function pantallaConfiguracion(contenedor) {
  const ficha = crear('dl', { class: 'ficha' });
  const registro = crear('pre', { class: 'registro', texto: textoDelRegistro() });

  // Traer un ranking o un calendario entero deja cientos de fichas que no se
  // usarán nunca. Vaciarlas se hace desde aquí, junto a lo demás que borra.
  const [rivales, competiciones, asaltos] = await Promise.all([
    listarRivales(),
    listar(ALMACENES.competiciones),
    listar(ALMACENES.asaltos),
  ]);

  const conAsaltos = {
    rivales: new Set(asaltos.map((a) => a.rivalId)),
    competiciones: new Set(asaltos.map((a) => a.competicionId).filter((id) => id != null)),
  };
  const rivalesSinUsar = rivales.filter((r) => !conAsaltos.rivales.has(r.id));
  const competicionesSinUsar = competiciones.filter((c) => !conAsaltos.competiciones.has(c.id));

  // Los ajustes avanzados. Se repintan enteros al cambiar uno, que es lo que
  // enciende o apaga el botón de volver a los valores de fábrica.
  const ajustesAvanzados = crear('div');

  function pintarAjustes() {
    const partes = [];

    for (const [grupo, fichas] of porGrupos()) {
      partes.push(crear('h4', { class: 'subtitulo-grupo', texto: grupo }));

      for (const ficha of fichas) {
        const entrada = crear('input', {
          class: 'entrada corta',
          type: 'number',
          inputmode: 'decimal',
          min: ficha.min,
          max: ficha.max,
          step: ficha.paso,
          value: ajuste(ficha.id),
          id: 'ajuste-' + ficha.id,
        });

        // Al cambiarlo se guarda y se vuelve a pintar: si el número se salía
        // del rango, el usuario ve enseguida en qué ha quedado.
        entrada.addEventListener('change', async () => {
          await fijarAjuste(ficha.id, entrada.value);
          pintarAjustes();
        });

        partes.push(crear('div', { class: 'bloque-campo' }, [
          crear('label', {
            class: 'etiqueta-campo', for: 'ajuste-' + ficha.id,
            texto: `${ficha.etiqueta} (de fábrica: ${ficha.fabrica})`,
          }),
          entrada,
          crear('p', { class: 'ayuda', texto: ficha.ayuda }),
        ]));
      }
    }

    if (hayAjustesTocados()) {
      partes.push(crear('button', {
        type: 'button', class: 'boton', texto: 'Volver a los valores de fábrica',
        onclick: async () => { await restablecerAjustes(); pintarAjustes(); },
      }));
    }

    rellenar(ajustesAvanzados, partes);
  }

  async function refrescarEspacio() {
    const espacio = await estimarEspacio();
    ficha.textContent = '';
    const filas = espacio
      ? [
          ['Usado por Teseo', formatearBytes(espacio.usado)],
          ['Máximo concedido', formatearBytes(espacio.maximo)],
          ['Datos protegidos', espacio.persistente ? 'sí' : 'no'],
        ]
      : [['Espacio', 'este navegador no lo dice']];

    for (const [etiqueta, valor] of filas) {
      ficha.append(crear('dt', { texto: etiqueta }), crear('dd', { texto: valor }));
    }
  }

  anadir(contenedor,
    cabecera('Configuración', () => ir('menu')),

    crear('p', {
      class: 'ayuda',
      texto: '"Datos protegidos" significa que el navegador se compromete a no ' +
             'borrar tus vídeos y etiquetas cuando al móvil le falte espacio. ' +
             'Se concede al instalar Teseo en la pantalla de inicio.',
    }),
    ficha,

    crear('button', {
      type: 'button', class: 'boton', texto: 'Proteger mis datos',
      onclick: async () => {
        await pedirPersistencia();
        await refrescarEspacio();
      },
    }),

    // --- Hacer limpieza ---
    // Sólo salen si hay algo que vaciar: si no, no habría más que dos botones
    // que no hacen nada.
    rivalesSinUsar.length > 0 || competicionesSinUsar.length > 0
      ? crear('h3', { class: 'subtitulo-seccion', texto: 'Hacer limpieza' })
      : null,
    rivalesSinUsar.length > 0 || competicionesSinUsar.length > 0
      ? crear('p', {
          class: 'ayuda',
          texto: 'Quita las fichas que no aparecen en ningún asalto. Las que sí ' +
                 'lo hacen se quedan, y siempre puedes volver a traerlas de la ' +
                 'federación.',
        })
      : null,
    rivalesSinUsar.length > 0 ? crear('button', {
      type: 'button', class: 'boton boton-peligro',
      texto: `Vaciar los ${rivalesSinUsar.length} rivales sin asaltos`,
      onclick: () => vaciar('rivales', rivalesSinUsar),
    }) : null,
    competicionesSinUsar.length > 0 ? crear('button', {
      type: 'button', class: 'boton boton-peligro',
      texto: `Vaciar las ${competicionesSinUsar.length} competiciones sin asaltos`,
      onclick: () => vaciar('competiciones', competicionesSinUsar),
    }) : null,

    // --- Ajustes avanzados ---
    crear('h3', { class: 'subtitulo-seccion', texto: 'Ajustes avanzados' }),
    crear('p', {
      class: 'ayuda',
      texto: 'Números finos de la aplicación. Vienen puestos en un valor que ' +
             'funciona, y sólo hace falta tocarlos si tu forma de grabar o de ' +
             'tirar pide otra cosa. Se guardan al escribirlos.',
    }),
    ajustesAvanzados,

    // --- Empezar de cero ---
    crear('h3', { class: 'subtitulo-seccion', texto: 'Empezar de cero' }),
    crear('p', {
      class: 'ayuda',
      texto: 'Borra tu perfil, tus rivales, tus asaltos, tus vídeos y todas tus ' +
             'marcas. No se puede deshacer y no hay copia en ninguna parte. ' +
             'Teseo se quedará como recién instalada.',
    }),
    crear('button', {
      type: 'button', class: 'boton boton-peligro', texto: 'Borrar todos mis datos',
      onclick: borrarTodoConDobleAviso,
    }),

    crear('h3', { class: 'subtitulo-seccion', texto: 'Registro' }),
    crear('p', {
      class: 'ayuda',
      texto: 'Si algo falla, copia esto y mándalo: dice qué ha pasado por dentro.',
    }),
    registro,
    crear('button', {
      type: 'button', class: 'boton', texto: 'Copiar registro',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(textoDelRegistro());
          alert('Registro copiado.');
        } catch {
          const seleccion = window.getSelection();
          const rango = document.createRange();
          rango.selectNodeContents(registro);
          seleccion.removeAllRanges();
          seleccion.addRange(rango);
          alert('No he podido copiar solo. El texto queda seleccionado: cópialo a mano.');
        }
      },
    }),
  );

  pintarAjustes();
  await refrescarEspacio();

  /** Borra de golpe las fichas que no se usan en ningún asalto. */
  async function vaciar(que, fichas) {
    const almacen = que === 'rivales' ? ALMACENES.tiradores : ALMACENES.competiciones;
    if (!confirm(`¿Borrar ${fichas.length} ${que} sin ningún asalto registrado?`)) return;

    for (const fichaSuelta of fichas) {
      await borrar(almacen, fichaSuelta.id);
    }
    ir('configuracion');
  }
}

/** Dos confirmaciones, porque esto no tiene vuelta atrás. */
async function borrarTodoConDobleAviso() {
  if (!confirm('¿Seguro que quieres borrar TODO?\n\n' +
               'Se irán tu perfil, tus rivales, tus asaltos, los vídeos y todas ' +
               'tus marcas. No hay copia en ningún sitio.')) return;

  if (!confirm('Última oportunidad.\n\nEsto no se puede deshacer. ¿Borro todo?')) return;

  await borrarTodo();
  // Recargamos para que la aplicación arranque como la primera vez.
  location.reload();
}
