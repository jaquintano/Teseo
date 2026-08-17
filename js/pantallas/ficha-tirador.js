// La ficha de un tirador.
//
// Tú y tus rivales tenéis exactamente los mismos campos, así que el
// formulario se escribe una sola vez y lo usan las dos pantallas.

import { crear, campo, campoLargo, bloque, grupoOpciones } from '../ui.js';
import { MANOS } from '../constantes.js';

/**
 * Construye el formulario de un tirador.
 * @param {object} tirador ficha existente, o {} si es nueva
 * @returns {{ formulario: HTMLElement, leer: () => object|null }}
 *          `leer` devuelve la ficha rellena, o null si falta el nombre.
 */
export function fichaTirador(tirador = {}) {
  const nombre = campo('Nombre', { value: tirador.nombre || '', placeholder: 'Nombre y apellidos' });
  const altura = campo('Altura (cm)', {
    value: tirador.altura || '', type: 'number', inputmode: 'numeric', placeholder: '175',
  });
  const club = campo('Club', { value: tirador.club || '', placeholder: 'Club al que pertenece' });
  const notas = campoLargo('Notas', {
    value: tirador.notas || '', placeholder: 'Lo que quieras recordar de este tirador',
  });

  let mano = tirador.mano || null;

  const aviso = crear('p', { class: 'aviso', texto: 'El nombre es obligatorio.', hidden: true });

  const formulario = crear('div', {}, [
    nombre.bloque,
    bloque('Mano', grupoOpciones(MANOS, mano, (valor) => { mano = valor; }, { clase: 'dos-columnas' })),
    altura.bloque,
    club.bloque,
    notas.bloque,
    aviso,
  ]);

  function leer() {
    const valorNombre = nombre.entrada.value.trim();
    if (!valorNombre) {
      aviso.hidden = false;
      nombre.entrada.focus();
      return null;
    }
    aviso.hidden = true;

    const alturaTexto = altura.entrada.value.trim();

    return {
      // Si la ficha ya existía, conservamos su id para actualizarla en vez
      // de crear una nueva.
      ...(tirador.id !== undefined ? { id: tirador.id } : {}),
      nombre: valorNombre,
      mano,
      altura: alturaTexto ? Number(alturaTexto) : null,
      club: club.entrada.value.trim(),
      notas: notas.entrada.value.trim(),
    };
  }

  return { formulario, leer };
}
