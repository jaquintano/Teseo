// Piezas de interfaz que se usan en varias pantallas.
//
// Aquí no hay nada de esgrima ni de base de datos: sólo la fontanería para
// crear elementos, pintar botones de opción y cambiar de pantalla.

/**
 * Crea un elemento del DOM de un tirón.
 * crear('button', { class: 'boton', texto: 'Guardar' })
 */
export function crear(etiqueta, propiedades = {}, hijos = []) {
  const elemento = document.createElement(etiqueta);

  for (const [nombre, valor] of Object.entries(propiedades)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (nombre === 'texto') elemento.textContent = valor;
    else if (nombre === 'onclick') elemento.addEventListener('click', valor);
    else if (nombre === 'oninput') elemento.addEventListener('input', valor);
    else if (nombre === 'onchange') elemento.addEventListener('change', valor);
    else if (valor === true) elemento.setAttribute(nombre, '');
    else elemento.setAttribute(nombre, valor);
  }

  for (const hijo of [].concat(hijos)) {
    if (hijo) elemento.append(hijo);
  }
  return elemento;
}

/** Vacía un elemento y le mete contenido nuevo. */
export function rellenar(elemento, contenido) {
  elemento.textContent = '';
  for (const hijo of [].concat(contenido)) {
    if (hijo) elemento.append(hijo);
  }
}

/**
 * Fila de botones grandes de los que sólo puede haber uno elegido.
 * Volver a pulsar el botón ya elegido lo deselecciona: así se deja vacío un
 * campo opcional sin necesidad de un botón de "ninguno".
 *
 * @param {Array<{id:string, etiqueta:string}>} catalogo
 * @param {string|null} valor el elegido ahora mismo
 * @param {(nuevoValor:string|null) => void} alElegir
 */
export function grupoOpciones(catalogo, valor, alElegir, opciones = {}) {
  const contenedor = crear('div', { class: `grupo-opciones ${opciones.clase || ''}`.trim() });

  for (const opcion of catalogo) {
    const boton = crear('button', {
      type: 'button',
      class: 'boton boton-opcion' + (valor === opcion.id ? ' elegido' : ''),
      texto: opcion.etiqueta,
      onclick: () => {
        const nuevo = valor === opcion.id ? null : opcion.id;
        valor = nuevo;
        for (const otro of contenedor.children) otro.classList.remove('elegido');
        if (nuevo) boton.classList.add('elegido');
        alElegir(nuevo);
      },
    });
    contenedor.append(boton);
  }

  return contenedor;
}

/**
 * Desplegable de un catálogo, con su etiqueta encima.
 *
 * @param {string} etiqueta
 * @param {Array<{id:string, etiqueta:string}>} catalogo
 * @param {string|null} valor el elegido ahora mismo
 * @param {(nuevoValor:string|null) => void} alElegir
 * @param {{vacio?: string}} opciones texto de la opción sin elegir; si no se
 *        indica, no se ofrece la posibilidad de dejarlo en blanco.
 */
export function desplegable(etiqueta, catalogo, valor, alElegir, opciones = {}) {
  const id = `campo-${Math.random().toString(36).slice(2, 9)}`;
  const entrada = crear('select', {
    id,
    class: 'entrada',
    onchange: (evento) => alElegir(evento.target.value || null),
  });

  if (opciones.vacio !== undefined) {
    entrada.append(crear('option', { value: '', texto: opciones.vacio }));
  }

  for (const opcion of catalogo) {
    const elemento = crear('option', { value: opcion.id, texto: opcion.etiqueta });
    if (opcion.id === valor) elemento.selected = true;
    entrada.append(elemento);
  }

  const bloque = crear('div', { class: 'bloque-campo' }, [
    crear('label', { class: 'etiqueta-campo', for: id, texto: etiqueta }),
    entrada,
  ]);

  return { bloque, entrada };
}

/**
 * Fila de botones grandes donde se pueden marcar varios a la vez.
 * Se usa para las categorías en las que compite el tirador.
 *
 * @param {Array<{id:string, etiqueta:string}>} catalogo
 * @param {Array<string>} valores los marcados ahora mismo
 * @param {(nuevosValores:Array<string>) => void} alCambiar
 */
export function grupoOpcionesMultiple(catalogo, valores, alCambiar, opciones = {}) {
  const elegidos = new Set(valores || []);
  const contenedor = crear('div', { class: `grupo-opciones ${opciones.clase || ''}`.trim() });

  for (const opcion of catalogo) {
    const boton = crear('button', {
      type: 'button',
      class: 'boton boton-opcion' + (elegidos.has(opcion.id) ? ' elegido' : ''),
      texto: opcion.etiqueta,
      onclick: () => {
        if (elegidos.has(opcion.id)) elegidos.delete(opcion.id);
        else elegidos.add(opcion.id);
        boton.classList.toggle('elegido', elegidos.has(opcion.id));
        // En el orden del catálogo, no en el que se hayan ido pulsando.
        alCambiar(catalogo.filter((o) => elegidos.has(o.id)).map((o) => o.id));
      },
    });
    contenedor.append(boton);
  }

  return contenedor;
}

/** Campo de texto con su etiqueta encima. */
export function campo(etiqueta, propiedades = {}) {
  const id = `campo-${Math.random().toString(36).slice(2, 9)}`;
  const entrada = crear('input', { id, class: 'entrada', type: 'text', ...propiedades });
  const bloque = crear('div', { class: 'bloque-campo' }, [
    crear('label', { class: 'etiqueta-campo', for: id, texto: etiqueta }),
    entrada,
  ]);
  return { bloque, entrada };
}

/** Área de texto de varias líneas. */
export function campoLargo(etiqueta, propiedades = {}) {
  const id = `campo-${Math.random().toString(36).slice(2, 9)}`;
  const entrada = crear('textarea', { id, class: 'entrada', rows: 3, ...propiedades });
  const bloque = crear('div', { class: 'bloque-campo' }, [
    crear('label', { class: 'etiqueta-campo', for: id, texto: etiqueta }),
    entrada,
  ]);
  return { bloque, entrada };
}

/** Bloque con título para agrupar unos cuantos botones de opción. */
export function bloque(etiqueta, contenido) {
  return crear('div', { class: 'bloque-campo' }, [
    crear('span', { class: 'etiqueta-campo', texto: etiqueta }),
    contenido,
  ]);
}

// --- Navegación entre pantallas ---------------------------------------

const pantallas = new Map();
let pantallaActual = null;

// Para que el botón de retroceso de Android funcione como el de "Volver".
//
// Cada vez que se cambia de pantalla se añade una entrada al historial del
// navegador. Al pulsar atrás, el navegador retrocede y nosotros repintamos
// la pantalla anterior. En la pantalla de inicio no hay nada detrás, así que
// el botón hace lo suyo de siempre: salir de la aplicación.
//
// Los datos de cada pantalla no caben en el historial (a veces llevan
// funciones dentro), así que ahí sólo va un número y lo demás se guarda aquí.
const memoria = new Map();
let contador = 0;
// Cuántas pantallas llevamos apiladas por encima de la de inicio.
let profundidad = 0;

/** Qué se pinta cuando el usuario retrocede hasta el principio. */
let pantallaDeInicio = 'inicio';

export function fijarPantallaDeInicio(nombre) {
  pantallaDeInicio = nombre;
}

/**
 * Da de alta una pantalla.
 * @param {string} nombre
 * @param {(contenedor:HTMLElement, datos:any) => void|Promise<void>} dibujar
 */
export function registrarPantalla(nombre, dibujar) {
  pantallas.set(nombre, dibujar);
}

// Se pasa un objeto vacío y no null: las pantallas leen datos.algo y con
// null reventarían.
/** Muestra una pantalla, pasándole datos si hacen falta. */
export async function ir(nombre, datos = {}) {
  // Volver a la pantalla de inicio deshace todo el camino andado. Si no, al
  // llegar a ella quedarían entradas debajo y el botón de atrás de Android
  // volvería a meterse por donde veníamos en vez de salir de la aplicación.
  //
  // Ojo: sólo si no se lleva nada. Al retroceder se repinta con los datos que
  // había guardados en el historial, así que lo que se pase ahora se
  // perdería; y a veces la pantalla de inicio se visita con datos, como la
  // ficha que traes de buscarte en el ranking.
  const sinDatos = Object.keys(datos).length === 0;
  if (nombre === pantallaDeInicio && profundidad > 0 && sinDatos) {
    history.go(-profundidad);
    return;   // de pintar se encarga el manejador de "atrás"
  }

  contador++;
  profundidad++;
  memoria.set(contador, { nombre, datos });
  history.pushState({ teseo: contador, prof: profundidad }, '');
  await pintar(nombre, datos);
}

/** Pinta una pantalla sin tocar el historial. */
async function pintar(nombre, datos) {
  const dibujar = pantallas.get(nombre);
  if (!dibujar) throw new Error(`No existe la pantalla "${nombre}"`);

  const contenedor = document.getElementById('pantalla');
  contenedor.textContent = '';
  pantallaActual = nombre;
  await dibujar(contenedor, datos);
  window.scrollTo(0, 0);
}

/** Arranca la navegación en una pantalla, sin dejar nada detrás. */
export async function empezarEn(nombre, datos = {}) {
  pantallaDeInicio = nombre;
  profundidad = 0;
  history.replaceState({ teseo: 0, prof: 0 }, '');
  await pintar(nombre, datos);
}

export function iniciarBotonAtras() {
  window.addEventListener('popstate', (evento) => {
    const estado = evento.state;

    // Si la entrada no es nuestra, no nos metemos: será lo que hubiera antes
    // de abrir Teseo, y el navegador hará lo suyo.
    if (!estado || estado.teseo === undefined) return;

    profundidad = estado.prof || 0;

    if (estado.teseo === 0) {
      // Estamos en el fondo: la pantalla de inicio. Desde aquí, el siguiente
      // "atrás" sale de la aplicación.
      pintar(pantallaDeInicio, {});
      return;
    }

    const recordada = memoria.get(estado.teseo);
    if (recordada) pintar(recordada.nombre, recordada.datos);
    else pintar(pantallaDeInicio, {});
  });
}

export function pantallaEnPantalla() {
  return pantallaActual;
}

/** Cabecera de una pantalla, con título y botón de volver si procede. */
export function cabecera(titulo, alVolver = null) {
  return crear('div', { class: 'cabecera' }, [
    alVolver ? crear('button', {
      type: 'button', class: 'boton-volver', texto: '‹ Volver', onclick: alVolver,
    }) : null,
    crear('h2', { class: 'titulo-pantalla', texto: titulo }),
  ]);
}

// --- Formato ----------------------------------------------------------

export function formatearFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function formatearBytes(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes)) return 'desconocido';
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['kB', 'MB', 'GB', 'TB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) { valor /= 1024; i++; }
  return `${valor.toFixed(valor < 10 ? 1 : 0)} ${unidades[i]}`;
}

export function formatearSegundos(segundos) {
  if (!isFinite(segundos)) return '—';
  const minutos = Math.floor(segundos / 60);
  const resto = Math.floor(segundos - minutos * 60);
  return `${minutos}:${String(resto).padStart(2, '0')}`;
}
