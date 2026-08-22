// Detección de tocados mirando las lámparas del aparato.
//
// En espada el aparato tiene dos lámparas: una verde y una roja. Se encienden
// en el instante del tocado, y si se encienden las dos es un doble. Si en el
// vídeo se ve el marcador, se pueden encontrar los tocados solos.
//
// Aquí no hay ni base de datos ni pantalla: se le pasan píxeles y devuelve
// cuentas, y se le pasan cuentas y devuelve tocados. Quien reproduce el vídeo
// y va tomando muestras es js/analisis.js.
//
// Por qué HSV y no RGB
// --------------------
// Porque lo que define una lámpara encendida no es "cuánto rojo tiene" sino
// "de qué color es, y con cuánta fuerza". Un LED potente satura el sensor del
// móvil y sale blanco en el centro, pero el halo de alrededor conserva el
// tinte; y la autoexposición del móvil cambia el brillo de toda la escena de
// un momento a otro. Separando tono, saturación y brillo se puede ser
// tolerante con lo segundo sin dejar de exigir lo primero.

// Un píxel cuenta como encendido si tiene color de verdad y no está apagado.
// Generosos los dos: el halo de un LED saturado no es un rojo puro.
const SATURACION_MINIMA = 0.35;
const BRILLO_MINIMO = 0.40;

// El tono va en grados. El rojo está partido en los dos extremos de la rueda,
// así que hay que mirar los dos rangos.
const ROJO_BAJO = 20;
const ROJO_ALTO = 340;
const VERDE_DESDE = 80;
const VERDE_HASTA = 170;

// Con el recuadro reducido a este ancho, un asalto entero cabe en unos pocos
// segundos de cálculo. Da igual el tamaño del recuadro que dibuje el usuario:
// calibrado y análisis miden sobre el mismo lienzo, así que los umbrales que
// salen de uno valen para el otro.
export const ANCHO_DE_ANALISIS = 160;

/**
 * El trozo de vídeo que hay que mirar, dibujado en un lienzo pequeño.
 *
 * @param {HTMLVideoElement} video
 * @param {{x:number, y:number, ancho:number, alto:number}} recuadro en 0..1
 * @param {HTMLCanvasElement} lienzo se redimensiona aquí
 * @returns {ImageData|null} null si el vídeo aún no tiene fotograma
 */
export function recortar(video, recuadro, lienzo) {
  const anchoVideo = video.videoWidth;
  const altoVideo = video.videoHeight;
  if (!anchoVideo || !altoVideo) return null;

  const x = Math.max(0, Math.round(recuadro.x * anchoVideo));
  const y = Math.max(0, Math.round(recuadro.y * altoVideo));
  const ancho = Math.min(anchoVideo - x, Math.round(recuadro.ancho * anchoVideo));
  const alto = Math.min(altoVideo - y, Math.round(recuadro.alto * altoVideo));
  if (ancho < 1 || alto < 1) return null;

  const escala = Math.min(1, ANCHO_DE_ANALISIS / ancho);
  lienzo.width = Math.max(1, Math.round(ancho * escala));
  lienzo.height = Math.max(1, Math.round(alto * escala));

  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  contexto.drawImage(video, x, y, ancho, alto, 0, 0, lienzo.width, lienzo.height);
  return contexto.getImageData(0, 0, lienzo.width, lienzo.height);
}

/** De qué color es un píxel, si es de alguno. */
function colorDelPixel(r, g, b) {
  const maximo = Math.max(r, g, b);
  const minimo = Math.min(r, g, b);

  const brillo = maximo / 255;
  if (brillo < BRILLO_MINIMO) return 0;

  const saturacion = maximo === 0 ? 0 : (maximo - minimo) / maximo;
  if (saturacion < SATURACION_MINIMA) return 0;

  const rango = maximo - minimo;
  let tono;
  if (maximo === r) tono = 60 * (((g - b) / rango) % 6);
  else if (maximo === g) tono = 60 * ((b - r) / rango + 2);
  else tono = 60 * ((r - g) / rango + 4);
  if (tono < 0) tono += 360;

  if (tono <= ROJO_BAJO || tono >= ROJO_ALTO) return 1;
  if (tono >= VERDE_DESDE && tono <= VERDE_HASTA) return 2;
  return 0;
}

/**
 * Cuántos píxeles de cada color hay en un recorte.
 *
 * Es la cuenta rápida, la que se hace mil ochocientas veces durante un
 * análisis. Para saber si son una mancha o cuatro píxeles sueltos está
 * medirMancha(), que cuesta más y sólo se usa al calibrar.
 */
export function contarColores(imagen) {
  const pixeles = imagen.data;
  let rojo = 0;
  let verde = 0;

  for (let i = 0; i < pixeles.length; i += 4) {
    const cual = colorDelPixel(pixeles[i], pixeles[i + 1], pixeles[i + 2]);
    if (cual === 1) rojo++;
    else if (cual === 2) verde++;
  }

  return { rojo, verde, total: pixeles.length / 4 };
}

/**
 * La mancha contigua más grande de un color, y dónde está.
 *
 * Sirve para distinguir una lámpara de un puñado de píxeles desperdigados por
 * el recuadro, que es la diferencia entre un calibrado que va a funcionar y
 * uno que no.
 *
 * @param {ImageData} imagen
 * @param {1|2} cual 1 rojo, 2 verde
 */
export function medirMancha(imagen, cual) {
  const { width: ancho, height: alto, data: pixeles } = imagen;
  const mascara = new Uint8Array(ancho * alto);

  let deEseColor = 0;
  for (let i = 0, p = 0; i < pixeles.length; i += 4, p++) {
    if (colorDelPixel(pixeles[i], pixeles[i + 1], pixeles[i + 2]) === cual) {
      mascara[p] = 1;
      deEseColor++;
    }
  }

  let mayor = 0;
  let caja = null;
  const pila = [];

  for (let inicio = 0; inicio < mascara.length; inicio++) {
    if (mascara[inicio] !== 1) continue;

    let tamano = 0;
    let x1 = ancho; let x2 = -1; let y1 = alto; let y2 = -1;

    mascara[inicio] = 2;
    pila.push(inicio);

    while (pila.length > 0) {
      const p = pila.pop();
      const x = p % ancho;
      const y = (p - x) / ancho;
      tamano++;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;

      // Los ocho vecinos: una lámpara con el halo desigual sigue siendo una.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const vx = x + dx;
          const vy = y + dy;
          if (vx < 0 || vy < 0 || vx >= ancho || vy >= alto) continue;
          const vecino = vy * ancho + vx;
          if (mascara[vecino] === 1) {
            mascara[vecino] = 2;
            pila.push(vecino);
          }
        }
      }
    }

    if (tamano > mayor) {
      mayor = tamano;
      caja = { x: x1, y: y1, ancho: x2 - x1 + 1, alto: y2 - y1 + 1 };
    }
  }

  return { pixeles: deEseColor, mancha: mayor, caja };
}

// --- Encontrar los tocados en una sucesión de muestras -----------------

// Cuántas muestras seguidas tiene que aguantar encendida para creérselo. A
// diez muestras por segundo son tres décimas: descarta destellos y a alguien
// pasando por delante, sin perder un tocado de verdad.
const MUESTRAS_PARA_CONFIRMAR = 3;

// Los LED parpadean y pueden salir apagados en un fotograma suelto, así que
// no se mira la muestra de ahora sino las últimas tres: la lámpara está
// encendida si lo están DOS de las TRES.
//
// La primera versión miraba el máximo de la ventana, y eso se comía la
// persistencia: un destello de un fotograma se quedaba tres muestras dentro
// de la ventana y salía confirmado como tocado. Exigir mayoría sirve para las
// dos cosas a la vez —aguanta un fotograma perdido, descarta un destello—,
// que es lo que hace falta.
const VENTANA = 3;
const ENCENDIDAS_EN_LA_VENTANA = 2;

// Si las dos lámparas se encienden con menos de esto de diferencia, es doble.
const SEGUNDOS_PARA_DOBLE = 0.5;

/**
 * La máquina de estados que convierte muestras en tocados.
 *
 * Lo que importa es el flanco de subida: el paso de apagado a encendido. Que
 * la lámpara siga encendida después es irrelevante —en espada se quedan
 * puestas hasta que el árbitro rearma—, y el instante bueno es el de la
 * primera muestra que la vio, no el de la que lo confirmó.
 *
 * @param {{rojo:number, verde:number}} umbrales píxeles para dar por encendida
 */
export function crearDetector(umbrales) {
  const estado = {
    rojo: nuevoCanal(umbrales.rojo),
    verde: nuevoCanal(umbrales.verde),
  };
  // Un encendido a la espera de saber si el otro color le acompaña.
  let pendiente = null;

  function nuevoCanal(umbral) {
    return { umbral, ultimas: [], encendida: false, seguidas: 0, desde: null };
  }

  /**
   * Si la lámpara está encendida ahora, mirando las últimas muestras. Y desde
   * cuándo: el instante de la primera que la vio, no el de la que lo acabó de
   * confirmar.
   */
  function comoEsta(canal) {
    const encendidas = canal.ultimas.filter((m) => m.valor >= canal.umbral);

    // Mientras la ventana se llena se exigen todas: al principio del vídeo no
    // hay con qué comparar y más vale quedarse corto.
    const necesarias = canal.ultimas.length >= VENTANA
      ? ENCENDIDAS_EN_LA_VENTANA
      : canal.ultimas.length;

    return {
      encendida: encendidas.length >= necesarias && encendidas.length > 0,
      desde: encendidas.length > 0 ? encendidas[0].segundos : null,
    };
  }

  /** Devuelve los tocados que hayan quedado cerrados con esta muestra. */
  function muestra(segundos, cuentas) {
    const sueltos = [];

    for (const color of ['rojo', 'verde']) {
      const canal = estado[color];

      canal.ultimas.push({ segundos, valor: cuentas[color] });
      if (canal.ultimas.length > VENTANA) canal.ultimas.shift();
      const ahora = comoEsta(canal);

      if (ahora.encendida) {
        if (!canal.encendida) {
          if (canal.seguidas === 0) canal.desde = ahora.desde;
          canal.seguidas++;
          if (canal.seguidas >= MUESTRAS_PARA_CONFIRMAR) {
            canal.encendida = true;
            sueltos.push({ instante: canal.desde, color });
            canal.seguidas = 0;
          }
        }
      } else {
        canal.encendida = false;
        canal.seguidas = 0;
        canal.desde = null;
      }
    }

    return sueltos.flatMap((tocado) => emparejar(tocado));
  }

  /** Junta en un doble los dos colores que se encienden casi a la vez. */
  function emparejar(tocado) {
    if (pendiente && pendiente.color !== tocado.color
        && Math.abs(tocado.instante - pendiente.instante) <= SEGUNDOS_PARA_DOBLE) {
      const doble = { instante: Math.min(pendiente.instante, tocado.instante), color: 'doble' };
      pendiente = null;
      return [doble];
    }

    // El que estuviera esperando ya no va a emparejarse con éste: sale tal
    // cual y le cede el sitio.
    const soltar = pendiente ? [pendiente] : [];
    pendiente = tocado;
    return soltar;
  }

  /** Al acabar el vídeo, lo que quedara esperando pareja ya no la tiene. */
  function terminar() {
    const ultimo = pendiente ? [pendiente] : [];
    pendiente = null;
    return ultimo;
  }

  /** Los que ya no pueden emparejarse porque ha pasado el medio segundo. */
  function vencidos(segundos) {
    if (pendiente && segundos - pendiente.instante > SEGUNDOS_PARA_DOBLE) {
      const suelto = pendiente;
      pendiente = null;
      return [suelto];
    }
    return [];
  }

  return { muestra, vencidos, terminar };
}

/**
 * De quién es el tocado, sabiendo de qué color eres tú.
 * @returns {'favor'|'contra'|'doble'}
 */
export function resultadoDelTocado(color, miColor) {
  if (color === 'doble') return 'doble';
  return color === miColor ? 'favor' : 'contra';
}
