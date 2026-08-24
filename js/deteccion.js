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
//
// Y son generosos a propósito, sobre todo desde que la criba de verdad la hace
// el tiempo —hay que aguantar encendida ocho décimas— y la zona donde se mira
// es estrecha. Ser tacaño aquí no quita falsos positivos; sólo pierde luz.
//
// A quien más le duele ser tacaño es al VERDE. Un LED potente satura el sensor
// y el centro sale blanco, sin tinte que medir, y con el verde pasa antes que
// con el rojo: el verde pesa un 59 % del brillo de un píxel frente al 30 % del
// rojo, así que revienta el canal mucho antes. De un tocado verde queda un
// aro de color y un agujero blanco en medio; del rojo, casi toda la mancha.
// Por eso el verde se detectaba peor, y no porque el código lo mirara menos.
const SATURACION_MINIMA = 0.25;
const BRILLO_MINIMO = 0.35;

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
const ANCHO_DE_ANALISIS = 160;

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

// Y lo que se le pide al segundo color de un doble, que ya va acompañado.
const PARTE_DE_ACOMPANANTE = 0.5;

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

    // Las dos muestras se apuntan antes de decidir nada: la decisión de un
    // color mira el estado del otro, y con media vuelta dada el otro todavía
    // no tendría la muestra de este instante.
    for (const color of ['rojo', 'verde']) {
      estado[color].ultimas.push({ segundos, valor: cuentas[color] });
    }

    for (const color of ['rojo', 'verde']) {
      const canal = estado[color];
      const ahora = comoEsta(canal, segundos);

      if (!canal.encendida && ahora.llena && ahora.parte >= PARTE_SOLIDA) {
        canal.encendida = true;
        sueltos.push({ instante: ahora.desde, color });
        mirarAlOtro(color, ahora.desde, sueltos);
        continue;
      }

      // Para darla por apagada se exige lo contrario y con la misma holgura:
      // así, mientras la ventana se vacía de luz vieja, no se enciende y se
      // apaga a cada muestra.
      if (canal.encendida && ahora.parte <= 1 - PARTE_SOLIDA) canal.encendida = false;
    }

    return sueltos.flatMap((tocado) => emparejar(tocado));
  }

  /**
   * Acaba de confirmarse un color: ¿le acompaña el otro?
   *
   * Al segundo se le pide menos, y con motivo. Cuando una lámpara ya ha pasado
   * el filtro del tiempo sabemos que ahí hubo un tocado de verdad, así que la
   * pregunta que queda no es "¿ha pasado algo?" sino "¿se encendieron las
   * dos?", y para eso basta con ver luz en la mitad de la ventana.
   *
   * Sin esto, un doble con la lámpara verde justa —y la verde se ve peor que
   * la roja, por lo que se explica arriba— se apuntaba como tocado en contra:
   * el peor error posible, porque suma un punto al rival y te quita uno a ti.
   */
  function mirarAlOtro(color, desde, sueltos) {
    const cual = color === 'rojo' ? 'verde' : 'rojo';
    const otro = estado[cual];
    if (otro.encendida) return;

    // Se mira sólo DESDE QUE EMPEZÓ el tocado, no la ventana entera. La
    // ventana del otro color todavía arrastra muestras de antes del tocado,
    // todas apagadas, y ésas diluyen la cuenta hasta hundirla: la pregunta no
    // es "¿ha habido luz verde en el último segundo?" sino "¿ha habido luz
    // verde desde que se encendió la roja?".
    const desdeElTocado = otro.ultimas.filter((m) => m.segundos >= desde);
    if (desdeElTocado.length === 0) return;

    const encendidas = desdeElTocado.filter((m) => m.valor >= otro.umbral);
    if (encendidas.length / desdeElTocado.length < PARTE_DE_ACOMPANANTE) return;

    otro.encendida = true;
    sueltos.push({ instante: encendidas[0].segundos, color: cual });
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
