// Instalación en la pantalla de inicio.
//
// El navegador avisa con el evento beforeinstallprompt cuando considera que
// la aplicación se puede instalar, y sólo entonces se puede pedir. Aquí
// guardamos ese aviso para usarlo cuando el usuario lo pida desde el menú.
//
// Antes esto vivía en un botón de la cabecera, visible en todas las
// pantallas. Molestaba, así que ahora es una opción más del menú.

import { registrar } from './registro.js';

const CLAVE_INSTALADA = 'teseo-instalada';
let aviso = null;

/** ¿Se está ejecutando como aplicación, sin barra de direcciones? */
export function enModoAplicacion() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

/** ¿Hay algo que ofrecer? Sólo si el navegador nos ha dado el aviso. */
export function sePuedeInstalar() {
  return aviso !== null && !enModoAplicacion();
}

/** Lanza el diálogo de instalación del navegador. */
export async function instalar() {
  if (!aviso) return false;
  aviso.prompt();
  const { outcome } = await aviso.userChoice;
  registrar(`Instalación: ${outcome === 'accepted' ? 'aceptada' : 'rechazada'}.`);
  if (outcome === 'accepted') localStorage.setItem(CLAVE_INSTALADA, 'sí');
  // El aviso sólo sirve una vez.
  aviso = null;
  return outcome === 'accepted';
}

export function iniciarInstalacion() {
  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto, Chrome enseña su propia barrita y no nos deja elegir cuándo.
    evento.preventDefault();
    aviso = evento;
  });

  window.addEventListener('appinstalled', () => {
    registrar('Teseo instalada en la pantalla de inicio.');
    localStorage.setItem(CLAVE_INSTALADA, 'sí');
    aviso = null;
  });
}
