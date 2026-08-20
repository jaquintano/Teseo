// Pantalla de ayuda.
//
// Escrita para alguien que abre Teseo por primera vez y no ha leído nada.
// Frases cortas, sin palabras técnicas, y en el orden en que se usa.
//
// IMPORTANTE: esta pantalla se actualiza en cada versión que añada o cambie
// algo que el usuario vea. Si tocas una pantalla, pásate por aquí.

import { crear, cabecera, ir } from '../ui.js';
import { VERSION } from '../version.js';

/** Un apartado con su título y sus párrafos. */
function apartado(titulo, ...parrafos) {
  return crear('section', { class: 'bloque-stat' }, [
    crear('h3', { class: 'subtitulo-seccion', texto: titulo }),
    ...parrafos.map((texto) => crear('p', { class: 'texto-ayuda', texto })),
  ]);
}

export async function pantallaAyuda(contenedor) {
  contenedor.append(
    cabecera('Ayuda', () => ir('menu')),

    crear('p', { class: 'texto-ayuda destacado', texto:
      'Teseo sirve para ver en qué eres bueno y en qué no, mirando tus propios ' +
      'asaltos. Grabas, marcas lo que pasa, y la aplicación saca las cuentas.' }),

    apartado('La primera vez',
      'Teseo necesita saber quién eres. Lo más rápido es "Búscate en el ranking ' +
      'de la RFEE": eliges tu categoría, te buscas en la lista y quedan puestos ' +
      'tu nombre, tu fecha de nacimiento, tu club y tu género.',
      'Después sólo tienes que decir con qué mano tiras y qué empuñadura usas, ' +
      'que eso la federación no lo publica.',
      'Si no compites en el circuito federativo, puedes escribirlo todo a mano.'),

    apartado('Cómo se usa, de principio a fin',
      '1. Graba el asalto con el móvil, como cualquier vídeo.',
      '2. En Teseo, pulsa "Nuevo asalto" y di contra quién fue.',
      '3. Añade el vídeo. Si el asalto tuvo varios tiempos, añade uno por tiempo.',
      '4. Abre el vídeo y ve marcando lo que pasa en cada intercambio.',
      '5. Cuando quieras, entra en Estadísticas y mira qué te sale.'),

    apartado('Marcar un intercambio',
      'Reproduce el vídeo y pausa justo donde pasa algo. Con los botones de ' +
      '−0,1 s y +0,1 s afinas hasta el momento exacto.',
      'Pulsa "Nuevo intercambio aquí" y aparecen tres filas de botones. Marca ' +
      'lo que hiciste TÚ: si atacaste, la primera fila; si defendiste, la ' +
      'segunda; y en la tercera, cómo acabó.',
      'No hace falta rellenar las tres. Si sólo sabes que fue tocado en contra, ' +
      'marca eso y ya está.',
      'Todo se guarda solo. No hay botón de guardar que se pueda olvidar.'),

    apartado('La barra de debajo del vídeo',
      'Cada marca de colores es un intercambio que ya has etiquetado. Verde es ' +
      'tocado a favor, rojo en contra, ámbar doble.',
      'Tócala en cualquier punto para saltar a ese momento. Toca una marca ' +
      'para volver a ella y corregirla o borrarla.',
      'Puedes ampliar el vídeo con dos dedos, y el botón "Ajustar" lo devuelve ' +
      'a su tamaño.'),

    apartado('Rivales',
      'Los rivales se guardan aparte, porque te los cruzas muchas veces. Los ' +
      'das de alta una vez y luego los eliges de la lista.',
      'Puedes traerlos de golpe del ranking de la federación, en Rivales → ' +
      '"Traer de la RFEE". Vienen con su nombre, su club y su fecha de ' +
      'nacimiento, pero sin saber con qué mano tiran: eso lo pones tú.',
      'La mano hace falta de verdad, porque las estadísticas te dejan comparar ' +
      'cómo te va contra diestros y contra zurdos.'),

    apartado('Qué te dice Estadísticas',
      'Con qué acciones sueles tocar y con cuáles no. Si atacas más de lo que ' +
      'defiendes. En qué parte del asalto tocas más. Dónde te tocan a ti. Y ' +
      'cuántos dobles haces.',
      'Arriba, en "Filtros", puedes mirar sólo contra un rival, sólo contra ' +
      'zurdos, o sólo los primeros asaltos del día.'),

    apartado('Tus datos no salen del móvil',
      'No hay que registrarse ni hay contraseñas. Los vídeos, tus asaltos y ' +
      'tus marcas se quedan en este teléfono y no se envían a ningún sitio.',
      'Como no hay copia en ningún servidor, si borras la aplicación se pierde ' +
      'todo.',
      'Funciona sin cobertura: en la sala puedes etiquetar aunque no haya wifi.'),

    apartado('Si algo va mal',
      'El vídeo tiene que estar descargado en el móvil. Si está sólo en la ' +
      'nube de Google Fotos, Teseo no puede leerlo y te avisará. Lo más cómodo ' +
      'es etiquetar el mismo día del torneo.',
      'En Menú → Diagnóstico puedes ver cuánto espacio te queda y copiar un ' +
      'registro de lo que ha pasado, por si hay que preguntar.'),

    crear('p', { class: 'ayuda', texto: `Esta ayuda corresponde a la versión ${VERSION}.` }),
  );
}
