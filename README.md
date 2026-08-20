# Teseo

Aplicación web para etiquetar vídeos de asaltos de esgrima (espada) y obtener
estadísticas de rendimiento. Todo ocurre en el móvil: no hay servidor, no hay
cuentas y los vídeos no salen del dispositivo.

**Estado: terminada.** Las cinco fases están hechas: perfil, rivales, asaltos
con sus tiempos, etiquetado y estadísticas.

Sólo se ha probado en Android. El club es de teléfonos Android; las decisiones
que evitan problemas en iPhone se mantienen porque no cuestan nada, pero no se
ha verificado allí.

**Dirección: https://jaquintano.github.io/Teseo/**

## Cómo funciona por dentro

**Nada sale del teléfono.** GitHub Pages sólo sirve los ficheros de la
aplicación (HTML, CSS y JavaScript, unas decenas de kilobytes). Es una
estantería de sólo lectura: no puede recibir nada. Los perfiles, los asaltos,
las etiquetas y las copias de los vídeos viven en el almacenamiento que el
navegador reserva para Teseo dentro del propio móvil.

**Los vídeos se copian a la aplicación.** Un navegador móvil no puede guardar
la ruta de un fichero de la galería y volver a abrirlo días después: el
permiso caduca al cerrar la página. Por eso, al añadir el vídeo de un tiempo,
Teseo hace una copia en su almacenamiento, troceada en bloques de 8 MB.

**El vídeo tiene que estar descargado en el móvil.** Si Google Fotos lo ha
subido a la nube y ha liberado el espacio local, el teléfono conserva la ficha
y la miniatura pero los bytes no se pueden leer. Teseo lo comprueba antes de
dejar etiquetar y avisa. Lo cómodo es etiquetar el mismo día del torneo.

## Modelo de datos

```
tirador ─┬─ tú (uno)
         └─ rivales (muchos, se repiten entre torneos)

asalto ── un combate contra un rival, con su contexto
   └── tiempo ── en poule uno; en directas dos o tres
          ├── un vídeo
          └── intercambios ── las etiquetas (fase 4)
```

Un intercambio tiene un instante en segundos y tres capas —acción ofensiva,
acción defensiva y resultado—, todas opcionales. **Las capas describen lo que
hiciste tú**, no lo que hizo el rival. Cuando el resultado es un tocado (a
favor, en contra o doble) se pueden añadir además la zona del cuerpo y la
zona de la pista.

## Estructura

```
index.html                     la página: sólo la cabecera y un hueco
manifest.webmanifest           ficha de la aplicación: nombre, icono, colores
sw.js                          service worker: instalación y uso sin cobertura
css/estilos.css                estilos (botones grandes, uso a una mano)
js/app.js                      arranque, alta de pantallas, service worker
js/constantes.js               los catálogos: acciones, zonas, fases…
herramientas/traer-ranking.js  descarga rankings de la RFEE. Se ejecuta en el
                               ordenador, NO forma parte de la aplicación
datos/ranking-*.json           los rankings ya descargados, que Teseo lee
datos/rankings.json            índice de los rankings disponibles
js/rfee.js                     lee los rankings y decide qué importar; la
                               parte de decidir es pura
js/pantallas/importar-rfee.js  el formulario de importación
js/calculo-estadisticas.js     LAS CUENTAS. Módulo independiente: no toca ni
                               la pantalla ni la base de datos. Junto con
                               constantes.js se puede llevar a otro sitio
                               (por ejemplo, algo para el entrenador)
js/db.js                       base de datos local y almacenamiento de vídeos
js/ui.js                       piezas de interfaz y navegación entre pantallas
js/registro.js                 registro interno, visible en Diagnóstico
js/video.js                    el reproductor, como pieza reutilizable
js/pantallas/perfil.js         tu ficha
js/pantallas/ficha-tirador.js  el formulario que comparten perfil y rivales
js/pantallas/rivales.js        lista y ficha de rivales
js/pantallas/asaltos.js        lista, alta y detalle de asaltos con sus tiempos
js/pantallas/etiquetado.js     por ahora sólo reproduce; la fase 4 va aquí
js/pantallas/menu.js           menú y diagnóstico
iconos/logo-teseo.jpg          el logotipo original, y la pantalla de arranque
iconos/icon-*.png              recortes del escudo, generados desde el logotipo
servidor-local.js              herramienta de desarrollo; GitHub Pages no la usa
```

Todas las rutas son relativas (`./js/app.js`). Es imprescindible: GitHub Pages
sirve el sitio dentro de una subcarpeta, y las rutas absolutas darían 404.

## Al desplegar

Sube el número de versión en **dos** sitios, que tienen que coincidir:

- `VERSION` en `sw.js`
- `VERSION` en `js/version.js`

Y repasa **Menú → Ayuda** (`js/pantallas/ayuda.js`): tiene que contar lo que
la aplicación hace de verdad en esa versión.

Si no se sube, los móviles que ya tengan la aplicación guardada pueden seguir
viendo la versión vieja. La versión aparece junto al título.

## Cómo se etiqueta

Reproduce, pausa donde ha pasado algo, afina con los saltos de ±0,1 s y pulsa
**Nuevo intercambio aquí**. Eso deja una marca en ese instante exacto y abre
las tres capas de botones. Cada toque se guarda solo.

La línea de tiempo bajo el vídeo lleva una marca por intercambio, con color
según el resultado: verde a favor, rojo en contra, ámbar doble, gris el resto.
Tocar una marca lleva el vídeo a ese instante y abre su ficha para corregirla
o borrarla. Tocando la línea en cualquier otro sitio saltas a ese momento.

## Qué probar en la fase 4

1. Abre un tiempo con vídeo y etiqueta cinco o seis intercambios seguidos,
   como lo harías de verdad.
2. Comprueba que los saltos de ±0,1 s te dejan en el fotograma que quieres.
3. Toca una marca ya puesta: debe llevarte a su instante y abrirla con lo que
   habías elegido.
4. Cambia el resultado a *Nada*: las zonas deben desaparecer.
5. Borra un intercambio.
6. Cierra Teseo del todo y vuelve: debe estar todo.

## Traer rivales del ranking de la RFEE

Desde **Rivales → Traer de la RFEE** se puede rellenar la lista con una
categoría entera del ranking federativo, en vez de escribirlos uno a uno.

Los rankings **no se piden a la federación en ese momento**: viajan dentro de
Teseo. La razón es que el navegador prohíbe que una página lea la respuesta
de otro sitio web salvo que ese sitio lo autorice, y `app.skermo.org` no lo
autoriza. Comprobado: la petición llega, pero la respuesta vuelve ilegible.
Como efecto secundario bueno, la importación funciona sin cobertura.

### Se actualizan solos

Hay una tarea automática (`.github/workflows/actualizar-rankings.yml`) que
**todos los días a las 18:00 de Madrid** descarga las dos últimas temporadas,
espada, todas las categorías y ambos géneros, y hace un commit **sólo si algo
ha cambiado**.

GitHub programa sus tareas en horario UTC y no entiende de cambios de hora,
así que la tarea se dispara a las 16:00 y a las 17:00 UTC y el primer paso
comprueba qué hora es en Madrid: se ejecuta la que caiga a las 18:00 y la
otra se descarta. Así funciona igual en verano que en invierno.

Para que funcione hace falta que el repositorio tenga permisos de escritura
para las tareas: **Settings → Actions → General → Workflow permissions →
Read and write permissions**.

También se puede lanzar a mano desde la pestaña **Actions** del repositorio.

### O a mano, desde el ordenador

```bash
# Un ranking concreto
node herramientas/traer-ranking.js --temporada 2025-2026 --categoria M15 --genero F

# Todo: las dos últimas temporadas, todas las categorías, ambos géneros
node herramientas/traer-ranking.js --todo --ultimas 2
```

Eso deja los ficheros en `datos/` y rehace el índice. Los rankings **no** se
precargan con la aplicación: son 19 ficheros y creciendo, así que se piden
cuando hacen falta y el service worker los va guardando por el camino.

Reglas de la importación:

- **No se duplica nadie.** Se reconoce a cada tirador por su identificador de
  la federación, y si no lo tiene, por el nombre sin acentos ni mayúsculas y
  en cualquier orden. Si en tu lista hay dos con el mismo nombre, no adivina.
- **Sólo se rellenan huecos.** La mano, la altura y tus notas no se tocan
  nunca. Tampoco se sobrescribe un club que hayas escrito tú.
- **La mano llega siempre vacía**, porque la federación no la publica. En la
  tabla de rivales se señala en ámbar, y se pide de forma obligatoria la
  primera vez que creas un asalto contra esa persona: sin ella, ese asalto
  quedaría fuera de los filtros de las estadísticas. Se puede marcar
  *Desconocido*, que es distinto de dejarlo sin mirar: ese asalto no saldrá
  al filtrar por diestro o por zurdo, pero sí en el resto de estadísticas.
- **La empuñadura** (francesa, pistola o desconocida) se rellena a mano: la
  federación tampoco la publica.
- **El género sale del ranking**, y sólo se ofrecen los de tu mismo género:
  en esgrima no hay asaltos entre hombres y mujeres, así que importar el
  otro sería llenar la lista de gente contra la que nunca vas a tirar.
- **La estatura no se pide en centímetros**, que no hay forma de saberlos,
  sino comparada contigo: similar, más alta o más baja.
- **El club viene como código** (`ECC-BU`, `CETC-M`), que es lo que publica la
  federación. Se puede corregir a mano.

Una advertencia: estos rankings incluyen nombre, apellidos, fecha de
nacimiento y club de **menores de edad**. Todo se queda en el dispositivo y no
sale de él, pero conviene importar sólo las categorías en las que realmente
competís, no el catálogo entero.

## Detalles que conviene conocer

**El género del tirador manda en toda la aplicación.** Se pide al crear tu
perfil y es obligatorio. De él dependen dos cosas: las palabras que se ven
("Diestra" o "Diestro", "Más alta" o "Más alto") y qué rankings se pueden
importar.

**El botón de retroceso de Android** hace lo mismo que "Volver" en todas las
pantallas. Sólo sale de la aplicación desde "Mis asaltos". Volver a esa
pantalla deshace todo el camino andado, para que desde ella el siguiente
atrás salga de verdad.

**Empezar de cero.** En Menú → Diagnóstico hay un botón que borra todo:
perfil, rivales, asaltos, vídeos y marcas. Pide confirmación dos veces
porque no se puede deshacer. Existe porque desde los ajustes de Android no
siempre es evidente cómo vaciar los datos de una aplicación instalada desde
el navegador.

**La ayuda** (Menú → Ayuda) está escrita para alguien que abre Teseo por
primera vez. **Hay que actualizarla en cada versión que cambie algo que el
usuario vea**: vive en .

## Las estadísticas

Se llega desde Menú → Estadísticas, y se pueden filtrar por rival, por mano
del rival y por número de asalto de la sesión.

**Ofensivas.** Eficacia por acción (intentos frente a tocados conseguidos),
iniciativa (cuándo atacaste frente a cuándo defendiste), y el reparto de tus
tocados por tramo del asalto y por zona de la pista.

**Defensivas.** Eficacia de la parada-respuesta, y los tocados recibidos por
zona del cuerpo y por zona de la pista.

**Dobles.** Sobre el total de tocados, no sobre todos los intercambios.

Dos criterios que conviene conocer para leerlas bien:

- **El tramo se calcula sobre el asalto entero**, encadenando sus tiempos uno
  detrás de otro. En un asalto a tres tiempos, el "final" es el último tercio
  del tercer tiempo, no el último tercio de cada uno.
- **En la iniciativa, un intercambio con las dos acciones marcadas cuenta
  como ataque**: quien la inicia lleva la iniciativa, aunque luego tuviera
  que defenderse.

## Fases

1. ✅ Compatibilidad: abrir y reproducir vídeo, medir almacenamiento.
2. ✅ Instalable en la pantalla de inicio y uso sin cobertura.
3. ✅ Perfil, rivales, asaltos y tiempos con su vídeo.
4. ✅ Etiquetado: línea de tiempo con marcas y las tres capas.
5. ✅ Estadísticas y filtros.
