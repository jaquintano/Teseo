// Pantalla de ayuda.
//
// Escrita para alguien que abre Teseo por primera vez y no ha leído nada.
// Frases cortas, sin palabras técnicas, y en el orden en que se usa.
//
// IMPORTANTE: esta pantalla se actualiza en cada versión que añada o cambie
// algo que el usuario vea. Si tocas una pantalla, pásate por aquí.

import { anadir, crear, cabecera, ir } from '../ui.js';
import { VERSION } from '../version.js';

/** Un apartado con su título y sus párrafos. */
function apartado(titulo, ...parrafos) {
  return crear('section', { class: 'bloque-stat' }, [
    crear('h3', { class: 'subtitulo-seccion', texto: titulo }),
    ...parrafos.map((texto) => crear('p', { class: 'texto-ayuda', texto })),
  ]);
}

export async function pantallaAyuda(contenedor) {
  anadir(contenedor,
    cabecera('Ayuda', () => ir('menu')),

    crear('p', { class: 'texto-ayuda destacado', texto:
      'Teseo sirve para ver en qué eres bueno y en qué no, mirando tus propios ' +
      'asaltos. Grabas, marcas lo que pasa, y la aplicación saca las cuentas.' }),

    apartado('La primera vez',
      'Teseo necesita saber quién eres. Lo más rápido es "Búscate en el ranking ' +
      'de la RFEE": eliges tu categoría, te buscas en la lista y quedan puestos ' +
      'tu nombre, tu fecha de nacimiento, tu club y tu género.',
      'Si no compites en el circuito federativo, puedes escribirlo todo a mano.',
      'Marca también las categorías en las que compites, normalmente la tuya y ' +
      'la de arriba. Con eso Teseo ya sabe qué rivales y qué competiciones ' +
      'traerte, y no vuelve a preguntártelo.',
      'Tanto la búsqueda en el ranking como el formulario empiezan en ' +
      'Femenino y M17, que es lo más habitual. Si no es tu caso, cámbialos.'),

    apartado('Cómo se usa, de principio a fin',
      '1. Graba el asalto con el móvil, como cualquier vídeo.',
      '2. En Teseo, pulsa "Nuevo asalto" y elige de la lista contra quién fue y ' +
      'en qué competición. Si no están, date antes una vuelta por Menú → ' +
      'Rivales o Menú → Competiciones.',
      '3. Añade el vídeo. Si el asalto tuvo varios tiempos, añade uno por tiempo.',
      '4. Abre el vídeo y ve marcando lo que pasa en cada intercambio.',
      '5. Cuando quieras, entra en Estadísticas y mira qué te sale.',
      'Del asalto se apunta también la fase —poule, tablón de 32, final…—, cómo ' +
      'acabó y la fatiga que sentiste, con una barra del 1 al 5 que va del azul ' +
      'al rojo. La fecha no se pregunta: la pone la competición.',
      'En el resultado, tus tocados van a la izquierda y los del rival a la ' +
      'derecha, como se cantan: un 14-15 es que perdiste por uno.',
      'Y si el asalto se fue al minuto de prioridad, di de quién era. Sirve ' +
      'para saber después cómo se te dan esos minutos.'),

    apartado('La lista de asaltos',
      'La pantalla de inicio es una tabla: cada fila es un asalto y se abre ' +
      'tocándola. A la derecha, cómo acabó: en verde si ganaste y en rojo si ' +
      'no. De partida sale el último que apuntaste arriba.',
      'En "Filtros y agrupación" puedes juntarlos por competición o por rival. ' +
      'Lo que agrupa desaparece de las filas, así que agrupando por competición ' +
      'ves de un tirón contra quién tiraste en ella.',
      'Y puedes quedarte sólo con un rival o una competición. Arriba te dice ' +
      'cuántos asaltos estás viendo de cuántos.',
      'Dentro de cada competición, arriba lo último que tiraste: la final es ' +
      'más tarde que la poule.'),

    apartado('La tabla de intercambios',
      'Debajo del vídeo tienes la lista de lo que llevas etiquetado: cuándo ' +
      'fue, cómo acabó —con el mismo color que su marca— y cómo iba el ' +
      'marcador. Toca una fila y el vídeo salta ahí, sin abrirte nada: repasar ' +
      'el asalto no tiene por qué interrumpirse.',
      'Para corregir una etiqueta, el lápiz de su fila. Ahí sí se abre la ' +
      'ficha, encima de todo, y al cerrarla vuelves donde estabas.',
      'El tanteo cuenta el doble para los dos, así que tres tocados a favor, ' +
      'uno en contra y dos dobles son un 5-3.',
      'Y no se reinicia con cada vídeo: si el asalto tiene varios tiempos, el ' +
      'segundo empieza donde lo dejó el primero.',
      'Arriba te dice con qué marcador empieza el tiempo, y lo puedes ' +
      'corregir. Es para cuando el vídeo tiene agujeros: no grabaste el primer ' +
      'tiempo, o se cortó antes de acabar y se perdieron varios tocados. Súbelo ' +
      'y a partir de ahí vuelve a contar solo.',
      'Si un tiempo se queda sin vídeo, sus etiquetas siguen ahí: puedes ' +
      'abrirlo, leer la tabla y corregir lo que esté mal. Lo único que no se ' +
      'puede es añadir intercambios nuevos, que para eso hace falta el vídeo.'),

    apartado('Marcar un intercambio',
      'Reproduce el vídeo y pausa justo donde pasa algo. Con los botones de ' +
      '−0,1 s y +0,1 s afinas hasta el momento exacto.',
      'Pulsa "Nuevo intercambio" y se abre su ficha. Lo primero es cómo ' +
      'acabó, que es lo que siempre se sabe; debajo, lo que hiciste TÚ, no el ' +
      'rival: tu acción ofensiva si atacaste, la defensiva si defendiste.',
      'No hace falta rellenarlo todo. Si sólo sabes que fue tocado en contra, ' +
      'marca eso y dale a "Listo".',
      'Todo se guarda solo. No hay botón de guardar que se pueda olvidar.'),

    apartado('La barra de debajo del vídeo',
      'Cada marca de colores es un intercambio que ya has etiquetado. Verde es ' +
      'tocado a favor, rojo en contra, ámbar doble.',
      'Tócala en cualquier punto —o toca una marca— para saltar a ese momento. ' +
      'Si con el dedo se te resisten, usa la tabla de más abajo, que se acierta ' +
      'mejor.',
      'Puedes ampliar el vídeo con dos dedos, y el botón "Ajustar" lo devuelve ' +
      'a su tamaño.'),

    apartado('Rellenar de golpe',
      'La primera vez, en la pantalla de inicio, Teseo te ofrece traerte de una ' +
      'vez todos los rivales y todas las competiciones de tus categorías. Es lo ' +
      'más cómodo: sólo tienes que elegir la temporada.'),

    apartado('Rivales',
      'Los rivales se guardan aparte, porque te los cruzas muchas veces. Los ' +
      'das de alta una vez y luego los eliges de la lista. Corregir una ficha ' +
      'se hace siempre aquí, no desde el asalto.',
      'Al buscar da igual el orden, los acentos y las mayúsculas: la ' +
      'federación los publica como "USEROS MARTÍN, MARÍA" pero puedes escribir ' +
      '"maria useros" y sale igual.',
      'Puedes traerlos de golpe del ranking de la federación, en Rivales → ' +
      '"Traer de la RFEE": sólo te pide la temporada. Vienen con su nombre, su ' +
      'club y su fecha de nacimiento, pero sin saber con qué mano tiran: eso lo ' +
      'pones tú.',
      'Cuando ya tienes fichas, ese botón pasa a decir "Actualizar de la RFEE": ' +
      'vuelve a mirar el ranking y añade las que falten.',
      'La mano hace falta de verdad, porque las estadísticas te dejan comparar ' +
      'cómo te va contra diestros y contra zurdos.'),

    apartado('Competiciones',
      'Igual que los rivales, los torneos se guardan aparte y luego se eligen ' +
      'al crear el asalto, en vez de teclear el nombre cada vez. Hace falta ' +
      'una: es de donde sale la fecha del asalto.',
      'En Competiciones → "Traer del calendario de la RFEE" te bajas los de tu ' +
      'temporada y tu categoría, con su fecha y su población.',
      'Los torneos de tu club, que no están en el calendario federativo, los ' +
      'añades a mano.',
      'Todo esto se hace aquí: al crear un asalto sólo se elige una de las que ' +
      'ya tengas.'),

    apartado('Qué te dice Estadísticas',
      'Con qué acciones sueles tocar y con cuáles no. Si atacas más de lo que ' +
      'defiendes. En qué parte del asalto tocas más. Dónde te tocan a ti. Y ' +
      'cuántos dobles haces.',
      'Arriba, en "Filtros", puedes mirar sólo contra un rival, sólo contra ' +
      'zurdos, o sólo lo que hiciste yendo por delante o por detrás en el ' +
      'marcador: no se tira igual ganando que perdiendo.'),

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
      'En Menú → Configuración puedes ver cuánto espacio te queda y copiar un ' +
      'registro de lo que ha pasado, por si hay que preguntar.',
      'Ahí mismo puedes vaciar de golpe los rivales y las competiciones que no ' +
      'aparecen en ningún asalto: traer un ranking entero deja muchas fichas ' +
      'que no vas a usar.'),

    crear('p', { class: 'ayuda', texto: `Esta ayuda corresponde a la versión ${VERSION}.` }),
  );
}
