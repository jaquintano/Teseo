// El género del tirador que usa la aplicación.
//
// Como en esgrima no se dan asaltos entre hombres y mujeres, el género del
// dueño de la aplicación vale también para todos sus rivales. Con saber el
// suyo basta para escribir "Diestra" o "Diestro" en todas partes, y para no
// ofrecerle rankings del otro género al importar.
//
// Se carga una vez al arrancar y se refresca si edita su perfil.

let generoActual = null;

/** 'M', 'F' o null si todavía no hay perfil. */
export function generoDelUsuario() {
  return generoActual;
}

export function fijarGenero(genero) {
  generoActual = genero || null;
}

/**
 * Concuerda una palabra con el género del usuario.
 * concordar('Conectad', 'o', 'a') -> "Conectada" si es mujer.
 */
export function concordar(raiz, masculino, femenino) {
  return raiz + (generoActual === 'F' ? femenino : masculino);
}
