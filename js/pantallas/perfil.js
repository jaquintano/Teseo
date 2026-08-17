// Pantalla del perfil propio.
//
// Se muestra sola la primera vez que se abre Teseo. Después se llega a ella
// desde el menú, para corregir algo.

import { crear, cabecera, ir } from '../ui.js';
import { fichaTirador } from './ficha-tirador.js';
import { obtenerPerfilPropio, guardarPerfilPropio } from '../db.js';

export async function pantallaPerfil(contenedor, datos = {}) {
  const perfil = await obtenerPerfilPropio();
  const esPrimeraVez = !perfil;

  const { formulario, leer } = fichaTirador(perfil || {});

  const guardar = crear('button', {
    type: 'button',
    class: 'boton boton-principal',
    texto: esPrimeraVez ? 'Empezar' : 'Guardar cambios',
    onclick: async () => {
      const ficha = leer();
      if (!ficha) return;
      await guardarPerfilPropio(ficha);
      ir('inicio');
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
