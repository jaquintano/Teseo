// Punto de entrada de Teseo.
//
// En la fase 1 sólo arranca el reproductor y la prueba de almacenamiento.
// Más adelante, este fichero se encargará también de la navegación entre
// pantallas (perfil, rivales, asaltos, etiquetado, estadísticas).

import { registrar, capturarErroresGlobales } from './registro.js';
import { iniciarVideo } from './video.js';
import { iniciarPruebaAlmacenamiento } from './prueba-almacenamiento.js';

capturarErroresGlobales();

registrar(`Teseo iniciado. Navegador: ${navigator.userAgent}`);
registrar(`Pantalla: ${window.innerWidth} × ${window.innerHeight} px, ` +
          `densidad ${window.devicePixelRatio}.`);

iniciarVideo();
iniciarPruebaAlmacenamiento();

// Botón para copiar el registro y podérmelo pegar en el chat.
document.getElementById('btn-copiar-registro').addEventListener('click', async () => {
  const texto = document.getElementById('registro').textContent;
  try {
    await navigator.clipboard.writeText(texto);
    registrar('Registro copiado al portapapeles.');
  } catch {
    // Safari a veces bloquea el portapapeles. Plan B: seleccionarlo para
    // que el usuario copie a mano.
    const seleccion = window.getSelection();
    const rango = document.createRange();
    rango.selectNodeContents(document.getElementById('registro'));
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    registrar('No he podido copiar solo. El texto queda seleccionado: cópialo a mano.', 'error');
  }
});
