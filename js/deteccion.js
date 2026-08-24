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

  const mayor = manchaMasGrande(mascara, ancho, alto);
  return { pixeles: deEseColor, mancha: mayor.tamano, caja: mayor.caja };
}

/**
 * La mancha contigua más grande de una máscara de unos y ceros.
 *
 * Ocho vecinos: una lámpara con el halo desigual sigue siendo una.
 */
function manchaMasGrande(mascara, ancho, alto) {

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

  return { tamano: mayor, caja };
}

// --- Localizar las lámparas comparando con el marcador apagado ---------
//
// Un marcador de competición no es una caja negra con dos bombillas: lleva el
// cronómetro en ámbar y el tanteo en rojo de siete segmentos, y esos dígitos
// están encendidos todo el rato y además cambian. Enmarcarlo entero y contar
// píxeles rojos sería contar el tanteo.
//
// La salida es comparar dos capturas del MISMO recuadro: una con las lámparas
// apagadas y otra con una encendida. Lo que aparece entre las dos es la
// lámpara, y sólo la lámpara: los dígitos están en las dos y se van solos en
// la resta. Con eso se sabe DÓNDE está cada lámpara dentro del recuadro, y
// durante el análisis se mira ahí y no en el resto.

/** Copia utilizable y guardable de un recorte. */
export function guardarReferencia(imagen) {
  return {
    ancho: imagen.width,
    alto: imagen.height,
    datos: new Uint8ClampedArray(imagen.data),
  };
}

/**
 * Qué ha aparecido de un color respecto a la referencia.
 *
 * Un píxel cuenta si AHORA es de ese color y en la referencia NO lo era. Un
 * dígito rojo encendido en las dos capturas no aparece; una lámpara que antes
 * estaba apagada, sí.
 *
 * @returns {{mancha:number, zona:object|null}} `zona` en 0..1 del recuadro
 */
export function loQueHaAparecido(imagen, referencia, cual) {
  const { width: ancho, height: alto, data: ahora } = imagen;
  if (!referencia || referencia.ancho !== ancho || referencia.alto !== alto) {
    return { mancha: 0, zona: null };
  }

  const antes = referencia.datos;
  const mascara = new Uint8Array(ancho * alto);

  for (let i = 0, p = 0; i < ahora.length; i += 4, p++) {
    const esAhora = colorDelPixel(ahora[i], ahora[i + 1], ahora[i + 2]) === cual;
    if (!esAhora) continue;
    const eraAntes = colorDelPixel(antes[i], antes[i + 1], antes[i + 2]) === cual;
    if (!eraAntes) mascara[p] = 1;
  }

  const mayor = manchaMasGrande(mascara, ancho, alto);
  if (!mayor.caja) return { mancha: 0, zona: null };

  return {
    mancha: mayor.tamano,
    zona: {
      x: mayor.caja.x / ancho,
      y: mayor.caja.y / alto,
      ancho: mayor.caja.ancho / ancho,
      alto: mayor.caja.alto / alto,
    },
  };
}

/**
 * La zona de una lámpara, con un pelo de margen alrededor.
 *
 * El margen era del 60 % por cada lado, y eso hace una zona de 2,2 × 2,2: casi
 * CINCO VECES la lámpara. Se puso cuando el recuadro estaba clavado en un
 * sitio del fotograma y hacía falta aguantar el temblor de la cámara; desde
 * que hay seguimiento, ese margen sólo sirve para que quepan dentro los
 * dígitos del tanteo, que están al lado, son igual de rojos y parpadean.
 *
 * Ahora es un 15 %: lo justo para un par de píxeles de error del seguimiento.
 */
export function conHolgura(zona, cuanto = 0.15) {
  const dx = zona.ancho * cuanto;
  const dy = zona.alto * cuanto;
  const x = Math.max(0, zona.x - dx);
  const y = Math.max(0, zona.y - dy);
  return {
    x,
    y,
    ancho: Math.min(1 - x, zona.ancho + dx * 2),
    alto: Math.min(1 - y, zona.alto + dy * 2),
  };
}

/** Cuántos píxeles de un color hay dentro de una zona del recorte. */
export function contarEnZona(imagen, zona, cual) {
  const { width: ancho, height: alto, data: pixeles } = imagen;
  const x1 = Math.max(0, Math.floor(zona.x * ancho));
  const y1 = Math.max(0, Math.floor(zona.y * alto));
  const x2 = Math.min(ancho, Math.ceil((zona.x + zona.ancho) * ancho));
  const y2 = Math.min(alto, Math.ceil((zona.y + zona.alto) * alto));

  let cuenta = 0;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const i = (y * ancho + x) * 4;
      if (colorDelPixel(pixeles[i], pixeles[i + 1], pixeles[i + 2]) === cual) cuenta++;
    }
  }
  return cuenta;
}

// --- Encontrar los tocados en una sucesión de muestras -----------------

// Lo que separa una lámpara de un dígito: el tiempo que aguanta.
//
// Una lámpara de espada se queda encendida unos DOS SEGUNDOS, hasta que el
// árbitro rearma. El tanteo del marcador, en cambio, son dígitos enormes de
// siete segmentos que PARPADEAN cada dos décimas cuando acaban de cambiar. En
// color y en tamaño se parecen; en el tiempo no se parecen en nada.
//
// Así que se mide eso: de todas las muestras de la última ventana, cuántas
// vieron luz. Una lámpara de verdad da casi el cien por cien; un parpadeo de
// dos décimas da la mitad, por muy fuerte que sea.
//
// Esto sustituye a la regla de "dos de las últimas tres", que era justo lo
// que dejaba pasar el parpadeo: en tres muestras seguidas de una luz que va y
// viene, dos están encendidas casi siempre. Aquella regla se escribió para
// aguantar un fotograma perdido, y eso lo sigue haciendo el 0,8: caben dos
// muestras en blanco de cada diez.
const PARTE_SOLIDA = 0.8;

// Y para que la cuenta valga, la ventana tiene que estar llena: al principio
// del vídeo, o al volver de un hueco, no hay con qué comparar.
const PARTE_DE_VENTANA_MINIMA = 0.9;

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
 * @param {number} ventana segundos que la luz tiene que aguantar para creérsela
 */
export function crearDetector(umbrales, ventana = 0.8) {
  const estado = {
    rojo: nuevoCanal(umbrales.rojo),
    verde: nuevoCanal(umbrales.verde),
  };
  // Un encendido a la espera de saber si el otro color le acompaña.
  let pendiente = null;

  function nuevoCanal(umbral) {
    return { umbral, ultimas: [], encendida: false };
  }

  /**
   * Qué parte de la última ventana vio luz, y desde cuándo.
   *
   * `desde` es la primera muestra encendida que queda en la ventana. Con el
   * 0,8 de arriba, como mucho hay dos apagadas por delante, así que ese
   * instante no se aleja del encendido de verdad más de un par de décimas.
   */
  function comoEsta(canal, segundos) {
    // Fuera lo que ya no cabe en la ventana de tiempo.
    while (canal.ultimas.length > 1 && segundos - canal.ultimas[0].segundos > ventana) {
      canal.ultimas.shift();
    }

    const encendidas = canal.ultimas.filter((m) => m.valor >= canal.umbral);
    const cubierto = segundos - canal.ultimas[0].segundos;

    return {
      llena: cubierto >= ventana * PARTE_DE_VENTANA_MINIMA,
      parte: canal.ultimas.length > 0 ? encendidas.length / canal.ultimas.length : 0,
      desde: encendidas.length > 0 ? encendidas[0].segundos : null,
    };
  }

  /** Devuelve los tocados que hayan quedado cerrados con esta muestra. */
  function muestra(segundos, cuentas) {
    const sueltos = [];

    for (const color of ['rojo', 'verde']) {
      const canal = estado[color];
      canal.ultimas.push({ segundos, valor: cuentas[color] });
      const ahora = comoEsta(canal, segundos);

      if (!canal.encendida && ahora.llena && ahora.parte >= PARTE_SOLIDA) {
        canal.encendida = true;
        sueltos.push({ instante: ahora.desde, color });
        continue;
      }

      // Para darla por apagada se exige lo contrario y con la misma holgura:
      // así, mientras la ventana se vacía de luz vieja, no se enciende y se
      // apaga a cada muestra.
      if (canal.encendida && ahora.parte <= 1 - PARTE_SOLIDA) canal.encendida = false;
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

  /**
   * Se ha perdido el marcador: se tira lo que se estaba viendo.
   *
   * La ventana de las últimas muestras se vacía, porque mezclar lo de antes
   * del hueco con lo de después es comparar dos sitios distintos del vídeo. Y
   * el conteo de muestras seguidas también, que un encendido a medio
   * confirmar cuando el marcador desaparece no se confirma.
   *
   * Lo que NO se toca es `encendida`, y es lo importante: en espada la
   * lámpara se queda puesta hasta que el árbitro rearma, así que saber si
   * estaba encendida ANTES del hueco es lo único que permite distinguir
   * después "sigue el mismo tocado" de "ha habido otro mientras no se veía".
   */
  function perder() {
    for (const color of ['rojo', 'verde']) {
      estado[color].ultimas = [];
    }
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

  return { muestra, vencidos, perder, terminar };
}

/**
 * De quién es el tocado, sabiendo de qué color eres tú.
 * @returns {'favor'|'contra'|'doble'}
 */
export function resultadoDelTocado(color, miColor) {
  if (color === 'doble') return 'doble';
  return color === miColor ? 'favor' : 'contra';
}
