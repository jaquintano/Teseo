// Recorrer un vídeo buscando los tocados.
//
// Cómo se muestrea, y por qué así
// -------------------------------
// Reproduciendo, no saltando. Forzar al decodificador a ir de un `currentTime`
// a otro es lentísimo en un móvil: cada salto lo obliga a volver al fotograma
// clave anterior y decodificar desde ahí. Reproduciendo, los fotogramas salen
// solos y en orden.
//
// A DOBLE VELOCIDAD, que si no un asalto de tres minutos tarda tres minutos.
// Con `requestVideoFrameCallback` llegan todos los fotogramas decodificados y
// nos quedamos con uno cada décima de segundo DE VÍDEO, así que a 2× siguen
// sobrando muestras.
//
// Y con la pantalla encendida a la fuerza (Wake Lock). Esto no es un adorno:
// si la página deja de pintarse, el navegador no llama a
// `requestVideoFrameCallback` y el análisis se queda congelado, no lento. Por
// si acaso el bloqueo falla o el usuario se va a otra aplicación, se vigila
// `visibilitychange` y se pausa avisando, en vez de fingir que sigue.
//
// El recuadro no está quieto
// --------------------------
// En cada muestra se busca primero dónde está el marcador (js/seguimiento.js)
// y luego se miran las lámparas ahí. Cuando no se encuentra —el tirador
// delante, un movimiento brusco— NO se mira nada: contar píxeles de donde ya
// no está el marcador es inventarse tocados. Se abre un hueco, y al cerrarse
// se compara: si una lámpara estaba apagada antes del hueco y está encendida
// después, el tocado ocurrió mientras no se veía, y se propone con el
// instante en que se recuperó el marcador y marcado como aproximado.

import {
  recortar, contarEnZona, conHolgura, crearDetector, resultadoDelTocado,
} from './deteccion.js';
import { escenaDe, plantillaDesde, crearSeguidor } from './seguimiento.js';
import { ajuste } from './ajustes.js';

const NUMERO = { rojo: 1, verde: 2 };

/**
 * Cuántos píxeles encendidos hay en cada lámpara.
 *
 * No se cuenta el recuadro entero sino la zona de cada lámpara, que es lo que
 * deja fuera al cronómetro y al tanteo. Una lámpara sin localizar cuenta cero:
 * nunca se enciende, que es la verdad —no sabemos dónde mirar—.
 */
function cuentasPorLampara(imagen, lamparas) {
  const cuentas = { rojo: 0, verde: 0 };
  for (const color of ['rojo', 'verde']) {
    const lampara = lamparas[color];
    if (lampara) cuentas[color] = contarEnZona(imagen, zonaDeLaLampara(lampara), NUMERO[color]);
  }
  return cuentas;
}

/**
 * Dónde se mira cada lámpara.
 *
 * El calibrado guarda dos cosas: la mancha tal y como se midió (`zonaMedida`)
 * y esa mancha ya ensanchada (`zona`). Se rehace el ensanchado aquí, en vez de
 * usar el guardado, para que los calibrados de antes se aprovechen del margen
 * de ahora —mucho más estrecho— sin tener que repetirlos: era ese margen el
 * que metía los dígitos del tanteo dentro de la zona de la lámpara roja.
 */
function zonaDeLaLampara(lampara) {
  return lampara.zonaMedida ? conHolgura(lampara.zonaMedida) : lampara.zona;
}

// De la mancha que se midió al calibrar, qué parte hay que ver encendida para
// dar la lámpara por encendida.
//
// Era 0,4 y ahora es 0,25, por lo mismo que se relajó el color: la criba la
// hace el tiempo. Y le duele más al verde, que llega con menos píxeles.
const PARTE_PARA_ENCENDER = 0.25;
const PISO_DE_UMBRAL = 8;

/**
 * El umbral de cada lámpara, o inalcanzable si no está localizada.
 *
 * Se rehace desde la mancha medida en vez de usar el umbral guardado, por lo
 * mismo que la zona: así los calibrados de antes se aprovechan del umbral de
 * ahora sin repetirlos.
 */
function umbralesDe(lamparas) {
  const deUna = (lampara) => {
    if (!lampara) return Infinity;
    if (!lampara.pixeles) return lampara.umbral;
    return Math.max(PISO_DE_UMBRAL, Math.round(lampara.pixeles * PARTE_PARA_ENCENDER));
  };
  return { rojo: deUna(lamparas.rojo), verde: deUna(lamparas.verde) };
}

// Cada cuánto se mira, en segundos de vídeo.
//
// No es un número redondo a propósito. Lo que hay que distinguir es una luz
// fija de un dígito que parpadea cada dos décimas, y si se mirara justo cada
// 0,1 o cada 0,2 se podría caer siempre en la misma fase del parpadeo y verlo
// encendido SIEMPRE: el error clásico de muestrear al compás de lo que se
// mide. Con 0,08 las muestras van cayendo en cinco puntos distintos de cada
// parpadeo, y lo que se ve es su verdadera proporción de luz.
const SEGUNDOS_ENTRE_MUESTRAS = 0.08;

// Por debajo de este parecido no se mide, aunque se siga siguiendo.
//
// Seguir y medir no se juegan lo mismo. Para seguir vale un parecido regular:
// se sabe por dónde anda el marcador y con eso basta para no perderlo. Para
// contar píxeles hace falta saber dónde está la lámpara con precisión de dos
// o tres píxeles, y con el marcador medio tapado o de refilón un 0,6 quiere
// decir "creo que está por aquí". Contar ahí es inventarse tocados; más vale
// un hueco honesto.
const PARECIDO_PARA_MEDIR = 0.7;

// Más arriba el decodificador del móvil empieza a saltarse fotogramas, y los
// que se salta son justo los que interesan.
const VELOCIDAD = 2;

// Un tocado que salga en este rato después de recuperar el marcador viene de
// un hueco: la lámpara pudo encenderse en cualquier momento mientras el
// marcador no se veía, así que el instante es orientativo.
const SEGUNDOS_DE_CORTESIA = 0.6;

/**
 * Analiza un vídeo entero y va avisando de lo que encuentra.
 *
 * @param {object} opciones
 * @param {HTMLVideoElement} opciones.video ya cargado y visible
 * @param {object} opciones.calibrado el guardado en el tiempo
 * @param {(parte:number) => void} opciones.alProgresar de 0 a 1
 * @param {(tocado:object) => void} opciones.alDetectar {instante, resultado, aproximado}
 * @param {(pausado:boolean) => void} [opciones.alPausar] la página se ocultó
 * @param {(donde:object) => void} [opciones.alSeguir] {estado, recuadro, parecido}
 * @returns {{terminado: Promise<string>, cancelar: () => void, resumen: () => object}}
 *          termina en 'completo' o en 'cancelado'
 */
export function analizar({ video, calibrado, alProgresar, alDetectar, alPausar, alSeguir }) {
  const lienzo = document.createElement('canvas');
  const lienzoEscena = document.createElement('canvas');
  const detector = crearDetector(umbralesDe(calibrado.lamparas), ajuste('segundosDeLampara'));

  let cancelado = false;
  let ultimaMuestra = -Infinity;
  let bloqueo = null;
  let terminar;
  let seguidor = null;
  let recuadroAhora = calibrado.recuadro;
  let recuperadoEn = -Infinity;
  // Si la última muestra no se pudo medir, para saber cuándo se vuelve.
  let sinMedir = false;

  // Lo que se le cuenta al usuario al final: sin esto, un análisis con el
  // marcador tapado media hora parece un asalto sin tocados.
  const cuenta = { seguido: 0, perdido: 0, huecos: 0, aproximados: 0, seguimiento: false };

  const terminado = new Promise((resolver) => { terminar = resolver; });

  function avisar(tocados) {
    for (const tocado of tocados) {
      // Sólo lo que sale JUSTO DESPUÉS de recuperar el marcador. Un tocado
      // anterior al hueco, soltado tarde porque se quedó esperando pareja, no
      // es aproximado: su instante se vio.
      const desdeElHueco = tocado.instante - recuperadoEn;
      const aproximado = desdeElHueco >= 0 && desdeElHueco <= SEGUNDOS_DE_CORTESIA;
      if (aproximado) cuenta.aproximados++;
      alDetectar({
        instante: tocado.instante,
        resultado: resultadoDelTocado(tocado.color, calibrado.miColor),
        aproximado,
      });
    }
  }

  function muestrear(ahora, datos) {
    if (cancelado) return;

    const segundos = datos ? datos.mediaTime : video.currentTime;

    if (segundos - ultimaMuestra >= SEGUNDOS_ENTRE_MUESTRAS) {
      const transcurrido = ultimaMuestra === -Infinity
        ? 0
        : Math.max(0, Math.min(1, segundos - ultimaMuestra));
      ultimaMuestra = segundos;
      mirar(segundos, transcurrido);
      if (video.duration) alProgresar(Math.min(1, segundos / video.duration));
    }

    seguir();
  }

  /** Una muestra: dónde está el marcador y qué se ve en él. */
  function mirar(segundos, transcurrido) {
    const donde = seguidor
      ? seguidor.situar(escenaDe(video, lienzoEscena))
      : { estado: 'imposible', recuadro: calibrado.recuadro, parecido: 0, reencontrado: false };

    recuadroAhora = donde.recuadro;
    if (alSeguir) alSeguir(donde);

    // Se venía de un hueco —perdido o dudoso— y ahora se vuelve a medir.
    const volviendo = sinMedir;
    sinMedir = false;

    // La plantilla podía no valer para este vídeo. Se sabe al primer intento,
    // y más vale contarlo al final que presumir de un seguimiento que no hubo.
    if (donde.estado === 'imposible') cuenta.seguimiento = false;

    // Seguir con dudas es seguir; medir con dudas es inventar. Un tramo así
    // cuenta como hueco: si la lámpara se enciende ahí, se dirá al recuperarlo.
    const dudoso = donde.estado === 'seguido' && donde.parecido < PARECIDO_PARA_MEDIR;

    if (donde.estado === 'perdido' || dudoso) {
      cuenta.perdido += transcurrido;
      // Lo que veníamos viendo ya no vale, pero lo que sabíamos de cada
      // lámpara sí: en espada se quedan encendidas hasta que el árbitro
      // rearma, y esa memoria es la que dirá luego si hubo tocado en el hueco.
      detector.perder();
      // El emparejamiento de dobles sí sigue corriendo: media hora tapado no
      // debe dejar un tocado suelto esperando pareja para siempre.
      avisar(detector.vencidos(segundos));
      sinMedir = true;
      return;
    }

    cuenta.seguido += transcurrido;
    if (donde.reencontrado || volviendo) {
      cuenta.huecos++;
      recuperadoEn = segundos;
    }

    const imagen = recortar(video, recuadroAhora, lienzo);
    if (!imagen) return;

    avisar(detector.muestra(segundos, cuentasPorLampara(imagen, calibrado.lamparas)));
    avisar(detector.vencidos(segundos));
  }

  function seguir() {
    if (cancelado || video.ended) return;
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(muestrear);
    else requestAnimationFrame(() => muestrear());
  }

  async function pedirPantallaEncendida() {
    try {
      if (navigator.wakeLock) bloqueo = await navigator.wakeLock.request('screen');
    } catch {
      // Que no se pueda no es motivo para no analizar: el aviso al usuario ya
      // le dice que no apague la pantalla.
    }
  }

  function soltarPantalla() {
    if (bloqueo) { bloqueo.release().catch(() => {}); bloqueo = null; }
  }

  function alCambiarVisibilidad() {
    if (cancelado) return;

    if (document.hidden) {
      video.pause();
      if (alPausar) alPausar(true);
    } else {
      pedirPantallaEncendida();
      if (alPausar) alPausar(false);
      arrancar();
    }
  }

  function recoger(comoAcaba) {
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    video.removeEventListener('ended', alAcabar);
    soltarPantalla();
    video.pause();
    terminar(comoAcaba);
  }

  function alAcabar() {
    avisar(detector.terminar());
    alProgresar(1);
    recoger('completo');
  }

  // --- Arranque ---
  video.muted = true;
  video.playbackRate = VELOCIDAD;
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  video.addEventListener('ended', alAcabar);

  prepararYArrancar();

  /**
   * Antes de reproducir hay que tener la plantilla del seguimiento.
   *
   * Los calibrados hechos antes de que existiera el seguimiento no la traen.
   * En vez de obligar a repetirlos, se reconstruye aquí volviendo al instante
   * en que se tomó la referencia, que es el fotograma exacto que el usuario
   * eligió para enmarcar.
   */
  async function prepararYArrancar() {
    await esperarMetadatos(video);
    if (cancelado) return;

    let plantilla = calibrado.plantilla || null;
    if (!plantilla && calibrado.referencia) {
      await irYEsperar(video, calibrado.referencia.instante || 0);
      if (cancelado) return;
      const escena = escenaDe(video, lienzoEscena);
      if (escena) plantilla = plantillaDesde(escena, calibrado.recuadro);
    }

    if (plantilla) {
      const candidato = crearSeguidor(plantilla, calibrado.recuadro);
      if (candidato.posible) { seguidor = candidato; cuenta.seguimiento = true; }
    }

    await irYEsperar(video, 0);
    if (cancelado) return;

    pedirPantallaEncendida();
    arrancar();
  }

  /**
   * Empieza a reproducir, o espera si no se puede todavía.
   *
   * Con la página oculta, el navegador para el vídeo mudo "para ahorrar
   * energía" y rechaza play(). Eso no es un fallo del análisis: es que el
   * usuario se ha ido a otra aplicación o ha apagado la pantalla. Se avisa y
   * se espera, que al volver lo reanuda el manejador de visibilidad.
   */
  function arrancar() {
    video.play().then(seguir).catch((error) => {
      if (document.hidden) {
        if (alPausar) alPausar(true);
        return;
      }
      console.error('No se pudo reproducir para analizar:', error);
      recoger('cancelado');
    });
  }

  return {
    terminado,
    resumen: () => ({ ...cuenta }),
    cancelar() {
      if (cancelado) return;
      cancelado = true;
      recoger('cancelado');
    },
  };
}

/**
 * ¿Hay algo permanentemente rojo o verde dentro del recuadro? ¿Y se puede
 * seguir el marcador por el vídeo?
 *
 * Mira unos cuantos fotogramas repartidos por todo el vídeo y cuenta en
 * cuántos "habría lámpara" dentro de las zonas localizadas. Si sale encendida
 * casi siempre, lo que se localizó en el calibrado no era una lámpara sino un
 * dígito. Son un par de segundos que ahorran dos minutos perdidos.
 *
 * De paso se prueba el seguimiento: en cada fotograma se busca el marcador en
 * todo el encuadre, que es el caso difícil —entre uno y otro han pasado
 * segundos y la cámara está en otro sitio—. Si no aparece casi nunca, el
 * análisis no va a funcionar y más vale saberlo ahora.
 *
 * Aquí sí se salta de un sitio a otro, que son veinte fotogramas y no mil
 * ochocientos.
 */
export async function buscarFalsosPositivos({ video, calibrado, cuantos = 20 }) {
  const lienzo = document.createElement('canvas');
  const lienzoEscena = document.createElement('canvas');
  const duracion = video.duration;
  if (!isFinite(duracion) || duracion <= 0) {
    return { mirados: 0, encendidos: 0, perdidos: 0, seguimiento: false };
  }

  const seguidor = calibrado.plantilla
    ? crearSeguidor(calibrado.plantilla, calibrado.recuadro)
    : null;

  const guardado = video.currentTime;
  let encendidos = 0;
  let perdidos = 0;
  let mirados = 0;

  for (let i = 0; i < cuantos; i++) {
    const momento = (duracion * (i + 0.5)) / cuantos;
    // eslint-disable-next-line no-await-in-loop
    const llego = await irYEsperar(video, momento);
    if (!llego) continue;

    const donde = seguidor
      ? seguidor.situar(escenaDe(video, lienzoEscena))
      : { estado: 'imposible', recuadro: calibrado.recuadro };

    mirados++;
    if (donde.estado === 'perdido') { perdidos++; continue; }

    const imagen = recortar(video, donde.recuadro, lienzo);
    if (!imagen) continue;

    const cuentas = cuentasPorLampara(imagen, calibrado.lamparas);
    const umbral = umbralesDe(calibrado.lamparas);
    if (cuentas.rojo >= umbral.rojo || cuentas.verde >= umbral.verde) encendidos++;
  }

  await irYEsperar(video, guardado);
  return {
    mirados, encendidos, perdidos, seguimiento: Boolean(seguidor && seguidor.posible),
  };
}

/** Espera a que el vídeo sepa cuánto mide y de qué tamaño es. */
function esperarMetadatos(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolver) => {
    const listo = () => { video.removeEventListener('loadedmetadata', listo); resolver(); };
    video.addEventListener('loadedmetadata', listo);
    setTimeout(listo, 5000);
  });
}

/** Lleva el vídeo a un instante y espera a que llegue de verdad. */
function irYEsperar(video, segundos) {
  // Si ya está ahí no hay salto, y por tanto tampoco habrá `seeked`: sin esto
  // se esperaría el segundo y medio del plazo de seguridad para nada.
  if (Math.abs(video.currentTime - segundos) < 0.01) return Promise.resolve(true);

  return new Promise((resolver) => {
    let hecho = false;
    const listo = () => {
      if (hecho) return;
      hecho = true;
      video.removeEventListener('seeked', listo);
      resolver(true);
    };
    video.addEventListener('seeked', listo);
    video.currentTime = segundos;
    // Si el navegador no contesta, seguimos: mejor un fotograma menos que
    // dejar el calibrado colgado.
    setTimeout(() => { if (!hecho) { hecho = true; resolver(false); } }, 1500);
  });
}
