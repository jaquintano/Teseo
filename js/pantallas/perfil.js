// Pantalla del perfil propio.
//
// Se muestra sola la primera vez que se abre Teseo. Después se llega a ella
// desde el menú, para corregir algo.

import { crear, cabecera, ir, empezarEn } from '../ui.js';
import { fichaTirador } from './ficha-tirador.js';
import { obtenerPerfilPropio, guardarPerfilPropio } from '../db.js';
import { fijarGenero } from '../genero.js';

export async function pantallaPerfil(contenedor, datos = {}) {
  const perfil = await obtenerPerfilPropio();
  const esPrimeraVez = !perfil;

  const { formulario, leer } = fichaTirador(perfil || {}, { esPropio: true });

  const guardar = crear('button', {
    type: 'button',
    class: 'boton boton-principal',
    texto: esPrimeraVez ? 'Empezar' : 'Guardar cambios',
    onclick: async () => {
      const ficha = leer();
      if (!ficha) return;
      await guardarPerfilPropio(ficha);
      // Las palabras de toda la aplicacion dependen de esto.
      fijarGenero(ficha.genero);
      if (esPrimeraVez) {
        // Recien creado el perfil, la pantalla de inicio pasa a ser el fondo
        // del historial: desde ella, atras sale de la aplicacion.
        empezarEn('inicio');
      } else {
        ir(datos.volverA || 'inicio');
      }
    },
  });

  contenedor.append(
    cabecera(esPrimeraVez ? 'Bienvenido a Teseo' : 'Mi perfil',
             esPrimeraVez ? null : () => ir(datos.volverA || 'inicio')),

    esPrimeraVez
      ? crear('p', {
          class: 'ayuda',
          texto: 'Antes de nada, cuéntame quién eres. Sólo se te pedirá esta vez, ' +
                 'y todo esto se queda en tu móvil.',
        })
      : null,

    formulario,
    guardar,
  );
}
