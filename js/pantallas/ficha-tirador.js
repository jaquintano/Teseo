// La ficha de un tirador.
//
// Tú y tus rivales tenéis casi los mismos campos, así que el formulario se
// escribe una sola vez. Las dos diferencias:
//
//   - Tu ficha pide el género, que además fija el de toda la aplicación: no
//     hay asaltos entre hombres y mujeres, así que tus rivales son siempre
//     del mismo, y de ahí salen las palabras ("Diestra" o "Diestro") y los
//     rankings que se te ofrecen al importar.
//   - La mano y la empuñadura sólo se preguntan del rival. Las tuyas ya te
//     las sabes, y Teseo no las usa para nada.

import { crear, campo, campoLargo, desplegable, bloque, grupoOpcionesMultiple } from '../ui.js';
import {
  MANOS, EMPUNADURAS, GENEROS, CATEGORIAS,
  GENERO_POR_DEFECTO, CATEGORIA_POR_DEFECTO, opcionesPara,
} from '../constantes.js';
import { generoDelUsuario } from '../genero.js';

/**
 * Construye el formulario de un tirador.
 * @param {object} tirador ficha existente, o {} si es nueva
 * @param {{esPropio?: boolean}} opciones
 * @returns {{ formulario: HTMLElement, leer: () => object|null }}
 *          `leer` devuelve la ficha rellena, o null si falta algo obligatorio.
 */
export function fichaTirador(tirador = {}, opciones = {}) {
  const esPropio = opciones.esPropio === true;

  // Para las palabras que cambian: en tu ficha manda lo que elijas ahí mismo;
  // en la de un rival, lo que ya sabemos de ti.
  let genero = tirador.genero || (esPropio ? GENERO_POR_DEFECTO : generoDelUsuario());

  const nombre = campo('Nombre', { value: tirador.nombre || '', placeholder: 'Nombre' });
  const apellidos = campo('Apellidos', {
    value: tirador.apellidos || '', placeholder: 'Opcional',
  });
  const fechaNacimiento = campo('Fecha de nacimiento', {
    value: tirador.fechaNacimiento || '', type: 'date',
  });
  const club = campo('Club', {
    value: tirador.club || '', placeholder: 'Club al que pertenece',
  });
  const notas = campoLargo('Notas', {
    value: tirador.notas || '', placeholder: 'Lo que quieras recordar de este tirador',
  });

  let mano = tirador.mano || null;
  let empunadura = tirador.empunadura || null;
  // La ficha propia arranca con una categoría marcada: casi nadie la deja
  // como está, pero así se ve de un vistazo qué se espera aquí.
  let categorias = tirador.categorias
    || (esPropio ? [CATEGORIA_POR_DEFECTO] : []);

  // Los rivales que vienen del ranking llegan sin mano, porque la federación
  // no la publica. Se deja sin elegir para que se note que falta, en vez de
  // darlo por "Desconocido" sin que nadie lo haya mirado.
  const selectorMano = desplegable('Mano', opcionesPara(MANOS, genero), mano,
    (valor) => { mano = valor; }, { vacio: '— Sin indicar —' });

  const selectorEmpunadura = desplegable('Empuñadura', EMPUNADURAS, empunadura,
    (valor) => { empunadura = valor; }, { vacio: '— Sin indicar —' });


  // Las palabras que cambian con el género —"Diestra" o "Diestro"— sólo
  // salen en la ficha del rival, y ahí el género no se elige: es el tuyo.
  const selectorGenero = esPropio
    ? desplegable('Género', GENEROS, genero, (valor) => {
        genero = valor;
        avisoGenero.hidden = true;
      }, { vacio: '— Elige —' })
    : null;

  const aviso = crear('p', { class: 'aviso', texto: 'El nombre es obligatorio.', hidden: true });
  const avisoCategorias = crear('p', {
    class: 'aviso', hidden: true,
    texto: 'Marca al menos una categoría: de ahí salen los rivales y las ' +
           'competiciones que Teseo te trae.',
  });

  const bloqueCategorias = esPropio
    ? bloque('Categorías en las que compites',
        grupoOpcionesMultiple(CATEGORIAS, categorias, (valores) => {
          categorias = valores;
          avisoCategorias.hidden = true;
        }, { clase: 'categorias' }))
    : null;
  const avisoGenero = crear('p', {
    class: 'aviso', hidden: true,
    texto: 'Hace falta el género: de él dependen las palabras de la aplicación ' +
           'y los rankings que se te pueden ofrecer.',
  });

  const formulario = crear('div', {}, [
    nombre.bloque,
    apellidos.bloque,
    selectorGenero ? selectorGenero.bloque : null,
    bloqueCategorias,
    // De ti no se preguntan: ni la mano ni la empuñadura significan nada aquí.
    esPropio ? null : selectorMano.bloque,
    esPropio ? null : selectorEmpunadura.bloque,
    fechaNacimiento.bloque,
    club.bloque,
    notas.bloque,
    aviso,
    avisoGenero,
    avisoCategorias,
  ]);

  function leer() {
    const valorNombre = nombre.entrada.value.trim();
    if (!valorNombre) {
      aviso.hidden = false;
      nombre.entrada.focus();
      return null;
    }
    aviso.hidden = true;

    if (esPropio && !genero) {
      avisoGenero.hidden = false;
      return null;
    }

    if (esPropio && categorias.length === 0) {
      avisoCategorias.hidden = false;
      return null;
    }

    return {
      // Si la ficha ya existía, conservamos su id para actualizarla en vez
      // de crear una nueva, y también su procedencia.
      ...tirador,
      nombre: valorNombre,
      apellidos: apellidos.entrada.value.trim(),
      genero,
      categorias: esPropio ? categorias : (tirador.categorias || null),
      mano: esPropio ? null : mano,
      empunadura: esPropio ? null : empunadura,
        fechaNacimiento: fechaNacimiento.entrada.value || null,
      club: club.entrada.value.trim(),
      notas: notas.entrada.value.trim(),
    };
  }

  return { formulario, leer };
}
