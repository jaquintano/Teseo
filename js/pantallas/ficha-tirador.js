// La ficha de un tirador.
//
// Tú y tus rivales tenéis exactamente los mismos campos, así que el
// formulario se escribe una sola vez y lo usan las dos pantallas.
//
// Nombre y apellidos van separados porque así los publica la federación y
// así se ordenan bien. Para los que das de alta a mano basta con rellenar el
// nombre: si dejas los apellidos vacíos, se muestra tal cual lo escribas.

import { crear, campo, campoLargo, desplegable } from '../ui.js';
import { MANOS, EMPUNADURAS } from '../constantes.js';

/**
 * Construye el formulario de un tirador.
 * @param {object} tirador ficha existente, o {} si es nueva
 * @returns {{ formulario: HTMLElement, leer: () => object|null }}
 *          `leer` devuelve la ficha rellena, o null si falta el nombre.
 */
export function fichaTirador(tirador = {}) {
  const nombre = campo('Nombre', {
    value: tirador.nombre || '', placeholder: 'Nombre',
  });
  const apellidos = campo('Apellidos', {
    value: tirador.apellidos || '', placeholder: 'Opcional',
  });
  const fechaNacimiento = campo('Fecha de nacimiento', {
    value: tirador.fechaNacimiento || '', type: 'date',
  });
  const altura = campo('Altura (cm)', {
    value: tirador.altura || '', type: 'number', inputmode: 'numeric', placeholder: '175',
  });
  const club = campo('Club', {
    value: tirador.club || '', placeholder: 'Club al que pertenece',
  });
  const notas = campoLargo('Notas', {
    value: tirador.notas || '', placeholder: 'Lo que quieras recordar de este tirador',
  });

  let mano = tirador.mano || null;
  let empunadura = tirador.empunadura || null;

  // Los que vienen del ranking de la federación llegan sin mano, porque no la
  // publican. Se deja el desplegable sin elegir para que se note que falta,
  // en vez de darlo por "Desconocido" sin que nadie lo haya mirado.
  const selectorMano = desplegable('Mano', MANOS, mano,
    (valor) => { mano = valor; }, { vacio: '— Sin indicar —' });

  const selectorEmpunadura = desplegable('Empuñadura', EMPUNADURAS, empunadura,
    (valor) => { empunadura = valor; }, { vacio: '— Sin indicar —' });

  const aviso = crear('p', { class: 'aviso', texto: 'El nombre es obligatorio.', hidden: true });

  const formulario = crear('div', {}, [
    nombre.bloque,
    apellidos.bloque,
    selectorMano.bloque,
    selectorEmpunadura.bloque,
    fechaNacimiento.bloque,
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
      // de crear una nueva, y también su procedencia.
      ...tirador,
      nombre: valorNombre,
      apellidos: apellidos.entrada.value.trim(),
      mano,
      empunadura,
      fechaNacimiento: fechaNacimiento.entrada.value || null,
      altura: alturaTexto ? Number(alturaTexto) : null,
      club: club.entrada.value.trim(),
      notas: notas.entrada.value.trim(),
    };
  }

  return { formulario, leer };
}
