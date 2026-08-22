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

import { recortar, contarEnZona, crearDetector, resultadoDelTocado } from './deteccion.js';

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
    if (lampara) cuentas[color] = contarEnZona(imagen, lampara.zona, NUMERO[color]);
  }
  return cuentas;
}

/** El umbral de cada lámpara, o inalcanzable si no está localizada. */
function umbralesDe(lamparas) {
  return {
    rojo: lamparas.rojo ? lamparas.rojo.umbral : Infinity,
    verde: lamparas.verde ? lamparas.verde.umbral : Infinity,
  };
}

// A 10 muestras por segundo de vídeo, una lámpara encendida cae en varias
// aunque el árbitro rearme rápido.
const SEGUNDOS_ENTRE_MUESTRAS = 0.1;

// Más arriba el decodificador del móvil empieza a saltarse fotogramas, y los
// que se salta son justo los que interesan.
const VELOCIDAD = 2;

/**
 * Analiza un vídeo entero y va avisando de lo que encuentra.
 *
 * @param {object} opciones
 * @param {HTMLVideoElement} opciones.video ya cargado y visible
 * @param {object} opciones.calibrado el guardado en el tiempo
 * @param {(parte:number) => void} opciones.alProgresar de 0 a 1
 * @param {(tocado:object) => void} opciones.alDetectar {instante, resultado}
 * @param {(pausado:boolean) => void} [opciones.alPausar] la página se ocultó
 * @returns {{terminado: Promise<string>, cancelar: () => void}}
 *          termina en 'completo' o en 'cancelado'
 */
export function analizar({ video, calibrado, alProgresar, alDetectar, alPausar }) {
  const lienzo = document.createElement('canvas');
  const detector = crearDetector(umbralesDe(calibrado.lamparas));

  let cancelado = false;
  let ultimaMuestra = -Infinity;
  let bloqueo = null;
  let terminar;

  const terminado = new Promise((resolver) => { terminar = resolver; });

  function avisar(tocados) {
    for (const tocado of tocados) {
      alDetectar({
        instante: tocado.instante,
        resultado: resultadoDelTocado(tocado.color, calibrado.miColor),
      });
    }
  }

  function muestrear(ahora, datos) {
    if (cancelado) return;

    const segundos = datos ? datos.mediaTime : video.currentTime;

    if (segundos - ultimaMuestra >= SEGUNDOS_ENTRE_MUESTRAS) {
      ultimaMuestra = segundos;
      const imagen = recortar(video, calibrado.recuadro, lienzo);
      if (imagen) {
        avisar(detector.muestra(segundos, cuentasPorLampara(imagen, calibrado.lamparas)));
        avisar(detector.vencidos(segundos));
      }
      if (video.duration) alProgresar(Math.min(1, segundos / video.duration));
    }

    seguir();
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
  video.currentTime = 0;
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  video.addEventListener('ended', alAcabar);

  pedirPantallaEncendida();
  arrancar();

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
    cancelar() {
      if (cancelado) return;
      cancelado = true;
      recoger('cancelado');
    },
  };
}

/**
 * ¿Hay algo permanentemente rojo o verde dentro del recuadro?
 *
 * Mira unos cuantos fotogramas repartidos por todo el vídeo y cuenta en
 * cuántos "habría lámpara" dentro de las zonas localizadas. Si sale encendida
 * casi siempre, lo que se localizó en el calibrado no era una lámpara sino un
 * dígito. Son un par de segundos que ahorran dos minutos perdidos.
 *
 * Aquí sí se salta de un sitio a otro, que son veinte fotogramas y no mil
 * ochocientos.
 */
export async function buscarFalsosPositivos({ video, calibrado, cuantos = 20 }) {
  const lienzo = document.createElement('canvas');
  const duracion = video.duration;
  if (!isFinite(duracion) || duracion <= 0) return { mirados: 0, encendidos: 0 };

  const guardado = video.currentTime;
  let encendidos = 0;
  let mirados = 0;

  for (let i = 0; i < cuantos; i++) {
    const momento = (duracion * (i + 0.5)) / cuantos;
    // eslint-disable-next-line no-await-in-loop
    const llego = await irYEsperar(video, momento);
    if (!llego) continue;

    const imagen = recortar(video, calibrado.recuadro, lienzo);
    if (!imagen) continue;

    mirados++;
    const cuentas = cuentasPorLampara(imagen, calibrado.lamparas);
    const umbral = umbralesDe(calibrado.lamparas);
    if (cuentas.rojo >= umbral.rojo || cuentas.verde >= umbral.verde) encendidos++;
  }

  await irYEsperar(video, guardado);
  return { mirados, encendidos };
}

/** Lleva el vídeo a un instante y espera a que llegue de verdad. */
function irYEsperar(video, segundos) {
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
