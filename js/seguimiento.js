// Seguir el marcador por el vídeo.
//
// El calibrado deja un recuadro dibujado encima del aparato, pero un vídeo de
// asalto grabado con el móvil en la mano no se está quieto: a los treinta
// segundos el marcador ya no está donde se enmarcó y el análisis está mirando
// a una pared. Y hay algo peor que el temblor: el tirador se planta delante
// del aparato y lo tapa durante segundos enteros, que es justo cuando más
// tocados hay. Reencontrarlo después no es un lujo, es la mitad del trabajo.
//
// Aquí se pone el recuadro donde esté el marcador en cada muestra, y se dice
// con qué confianza. Quien decide qué hacer con eso es js/analisis.js.
//
// Cómo se busca
// -------------
// Con una plantilla: el recorte del recuadro en escala de grises, tal y como
// se veía al calibrar. Para cada posición candidata se mide el parecido con
// correlación cruzada normalizada, que resta la media y divide por la
// desviación de cada trozo. Eso es lo que la hace inmune a la autoexposición
// del móvil: si toda la escena se aclara de golpe, la plantilla sigue
// encajando porque lo que se compara es el dibujo, no el brillo.
//
// En gris y no en color a propósito. El color de un marcador son cuatro
// dígitos que cambian; el dibujo —la caja, el soporte, el fondo de detrás—
// es lo que se mantiene.
//
// Por qué una pirámide
// --------------------
// Probar todas las posiciones del fotograma con la plantilla entera cuesta
// demasiado para hacerlo diez veces por segundo en un móvil. Se busca primero
// en una copia reducida a la cuarta parte, donde hay dieciséis veces menos
// posiciones y cada una cuesta dieciséis veces menos, y luego se afina en las
// copias grandes mirando sólo alrededor de lo que salió. El resultado es el
// mismo y cuesta una centésima parte.
//
// Lo que NO hace: seguir zooms ni giros. Sólo desplazamiento. Si el vídeo se
// graba acercando y alejando, la plantilla deja de encajar y el marcador se
// da por perdido, que al menos es no mentir.

// El fotograma entero se reduce a este ancho para buscar. Con 320 píxeles, un
// marcador que ocupe una cuarta parte del encuadre da una plantilla de unos
// ochenta, de sobra para reconocerlo, y buscar cuesta cuatro veces menos que
// a 640.
export const ANCHO_DE_ESCENA = 320;

// Cuánto puede haberse movido el marcador entre dos muestras. Son píxeles de
// la escena reducida: dieciséis de trescientos veinte, diez veces por
// segundo, es medio fotograma por segundo. Más de lo que se mueve una mano.
const RADIO_LOCAL = 16;

// Al bajar un nivel de la pirámide se mira sólo esto alrededor de lo que se
// encontró arriba. Con dos basta: el error de haber redondeado a la mitad
// es uno.
const AFINADO = 2;

// Un nivel de pirámide más pequeño que esto ya no distingue nada.
const MINIMO_UTIL = 8;

// Cuántos sitios prometedores del nivel más pequeño se afinan luego.
//
// Con uno solo, un reflejo que en miniatura se parezca más que el marcador
// de verdad se lleva la búsqueda y ya no hay vuelta atrás, porque abajo sólo
// se mira alrededor de lo que salió arriba. Bajando cuatro candidatos, el
// bueno sobrevive aunque en pequeño no fuera el primero, y afinar cuesta
// mucho menos que buscar.
const CANDIDATOS = 4;

// Cuánto penaliza estar lejos de donde se vio el marcador por última vez.
//
// Una sala de armas está llena de cosas rectangulares y claras sobre fondo
// oscuro: otro aparato, un cartel, una ventana. Alguna se va a parecer al
// marcador lo bastante como para pasar el umbral, y si eso pasa el recuadro
// se muda allí y ya no vuelve. Pero un marcador no se teletransporta: entre
// dos apariciones ha podido moverse la cámara, no cambiar de pared. Restarle
// esto al parecido —una octava parte, y sólo al que esté en la otra punta del
// encuadre— hace que gane el de casa cuando los dos se parecen.
//
// Poco, y a propósito: medido sobre vídeo de verdad, un reencuentro bueno tras
// una panorámica puntúa 0,77-0,85, y con un castigo mayor se rechazaban
// reencuentros legítimos. Esto es un desempate, no un filtro.
const PESO_CERCANIA = 0.12;

// De 0 a 1: cuánto tiene que parecerse para darlo por encontrado.
//
// Dos umbrales y no uno porque las dos búsquedas no se juegan lo mismo. La
// local mira unas pocas posiciones alrededor de donde estaba hace una décima:
// acertar es lo normal, y conviene ser tolerante con el desenfoque de un
// movimiento brusco. La global mira el fotograma entero, miles de posiciones,
// y alguna se parecerá por casualidad; ahí hay que exigir más o el recuadro
// se salta a un cartel de la pared y ya no vuelve.
const UMBRAL_SEGUIR = 0.55;
const UMBRAL_REENCONTRAR = 0.70;

// Por debajo de esta desviación típica de grises la plantilla es una mancha
// lisa y no hay nada que seguir.
const DETALLE_MINIMO = 8;

/**
 * El fotograma entero, pequeño y en gris.
 *
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} lienzo se redimensiona aquí
 * @returns {{ancho:number, alto:number, gris:Uint8Array}|null}
 */
export function escenaDe(video, lienzo) {
  const anchoVideo = video.videoWidth;
  const altoVideo = video.videoHeight;
  if (!anchoVideo || !altoVideo) return null;

  // Nunca agrandar: si el vídeo es más pequeño que la escena, se usa tal cual.
  const ancho = Math.min(ANCHO_DE_ESCENA, anchoVideo);
  const alto = Math.max(1, Math.round((ancho * altoVideo) / anchoVideo));

  if (lienzo.width !== ancho || lienzo.height !== alto) {
    lienzo.width = ancho;
    lienzo.height = alto;
  }

  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  contexto.drawImage(video, 0, 0, ancho, alto);
  const pixeles = contexto.getImageData(0, 0, ancho, alto).data;

  // Los coeficientes de siempre (0,30 / 0,59 / 0,11) en enteros, para no
  // hacer sesenta mil multiplicaciones en coma flotante por fotograma.
  const gris = new Uint8Array(ancho * alto);
  for (let i = 0, p = 0; p < gris.length; i += 4, p++) {
    gris[p] = (pixeles[i] * 77 + pixeles[i + 1] * 151 + pixeles[i + 2] * 28) >> 8;
  }

  return { ancho, alto, gris };
}

/**
 * La plantilla que se va a buscar: el recuadro recortado de la escena.
 *
 * Lo que devuelve es guardable en la base de datos tal cual, que es como
 * viaja dentro del calibrado.
 *
 * @param {{ancho:number, alto:number, gris:Uint8Array}} escena
 * @param {{x:number, y:number, ancho:number, alto:number}} recuadro en 0..1
 */
export function plantillaDesde(escena, recuadro) {
  const x = Math.max(0, Math.min(escena.ancho - 1, Math.round(recuadro.x * escena.ancho)));
  const y = Math.max(0, Math.min(escena.alto - 1, Math.round(recuadro.y * escena.alto)));
  const ancho = Math.max(1, Math.min(escena.ancho - x, Math.round(recuadro.ancho * escena.ancho)));
  const alto = Math.max(1, Math.min(escena.alto - y, Math.round(recuadro.alto * escena.alto)));

  const gris = new Uint8Array(ancho * alto);
  for (let fila = 0; fila < alto; fila++) {
    for (let columna = 0; columna < ancho; columna++) {
      gris[fila * ancho + columna] = escena.gris[(y + fila) * escena.ancho + (x + columna)];
    }
  }

  return {
    ancho,
    alto,
    gris,
    anchoEscena: escena.ancho,
    altoEscena: escena.alto,
    // Dónde estaba, para poder MOVER el recuadro original en vez de
    // reconstruirlo: así conserva su tamaño exacto y no se encoge un poco en
    // cada redondeo.
    x,
    y,
  };
}

/** Media, suma y norma de un trozo, que es lo que pide la correlación. */
function estadisticas(gris) {
  let suma = 0;
  let sumaCuadrados = 0;
  for (let i = 0; i < gris.length; i++) {
    suma += gris[i];
    sumaCuadrados += gris[i] * gris[i];
  }
  const n = gris.length;
  const varianza = Math.max(0, sumaCuadrados - (suma * suma) / n);
  return {
    suma,
    desviacion: Math.sqrt(varianza / n),
    // La norma centrada: la parte del denominador de la correlación que pone
    // la plantilla. No cambia, así que se calcula una sola vez.
    norma: Math.sqrt(varianza),
  };
}

/**
 * Cuánto dibujo tiene una plantilla, en desviación típica de grises.
 *
 * Sirve para avisar en el calibrado: un recuadro sobre una pared blanca o
 * sobre el techo oscuro no se puede seguir, y más vale decirlo entonces que
 * dejar que el análisis lo descubra tres minutos después.
 */
export function detalleDe(plantilla) {
  return estadisticas(plantilla.gris).desviacion;
}

/** ¿Da esta plantilla para seguir algo? */
export function sePuedeSeguir(plantilla) {
  return Boolean(plantilla && plantilla.gris) && detalleDe(plantilla) >= DETALLE_MINIMO;
}

/** La misma imagen a la mitad de ancho y de alto, promediando de cuatro en cuatro. */
function aLaMitad(nivel) {
  const ancho = nivel.ancho >> 1;
  const alto = nivel.alto >> 1;
  const gris = new Uint8Array(ancho * alto);

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const arriba = (y * 2) * nivel.ancho + x * 2;
      const abajo = arriba + nivel.ancho;
      gris[y * ancho + x] = (nivel.gris[arriba] + nivel.gris[arriba + 1]
                           + nivel.gris[abajo] + nivel.gris[abajo + 1]) >> 2;
    }
  }

  return { ancho, alto, gris };
}

/**
 * La imagen y sus copias reducidas. El nivel 0 es el grande.
 *
 * Se para cuando el nivel siguiente sería demasiado pequeño para reconocer
 * nada. La escena y la plantilla tienen que bajar los mismos niveles, así que
 * manda la plantilla, que es la que se queda pequeña antes.
 */
function piramide(nivel, niveles) {
  const todos = [nivel];
  while (todos.length < niveles) {
    const ultimo = todos[todos.length - 1];
    if (ultimo.ancho < MINIMO_UTIL * 2 || ultimo.alto < MINIMO_UTIL * 2) break;
    todos.push(aLaMitad(ultimo));
  }
  return todos;
}

/** Cuántos niveles aguanta una plantilla sin desaparecer. */
function nivelesUtiles(plantilla) {
  let niveles = 1;
  let ancho = plantilla.ancho;
  let alto = plantilla.alto;
  while (niveles < 3 && ancho >= MINIMO_UTIL * 2 && alto >= MINIMO_UTIL * 2) {
    ancho >>= 1;
    alto >>= 1;
    niveles++;
  }
  return niveles;
}

/**
 * El parecido entre la plantilla y el trozo de escena que empieza en (ox, oy).
 *
 * Correlación cruzada normalizada, de -1 a 1. Devuelve -1 si el trozo de
 * escena es liso —un plano negro, una pared— porque entonces no se parece a
 * nada, aunque la fórmula dividiría por cero y diría lo contrario.
 */
function parecidoEn(escena, plantilla, ox, oy) {
  const anchoEscena = escena.ancho;
  const grisEscena = escena.gris;
  const { ancho, alto, gris } = plantilla;
  const n = ancho * alto;

  let suma = 0;
  let sumaCuadrados = 0;
  let producto = 0;

  for (let fila = 0; fila < alto; fila++) {
    let enEscena = (oy + fila) * anchoEscena + ox;
    let enPlantilla = fila * ancho;
    for (let columna = 0; columna < ancho; columna++, enEscena++, enPlantilla++) {
      const valor = grisEscena[enEscena];
      suma += valor;
      sumaCuadrados += valor * valor;
      producto += valor * gris[enPlantilla];
    }
  }

  const varianza = sumaCuadrados - (suma * suma) / n;
  if (varianza <= 0) return -1;

  const numerador = producto - (plantilla.suma * suma) / n;
  return numerador / (plantilla.norma * Math.sqrt(varianza));
}

/**
 * Los sitios donde mejor encaja la plantilla dentro de un área.
 *
 * Devuelve hasta `cuantos`, y separados entre sí: sin eso, los cuatro
 * mejores serían el mismo sitio movido un píxel y no habría más que un
 * candidato disfrazado de cuatro.
 *
 * Cada uno lleva dos números: `parecido`, que es lo que se parece de verdad y
 * es lo que se le enseña al usuario, y `puntuacion`, que es lo mismo menos lo
 * que penalice estar lejos de `cerca` —si se pide— y es con lo que se decide.
 */
function mejoresEn(escena, plantilla, x1, y1, x2, y2, cuantos, cerca) {
  const maximoX = escena.ancho - plantilla.ancho;
  const maximoY = escena.alto - plantilla.alto;
  if (maximoX < 0 || maximoY < 0) return [];

  const desdeX = Math.max(0, Math.min(maximoX, x1));
  const hastaX = Math.max(0, Math.min(maximoX, x2));
  const desdeY = Math.max(0, Math.min(maximoY, y1));
  const hastaY = Math.max(0, Math.min(maximoY, y2));

  const separacionX = Math.max(1, plantilla.ancho >> 1);
  const separacionY = Math.max(1, plantilla.alto >> 1);
  const mejores = [];

  for (let y = desdeY; y <= hastaY; y++) {
    for (let x = desdeX; x <= hastaX; x++) {
      const parecido = parecidoEn(escena, plantilla, x, y);
      const candidato = { x, y, parecido, puntuacion: parecido - castigo(cerca, escena, x, y) };

      // ¿Es este sitio uno que ya tenemos, movido un poco? Entonces no es
      // otro candidato: es el mismo, y sólo interesa su mejor versión.
      let repetido = -1;
      for (let i = 0; i < mejores.length; i++) {
        if (Math.abs(mejores[i].x - x) < separacionX
            && Math.abs(mejores[i].y - y) < separacionY) { repetido = i; break; }
      }
      if (repetido >= 0) {
        if (candidato.puntuacion > mejores[repetido].puntuacion) mejores[repetido] = candidato;
        continue;
      }

      if (mejores.length < cuantos) { mejores.push(candidato); continue; }

      let peor = 0;
      for (let i = 1; i < mejores.length; i++) {
        if (mejores[i].puntuacion < mejores[peor].puntuacion) peor = i;
      }
      if (candidato.puntuacion > mejores[peor].puntuacion) mejores[peor] = candidato;
    }
  }

  return mejores;
}

/** Lo que se le resta a un sitio por estar lejos de donde debería estar. */
function castigo(cerca, escena, x, y) {
  if (!cerca) return 0;
  const dx = x - cerca.x;
  const dy = y - cerca.y;
  return (PESO_CERCANIA * Math.sqrt(dx * dx + dy * dy)) / escena.ancho;
}

/** El mejor de una lista de posiciones. */
function elMejor(posiciones) {
  let mejor = null;
  for (const posicion of posiciones) {
    if (!mejor || posicion.puntuacion > mejor.puntuacion) mejor = posicion;
  }
  return mejor;
}

/**
 * Buscar bajando la pirámide: grueso arriba, fino abajo.
 *
 * Arriba se rastrea el área entera en la copia más pequeña, que es donde hay
 * dieciséis o sesenta y cuatro veces menos posiciones que probar. De ahí
 * salen unos pocos sitios prometedores, y cada uno se va afinando hacia abajo
 * mirando sólo un par de píxeles alrededor. La puntuación que cuenta es la
 * del nivel 0, la de la imagen grande.
 *
 * @param {object[]} escenas pirámide de la escena, el 0 es el grande
 * @param {object[]} plantillas pirámide de la plantilla
 * @param {object} area posiciones donde mirar, en píxeles del nivel 0
 * @param {?object} cerca dónde estaba, en píxeles del nivel 0, para preferir
 *                        lo que le quede al lado
 */
function buscar(escenas, plantillas, area, cerca) {
  const niveles = Math.min(escenas.length, plantillas.length);
  const cima = niveles - 1;
  const enSuNivel = (nivel) => (cerca
    ? { x: cerca.x / (1 << nivel), y: cerca.y / (1 << nivel) }
    : null);

  const factor = 1 << cima;
  let candidatos = mejoresEn(escenas[cima], plantillas[cima],
    Math.floor(area.x1 / factor), Math.floor(area.y1 / factor),
    Math.ceil(area.x2 / factor), Math.ceil(area.y2 / factor),
    cima === 0 ? 1 : CANDIDATOS, enSuNivel(cima));

  for (let nivel = cima - 1; nivel >= 0; nivel--) {
    const afinados = [];
    for (const candidato of candidatos) {
      // El candidato viene del nivel de arriba, donde todo mide la mitad.
      const cx = candidato.x * 2;
      const cy = candidato.y * 2;
      const afinado = mejoresEn(escenas[nivel], plantillas[nivel],
        cx - AFINADO, cy - AFINADO, cx + AFINADO, cy + AFINADO, 1, enSuNivel(nivel))[0];
      if (afinado) afinados.push(afinado);
    }
    candidatos = afinados;
    if (candidatos.length === 0) return null;
  }

  return elMejor(candidatos);
}

/**
 * El seguidor: se le van dando escenas y va diciendo dónde está el recuadro.
 *
 * @param {object} plantilla la guardada en el calibrado
 * @param {object} recuadro el del calibrado, en 0..1
 */
export function crearSeguidor(plantilla, recuadro) {
  const posible = sePuedeSeguir(plantilla);

  const plantillas = posible
    ? piramide(plantilla, nivelesUtiles(plantilla))
      .map((nivel) => ({ ...nivel, ...estadisticas(nivel.gris) }))
    : [];

  // Dónde está ahora, en píxeles de la escena. Se arranca donde lo dejó el
  // calibrado.
  let x = posible ? plantilla.x : 0;
  let y = posible ? plantilla.y : 0;
  let perdido = false;

  /** El recuadro movido: mismo tamaño que el original, otro sitio. */
  function recuadroAhora(escena) {
    const dx = (x - plantilla.x) / escena.ancho;
    const dy = (y - plantilla.y) / escena.alto;
    return {
      x: Math.max(0, Math.min(1 - recuadro.ancho, recuadro.x + dx)),
      y: Math.max(0, Math.min(1 - recuadro.alto, recuadro.y + dy)),
      ancho: recuadro.ancho,
      alto: recuadro.alto,
    };
  }

  /**
   * Dónde está el marcador en esta escena.
   *
   * @returns {{estado:'seguido'|'perdido'|'imposible', recuadro:object,
   *            parecido:number, reencontrado:boolean}}
   */
  function situar(escena) {
    if (!posible || !escena || escena.ancho !== plantilla.anchoEscena) {
      // Sin seguimiento, el recuadro se queda donde lo puso el calibrado: es
      // exactamente lo que hacía Teseo antes de todo esto.
      return { estado: 'imposible', recuadro, parecido: 0, reencontrado: false };
    }

    const escenas = piramide(escena, plantillas.length);

    // Primero donde estaba, que es donde va a estar casi siempre y cuesta
    // nada. Si venimos de perderlo, no: ahí lo que hay es otra cosa. Y aquí
    // no hace falta preferir lo cercano, porque todo lo que se mira lo es.
    const cerca = perdido ? null : buscar(escenas, plantillas, {
      x1: x - RADIO_LOCAL, y1: y - RADIO_LOCAL,
      x2: x + RADIO_LOCAL, y2: y + RADIO_LOCAL,
    }, null);

    if (cerca && cerca.parecido >= UMBRAL_SEGUIR) return aceptar(escena, cerca);

    // No estaba donde estaba: se busca en todo el fotograma. Esto es lo que
    // devuelve el marcador cuando el tirador se quita de en medio.
    const lejos = buscar(escenas, plantillas, {
      x1: 0, y1: 0, x2: escena.ancho, y2: escena.alto,
    }, { x, y });

    if (lejos && lejos.puntuacion >= UMBRAL_REENCONTRAR) return aceptar(escena, lejos);

    // Se queda donde estaba por última vez: si vuelve a aparecer ahí mismo,
    // la búsqueda local lo pilla en la muestra siguiente.
    perdido = true;
    return {
      estado: 'perdido',
      recuadro: recuadroAhora(escena),
      parecido: Math.max(cerca ? cerca.parecido : 0, lejos ? lejos.parecido : 0),
      reencontrado: false,
    };
  }

  function aceptar(escena, encontrado) {
    x = encontrado.x;
    y = encontrado.y;
    const reencontrado = perdido;
    perdido = false;
    return {
      estado: 'seguido',
      recuadro: recuadroAhora(escena),
      parecido: encontrado.parecido,
      reencontrado,
    };
  }

  return { situar, posible };
}
