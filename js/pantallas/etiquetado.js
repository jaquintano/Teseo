// Pantalla de etiquetado.
//
// FASE 3: por ahora sólo reproduce el vídeo del tiempo elegido, para
// comprobar que la copia guardada se recupera bien y que los controles
// funcionan. Las tres capas de botones y la línea de tiempo con las marcas
// llegan en la fase 4.

import { crear, cabecera, ir, formatearBytes, formatearSegundos } from '../ui.js';
import { ALMACENES, obtener, leerVideo, listarPor } from '../db.js';
import { crearReproductor } from '../video.js';

// El reproductor de la pantalla anterior, para soltarlo al cambiar.
let reproductorActivo = null;

export function soltarReproductor() {
  if (reproductorActivo) {
    reproductorActivo.destruir();
    reproductorActivo = null;
  }
}

export async function pantallaEtiquetado(contenedor, datos = {}) {
  soltarReproductor();

  const tiempo = await obtener(ALMACENES.tiempos, datos.tiempoId);
  if (!tiempo) { ir('inicio'); return; }

  const asalto = await obtener(ALMACENES.asaltos, tiempo.asaltoId);
  const rival = asalto ? await obtener(ALMACENES.tiradores, asalto.rivalId) : null;
  const intercambios = await listarPor(ALMACENES.intercambios, 'por-tiempo', tiempo.id);

  const estado = crear('p', { class: 'ayuda', texto: 'Recuperando el vídeo…' });

  contenedor.append(
    cabecera(`${rival ? rival.nombre : 'Asalto'} · Tiempo ${tiempo.orden}`,
             () => ir('asalto', { id: tiempo.asaltoId })),
    estado,
  );

  try {
    const fichero = await leerVideo(tiempo);

    const reproductor = crearReproductor();
    reproductorActivo = reproductor;
    reproductor.cargar(fichero);

    estado.textContent = [
      formatearSegundos(tiempo.duracion),
      formatearBytes(tiempo.tamano),
      `${intercambios.length} intercambio(s) etiquetado(s)`,
    ].join(' · ');

    contenedor.append(
      reproductor.elemento,
      crear('p', {
        class: 'ayuda',
        texto: 'El etiquetado llega en la siguiente fase. Por ahora comprueba que ' +
               'el vídeo se ve bien y que los saltos van finos.',
      }),
    );

  } catch (error) {
    estado.textContent = '';
    contenedor.append(crear('p', {
      class: 'aviso',
      texto: `No se pudo recuperar el vídeo: ${error.message}`,
    }));
  }
}
