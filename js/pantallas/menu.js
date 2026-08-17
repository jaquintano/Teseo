// Menú y pantalla de diagnóstico.

import { crear, cabecera, ir, formatearBytes } from '../ui.js';
import { estimarEspacio, pedirPersistencia, obtenerPerfilPropio } from '../db.js';
import { textoDelRegistro } from '../registro.js';
import { sePuedeInstalar, instalar } from '../instalacion.js';

export async function pantallaMenu(contenedor) {
  const perfil = await obtenerPerfilPropio();

  contenedor.append(
    cabecera('Menú', () => ir('inicio')),

    perfil ? crear('p', { class: 'ayuda', texto: `Conectado como ${perfil.nombre}.` }) : null,

    crear('button', {
      type: 'button', class: 'boton boton-principal', texto: 'Estadísticas',
      onclick: () => ir('estadisticas'),
    }),
    crear('button', {
      type: 'button', class: 'boton', texto: 'Mi perfil',
      onclick: () => ir('perfil', { volverA: 'menu' }),
    }),
    crear('button', {
      type: 'button', class: 'boton', texto: 'Rivales',
      onclick: () => ir('rivales', { volverA: 'menu' }),
    }),
    crear('button', {
      type: 'button', class: 'boton', texto: 'Diagnóstico',
      onclick: () => ir('diagnostico'),
    }),

    // Sólo aparece si el navegador ofrece instalar y no lo está ya.
    sePuedeInstalar() ? crear('button', {
      type: 'button', class: 'boton', texto: 'Instalar en la pantalla de inicio',
      onclick: async () => { await instalar(); ir('menu'); },
    }) : null,

    crear('img', {
      class: 'logo-menu',
      src: './iconos/logo-teseo.jpg',
      alt: 'Teseo, by CETC',
    }),
  );
}

export async function pantallaDiagnostico(contenedor) {
  const ficha = crear('dl', { class: 'ficha' });
  const registro = crear('pre', { class: 'registro', texto: textoDelRegistro() });

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

  contenedor.append(
    cabecera('Diagnóstico', () => ir('menu')),

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

  await refrescarEspacio();
}
