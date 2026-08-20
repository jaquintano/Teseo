// Lo que Teseo sabe del tirador que la usa, y que vale para toda la
// aplicación: su género y las categorías en las que compite.
//
// Como en esgrima no se dan asaltos entre hombres y mujeres, el género del
// dueño de la aplicación vale también para todos sus rivales. Con saber el
// suyo basta para escribir "Diestra" o "Diestro" en todas partes.
//
// Y con sus categorías basta para saber qué rivales y qué competiciones
// traerle, sin volver a preguntárselo en cada formulario.
//
// Se carga al arrancar y se refresca cuando edita su perfil.

let generoActual = null;
let categoriasActuales = [];

/** 'M', 'F' o null si todavía no hay perfil. */
export function generoDelUsuario() {
  return generoActual;
}

/** Las categorías en las que compite. [] si todavía no hay perfil. */
export function categoriasDelUsuario() {
  return categoriasActuales;
}

export function fijarPerfil(perfil) {
  generoActual = (perfil && perfil.genero) || null;
  categoriasActuales = (perfil && perfil.categorias) || [];
}

/**
 * Concuerda una palabra con el género del usuario.
 * concordar('Conectad', 'o', 'a') -> "Conectada" si es mujer.
 */
export function concordar(raiz, masculino, femenino) {
  return raiz + (generoActual === 'F' ? femenino : masculino);
}
