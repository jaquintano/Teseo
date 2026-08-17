# Teseo

Aplicación web para etiquetar vídeos de asaltos de esgrima (espada) y obtener
estadísticas de rendimiento. Todo ocurre en el móvil: no hay servidor, no hay
cuentas y los vídeos no salen del dispositivo.

**Estado: fase 3.** Ya es una aplicación de verdad: perfil, rivales, asaltos y
tiempos con su vídeo. El etiquetado en sí llega en la fase 4.

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

Un intercambio tendrá un instante en segundos y tres capas —acción ofensiva,
acción defensiva y resultado—, todas opcionales. **Las capas describen lo que
hiciste tú**, no lo que hizo el rival.

## Estructura

```
index.html                     la página: sólo la cabecera y un hueco
manifest.webmanifest           ficha de la aplicación: nombre, icono, colores
sw.js                          service worker: instalación y uso sin cobertura
css/estilos.css                estilos (botones grandes, uso a una mano)
js/app.js                      arranque, alta de pantallas, service worker
js/constantes.js               los catálogos: acciones, zonas, fases…
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
iconos/                        generados por código, no dibujados a mano
servidor-local.js              herramienta de desarrollo; GitHub Pages no la usa
```

Todas las rutas son relativas (`./js/app.js`). Es imprescindible: GitHub Pages
sirve el sitio dentro de una subcarpeta, y las rutas absolutas darían 404.

## Al desplegar

Sube el número de versión en **dos** sitios, que tienen que coincidir:

- `VERSION` en `sw.js`
- `VERSION` en `js/app.js`

Si no se sube, los móviles que ya tengan la aplicación guardada pueden seguir
viendo la versión vieja. La versión aparece junto al título.

## Qué probar en la fase 3

1. La primera vez pide tu ficha. Rellénala y pulsa *Empezar*.
2. *Nuevo asalto* → *Dar de alta un rival nuevo* → crea uno. Debe volver al
   asalto con ese rival ya elegido.
3. Rellena el asalto y créalo.
4. Añade el vídeo del primer tiempo. Debe copiarlo con su barra de progreso.
5. Pulsa el tiempo: debe reproducirse el vídeo recuperado de la copia.
6. Cierra Teseo del todo, ábrela otra vez y comprueba que sigue todo.
7. Añade un segundo tiempo al mismo asalto, como en una directa.
8. Menú → Diagnóstico: comprueba que *Datos protegidos* dice **sí**.

## Fases

1. ✅ Compatibilidad: abrir y reproducir vídeo, medir almacenamiento.
2. ✅ Instalable en la pantalla de inicio y uso sin cobertura.
3. ✅ Perfil, rivales, asaltos y tiempos con su vídeo.
4. Pantalla de etiquetado: línea de tiempo con marcas y las tres capas.
5. Estadísticas y filtros.
