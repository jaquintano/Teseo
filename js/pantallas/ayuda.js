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
      'Del asalto se apunta también la fase —poule, tablón de 32, final…— y la ' +
      'fatiga que sentiste, con una barra del 1 al 5 que va del azul al rojo. ' +
      'La fecha no se pregunta: la pone la competición.'),

    apartado('La lista de asaltos',
      'La pantalla de inicio es una tabla: cada fila es un asalto y se abre ' +
      'tocándola. A la derecha va la fatiga que apuntaste, con su color.',
      'En "Filtros y agrupación" eliges si quieres verlos por competición o ' +
      'por rival. Lo que agrupa desaparece de las filas, así que agrupando por ' +
      'competición ves de un tirón contra quién tiraste en ella.',
      'Y puedes quedarte sólo con un rival o una competición. Arriba te dice ' +
      'cuántos asaltos estás viendo de cuántos.',
      'Dentro de cada competición, arriba lo último que tiraste: la final es ' +
      'más tarde que la poule.'),

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

    apartado('Rellenar de golpe',
      'La primera vez, en la pantalla de inicio, Teseo te ofrece traerte de una ' +
      'vez todos los rivales y todas las competiciones de tus categorías. Es lo ' +
      'más cómodo: sólo tienes que elegir la temporada.'),

    apartado('Rivales',
      'Los rivales se guardan aparte, porque te los cruzas muchas veces. Los ' +
      'das de alta una vez y luego los eliges de la lista.',
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
      'Arriba, en "Filtros", puedes mirar sólo contra un rival o sólo contra ' +
      'zurdos.'),

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
