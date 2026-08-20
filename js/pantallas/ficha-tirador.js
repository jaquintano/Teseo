// La ficha de un tirador.
//
// Tú y tus rivales tenéis casi los mismos campos, así que el formulario se
// escribe una sola vez. Las dos diferencias:
//
//   - Tu ficha pide el género, que además fija el de toda la aplicación: no
//     hay asaltos entre hombres y mujeres, así que tus rivales son siempre
//     del mismo, y de ahí salen las palabras ("Diestra" o "Diestro") y los
//     rankings que se te ofrecen al importar.
//   - La estatura del rival no se pide en centímetros, que no hay forma de
//     saberlos, sino comparada contigo.

import { crear, campo, campoLargo, desplegable, bloque, grupoOpcionesMultiple } from '../ui.js';
import {
  MANOS, EMPUNADURAS, ESTATURAS, GENEROS, CATEGORIAS, ESTATURA_POR_DEFECTO,
  opcionesPara,
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
  let genero = tirador.genero || (esPropio ? null : generoDelUsuario());

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
  let estatura = tirador.estatura || ESTATURA_POR_DEFECTO;
  let categorias = tirador.categorias || [];

  // Los rivales que vienen del ranking llegan sin mano, porque la federación
  // no la publica. Se deja sin elegir para que se note que falta, en vez de
  // darlo por "Desconocido" sin que nadie lo haya mirado.
  const selectorMano = desplegable('Mano', opcionesPara(MANOS, genero), mano,
    (valor) => { mano = valor; }, { vacio: '— Sin indicar —' });

  const selectorEmpunadura = desplegable('Empuñadura', EMPUNADURAS, empunadura,
    (valor) => { empunadura = valor; }, { vacio: '— Sin indicar —' });

  const selectorEstatura = desplegable('Estatura, comparada contigo',
    opcionesPara(ESTATURAS, genero), estatura, (valor) => { estatura = valor; });

  const selectorGenero = esPropio
    ? desplegable('Género', GENEROS, genero, (valor) => {
        genero = valor;
        avisoGenero.hidden = true;
        // Al cambiarlo se rehacen las palabras que dependen de él.
        rehacerEtiquetas();
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
        }, { clase: 'compacto' }))
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
    esPropio ? crear('p', {
      class: 'ayuda',
      texto: 'Se suele competir en la propia categoría y en la de arriba. Con ' +
             'esto, Teseo ya sabe qué rivales y qué competiciones traerte sin ' +
             'volver a preguntártelo.',
    }) : null,
    esPropio ? crear('p', {
      class: 'ayuda',
      texto: 'En esgrima no se compite entre hombres y mujeres, así que esto ' +
             'vale también para todos tus rivales.',
    }) : null,
    selectorMano.bloque,
    selectorEmpunadura.bloque,
    // Tu propia estatura comparada contigo no significa nada.
    esPropio ? null : selectorEstatura.bloque,
    fechaNacimiento.bloque,
    club.bloque,
    notas.bloque,
    aviso,
    avisoGenero,
    avisoCategorias,
  ]);

  /** Reescribe las opciones que cambian de palabra según el género. */
  function rehacerEtiquetas() {
    for (const [selector, catalogo] of [[selectorMano, MANOS], [selectorEstatura, ESTATURAS]]) {
      for (const opcion of selector.entrada.options) {
        const encontrada = catalogo.find((o) => o.id === opcion.value);
        if (encontrada) opcion.textContent = (genero && encontrada[genero]) || encontrada.etiqueta;
      }
    }
  }

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
      mano,
      empunadura,
      estatura: esPropio ? null : estatura,
      fechaNacimiento: fechaNacimiento.entrada.value || null,
      club: club.entrada.value.trim(),
      notas: notas.entrada.value.trim(),
    };
  }

  return { formulario, leer };
}
