# Teseo

Aplicación web para etiquetar vídeos de asaltos de esgrima (espada) y obtener
estadísticas de rendimiento. Todo ocurre en el móvil: no hay servidor, no hay
cuentas y los vídeos no salen del dispositivo.

**Estado: fase 2** — instalable en la pantalla de inicio. Todavía no etiqueta
nada: la pantalla sigue siendo la prueba de compatibilidad de la fase 1.

Sólo se ha probado en Android. El club es de teléfonos Android; las decisiones
que evitan problemas en iPhone se mantienen porque no cuestan nada, pero no se
ha verificado allí.

## Cómo publicarlo en GitHub Pages

1. Sube estos ficheros a la raíz de tu repositorio.
2. En GitHub, entra en el repositorio → pestaña **Settings** → menú lateral
   **Pages**.
3. En *Build and deployment* → *Source*, elige **Deploy from a branch**.
4. En *Branch*, elige `main` y la carpeta `/ (root)`. Pulsa **Save**.
5. Espera un par de minutos. La dirección será:

   **https://jaquintano.github.io/Teseo/**

Esa dirección es la que abres en el móvil. Es HTTPS, que es lo que hace falta
para que más adelante funcione la instalación como aplicación.

> Ojo con la mayúscula de *Teseo*: en la dirección de GitHub Pages las
> mayúsculas y minúsculas sí cuentan.

> Todas las rutas del proyecto son relativas (`./js/app.js`). Es
> imprescindible: GitHub Pages sirve el sitio dentro de una subcarpeta con el
> nombre del repositorio, y las rutas absolutas (`/js/app.js`) darían error 404.

## Qué hay que probar en la fase 1

Hazlo **en el Android y en el iPhone**, con vídeos grabados por vosotros, no
con vídeos descargados de internet.

### A · Abrir y reproducir

1. Abre la dirección en el móvil.
2. Pulsa *Abrir vídeo de la galería* y elige un asalto real.
3. Comprueba que se ve la imagen (no sólo se oye).
4. Comprueba que se ve en la orientación correcta, no girado.
5. Pulsa *Reproducir* y luego *Pausa*.
6. Con el vídeo en pausa, pulsa los cuatro botones de salto y mira si el
   contador de tiempo se mueve como debe y la imagen le acompaña.
7. Fíjate en si los saltos de ±0,1 s cambian realmente la imagen o si el
   vídeo se queda clavado hasta pasado casi un segundo.

### B · Almacenamiento

1. Anota lo que dice *Máximo concedido* en el apartado 4.
2. Pulsa *Guardar copia del vídeo* y anota cuánto tarda.
3. Pulsa *Reabrir copia guardada* y comprueba que el vídeo se reproduce.
4. Cierra el navegador **del todo**, reinicia el móvil, vuelve a abrir la
   dirección y mira el registro: debe decir que hay una copia de una sesión
   anterior. Pulsa *Reabrir copia guardada* otra vez.
5. Repite la prueba unos días después. Eso es lo que de verdad nos dirá si
   iPhone respeta la copia a largo plazo.

### C · Qué enviarme

Pulsa *Copiar registro* al final de cada prueba y pégame el texto. Ahí van el
modelo de navegador, el formato del vídeo, la duración, la resolución, el
espacio concedido y cualquier error.

### D · Instalación (fase 2)

1. Abre la dirección en Chrome. Debe aparecer el botón **Instalar en la
   pantalla de inicio**. Púlsalo.
2. Cierra el navegador y abre Teseo desde el icono del laberinto.
3. En el registro debe poner *"Ejecutándose como aplicación instalada"*.
4. Pon el móvil en modo avión y vuelve a abrir Teseo. Debe funcionar igual.

## Estructura

```
index.html                    la página
manifest.webmanifest          ficha de la aplicación: nombre, icono, colores
sw.js                         service worker: instalación y uso sin cobertura
css/estilos.css               estilos (botones grandes, uso a una mano)
js/app.js                     arranque, service worker y botón de instalar
js/registro.js                registro en pantalla y utilidades de formato
js/video.js                   reproductor y saltos de tiempo
js/prueba-almacenamiento.js   SÓLO fase 1; se integrará en js/db.js
iconos/                       generados por código, no dibujados a mano
servidor-local.js             herramienta de desarrollo; no la usa GitHub Pages
```

## Al desplegar

Sube el número de versión en **dos** sitios, que tienen que coincidir:

- `VERSION` en `sw.js`
- `VERSION` en `js/app.js`

Si no se sube, los móviles que ya tengan la aplicación guardada pueden seguir
viendo la versión vieja. La versión se muestra bajo el título, para poder
comprobar de un vistazo qué tiene el teléfono.

## Siguientes fases

3. Perfil, rivales y asaltos en base de datos local.
4. Pantalla de etiquetado con línea de tiempo y marcas.
5. Estadísticas y filtros.
