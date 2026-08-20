// Pantalla del perfil propio.
//
// La primera vez ofrece dos caminos: buscarte en el ranking de la federación,
// que rellena casi todo, o escribirlo a mano. Después se llega aquí desde el
// menú, para corregir algo.

import { crear, cabecera, ir, empezarEn } from '../ui.js';
import { fichaTirador } from './ficha-tirador.js';
import { obtenerPerfilPropio, guardarPerfilPropio } from '../db.js';
import { fijarGenero } from '../genero.js';
import { nombreCompleto } from '../constantes.js';

export async function pantallaPerfil(contenedor, datos = {}) {
  const perfil = await obtenerPerfilPropio();
  const esPrimeraVez = !perfil;

  // La primera vez, antes del formulario, se elige por dónde empezar. Si ya
  // vienes de la búsqueda en la RFEE (datos.ficha) o has pedido escribirlo a
  // mano (datos.aMano), se salta directamente al formulario.
  if (esPrimeraVez && !datos.ficha && !datos.aMano) {
    pintarBienvenida(contenedor);
    return;
  }

  // De dónde salen los datos de partida: de la ficha que traes del ranking,
  // del perfil ya guardado, o de nada.
  const dePartida = datos.ficha || perfil || {};

  const { formulario, leer } = fichaTirador(dePartida, { esPropio: true });

  const guardar = crear('button', {
    type: 'button',
    class: 'boton boton-principal',
    texto: esPrimeraVez ? 'Empezar' : 'Guardar cambios',
    onclick: async () => {
      const ficha = leer();
      if (!ficha) return;
      await guardarPerfilPropio(ficha);
      // Las palabras de toda la aplicación dependen de esto.
      fijarGenero(ficha.genero);
      if (esPrimeraVez) {
        // Recién creado el perfil, la pantalla de inicio pasa a ser el fondo
        // del historial: desde ella, atrás sale de la aplicación.
        empezarEn('inicio');
      } else {
        ir(datos.volverA || 'inicio');
      }
    },
  });

  contenedor.append(
    cabecera(esPrimeraVez ? 'Tus datos' : 'Mi perfil',
             esPrimeraVez ? () => ir('perfil') : () => ir(datos.volverA || 'inicio')),

    datos.ficha ? crear('p', {
      class: 'aviso-bueno',
      texto: `Te has reconocido como ${nombreCompleto(datos.ficha)}. Ya está casi ` +
             'todo: sólo falta con qué mano tiras y qué empuñadura usas.',
    }) : null,

    esPrimeraVez && !datos.ficha ? crear('p', {
      class: 'ayuda',
      texto: 'Cuéntame quién eres. Todo esto se queda en tu móvil.',
    }) : null,

    formulario,
    guardar,
  );
}

/** Los dos caminos para crear el perfil la primera vez. */
function pintarBienvenida(contenedor) {
  contenedor.append(
    crear('div', { class: 'cabecera' }, [
      crear('h2', { class: 'titulo-pantalla', texto: 'Bienvenido a Teseo' }),
    ]),

    crear('p', {
      class: 'texto-ayuda destacado',
      texto: 'Teseo sirve para ver en qué eres bueno y en qué no, mirando tus ' +
             'propios asaltos. Para empezar, sólo hace falta saber quién eres.',
    }),

    crear('button', {
      type: 'button', class: 'boton boton-principal',
      texto: 'Búscate en el ranking de la RFEE',
      onclick: () => ir('perfil-rfee'),
    }),
    crear('p', {
      class: 'ayuda',
      texto: 'Lo más rápido: eliges tu categoría, te buscas en la lista y quedan ' +
             'puestos tu nombre, tu fecha de nacimiento, tu club y tu género.',
    }),

    crear('button', {
      type: 'button', class: 'boton',
      texto: 'Escribir mis datos a mano',
      onclick: () => ir('perfil', { aMano: true }),
    }),
    crear('p', {
      class: 'ayuda',
      texto: 'Si no compites en el circuito federativo, o si no te encuentras en ' +
             'el ranking.',
    }),

    crear('p', {
      class: 'ayuda',
      texto: 'Nada de esto sale del teléfono: no hay que registrarse ni hay ' +
             'contraseñas.',
    }),
  );
}
