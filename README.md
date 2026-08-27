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
          └── intercambios ── las etiquetas
```

Del **asalto** se guardan el rival, la competición, la fase (poule, tablón de
32, final…), el resultado final, de quién era la prioridad si la hubo y una
nota.

**La competición no es obligatoria.** La federación tarda en publicar su
calendario, y dar el torneo de alta a mano para salir del paso acaba en
competiciones duplicadas: es mejor dejar el asalto sin ella y asignársela
cuando aparezca —desde "Editar datos del asalto", y entonces manda su fecha—.
Cuando no la hay, **se pregunta la fecha**, que es lo único que sitúa al
asalto en el tiempo: el campo sale con hoy ya escrito y desaparece en cuanto
se elige competición. Se pregunta y no se pone sola porque se etiqueta con
retraso —grabas el sábado y lo repasas el martes— y una fecha puesta a
escondidas colocaría el asalto en el día equivocado.

Por dentro es el mismo campo `asalto.fecha` de cuando la fecha se preguntaba
siempre, y `fechaDeAsalto()` ya miraba primero la competición y caía en él si
no la había: la lista, la agrupación y el orden por calendario funcionan sin
tocar nada.

Del **tiempo**, su vídeo y **con qué marcador empieza**. Eso último se guarda
y se puede corregir a mano porque el vídeo tiene agujeros: puede no haberse
grabado el primer tiempo, o cortarse antes de acabar y perderse tocados. Ver
"El tanteo", más abajo.

Un intercambio tiene un instante en segundos, un **resultado** (a favor, en
contra, doble o nulo), **dónde cayó el tocado** y **cómo lo acabó cada uno**.
Todo es opcional menos el instante: un intercambio a medio etiquetar es
normal y las cuentas lo aguantan.

Las zonas dependen del resultado, y sólo se pregunta la que significa algo:
en un tocado a favor, dónde le tocaste (`zonaRival`); en uno en contra,
dónde te tocaron (`zonaPropia`); en un doble, las dos. Si el resultado
cambia y una zona deja de tener sentido, se borra: un dato que ya no se ve
en pantalla pero sigue en la base ensucia las cuentas y nadie puede
corregirlo. Con cualquier tocado se puede añadir además la zona de la pista.

La **acción final** se guarda de los dos, `accionPropia` y `accionRival`, con
la misma estructura: `{ tipo, accion, variante, linea }`. El tipo abre una de
tres ramas y sólo se pregunta lo que cuelga de ella:

- **Ofensiva** → qué acción (ataque simple, toma de hierro, finta, pase,
  batimiento, ligamento, cuerpo a cuerpo, remise o reprise), con qué se
  remató el ataque simple —y eso sólo si esa acción lo admite: la flecha no
  sale de un ligamento, ni el coupé de una finta— y en qué línea acabó.
- **Defensiva** → distancia, parada o sin reacción.
- **Contraataque** → con qué ataque simple se cerró.

**Cada grupo va de un color**, y el color tiñe el título, los rótulos de sus
campos y las líneas de las que cuelgan los anidados: el tocado en morado —no
es de nadie—, la pista en el azul de la aplicación, y las dos acciones con el
color de la LÁMPARA de cada uno, la tuya con la tuya y la del rival con la
contraria. Es el mismo idioma de colores que las marcas de la línea de tiempo,
así que se sabe de quién habla cada bloque sin leer el título.

La ficha **encadena sola**: al contestar algo que destapa un campo nuevo,
salta a él y le abre la lista. Elegir "Ofensiva" lleva a "Acción", y elegir
allí un ataque simple lleva a su remate. Etiquetar un asalto son decenas de
intercambios, y buscar a mano el siguiente desplegable era la mitad del
trabajo. Se apoya en `showPicker()`, que pide venir de un toque del usuario:
por eso la ficha se repinta ANTES de guardar en la base y no después, para no
perder ese permiso por el camino. Donde el navegador no lo permita, el campo
se queda al menos enfocado.

De la **frase de armas** no se apunta nada: sólo el último movimiento de cada
uno. Es el primer nivel a propósito. Preguntar la conversación de hierros
entera es largo, se acaba dejando en blanco, y un campo en blanco es peor
que un campo que no existe.

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
js/pantallas/ranking.js        el ranking de la federación, tal cual lo publica
js/calculo-estadisticas.js     LAS CUENTAS. Módulo independiente: no toca ni
                               la pantalla ni la base de datos. Junto con
                               constantes.js se puede llevar a otro sitio
                               (por ejemplo, algo para el entrenador)
js/tanteo.js                   el marcador: quién va ganando y con qué se
                               llega a cada tiempo. También puro
js/genero.js                   el género y las categorías del tirador, que
                               mandan en media aplicación
js/competiciones.js            lee el calendario y decide qué importar
js/instalacion.js              el ofrecimiento de instalar en la pantalla
js/db.js                       base de datos local y almacenamiento de vídeos
js/ajustes.js                  los ajustes avanzados: catálogo, valores de
                               fábrica y límites
js/preferencias.js             la casilla de los textos de ayuda
js/ui.js                       piezas de interfaz y navegación entre pantallas
js/registro.js                 registro interno, visible en Configuración
js/video.js                    el reproductor, como pieza reutilizable
js/pantallas/perfil.js         tu ficha
js/pantallas/ficha-tirador.js  el formulario que comparten perfil y rivales
js/pantallas/rivales.js        lista y ficha de rivales
js/pantallas/asaltos.js        lista, alta y detalle de asaltos con sus tiempos
js/pantallas/competiciones.js  lista, ficha e importación de competiciones
js/deteccion.js                de píxeles a lámparas encendidas, y de
                               encendidos a tocados. Puro
js/seguimiento.js              busca el marcador en el fotograma cuando la
                               cámara se mueve o alguien lo tapa. Puro
js/analisis.js                 recorre el vídeo muestreando: junta las dos
                               cosas anteriores
js/pantallas/calibrado.js      enseñarle a Teseo dónde está el marcador
js/pantallas/etiquetado.js     EL CORAZÓN: vídeo, marcas, tabla y tanteo
js/pantallas/estadisticas.js   los filtros y la presentación de las cuentas
js/pantallas/ayuda.js          la ayuda para quien abre Teseo por primera vez
js/pantallas/menu.js           menú y configuración
iconos/logo-teseo-original.jpg el dibujo tal cual lo entregó su autor: el
                               maestro del que sale todo lo demás
iconos/logo-teseo.jpg          el mismo dibujo a 880 px, que es el que se ve
                               al pie del menú
iconos/icon-*.png              los iconos de la aplicación, generados con
                               herramientas/hacer-iconos.ps1
herramientas/hacer-iconos.ps1  rehace el logotipo del menú y los cuatro iconos
                               desde el dibujo maestro. Se ejecuta a mano
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
**Nuevo intercambio**. Eso deja una marca en ese instante exacto y abre su
ficha, que es una ventana encima de todo: primero el resultado, que es lo
único que se sabe siempre, y debajo las acciones y las zonas. Cada cambio se
guarda solo.

**Navegar y editar están separados.** Tocar una marca de la línea de tiempo,
o una fila de la tabla, sólo reproduce ese intercambio: arranca dos segundos
antes y para medio segundo después. No abre nada, porque repasar un asalto no
tiene por qué interrumpirse. Para corregir una etiqueta está el lápiz de su
fila. Esos dos segundos y ese medio son configurables (ver *Ajustes
avanzados*).

**Los botones "×½" y "×2"**, a los lados del de reproducir, cambian la
velocidad: la mitad para mirar con lupa un intercambio dudoso, el doble para
pasar de largo el mucho rato de nada que hay entre tocado y tocado. Se excluyen
entre ellos, volver a tocar el que está puesto devuelve a la velocidad normal,
y lo elegido aguanta pausas y saltos.

La fila del reproductor lleva ya cinco botones, así que **cada uno se queda con
lo que ocupa su rótulo** y el de reproducir se lleva lo que sobre: es el único
cuyo texto cambia, y así al pasar de "Reproducir" a "Pausa" no se mueven los
otros cuatro de sitio.

**Los cuatro botones de apuntar de un toque** —A favor, En contra, Doble,
Nulo— van **dentro del panel del reproductor**, debajo de los saltos finos.
Ahí y no fuera porque el panel se queda pegado al borde de arriba al bajar por
la tabla: fuera se irían de la pantalla justo cuando más falta hacen. "Doble" y
"Nulo" se ajustan a su rótulo y sueltan el ancho que les sobra, que los que se
pulsan a todas horas son los otros dos.

Crean el intercambio con su resultado ya puesto **sin parar el vídeo y sin
abrir la ficha**: al repasar un asalto ya sabes cómo acabó cada intercambio y
no quieres nada más. Lo demás se rellena luego con el lápiz de su fila, o no
se rellena nunca. Llevan el mismo gris que los saltos finos porque son de
la misma familia —se tocan y pasa algo en el vídeo, sin abrir nada—, y el doble
va en ámbar, que es el único que no es de nadie.

**Los botones "‹" y "›"**, a los lados del de reproducir, saltan al intercambio
anterior y al siguiente y reproducen su trozo: es la forma más cómoda de
repasar un asalto ya etiquetado, sin acertarle con el dedo a una marca de
catorce píxeles. Se apagan cuando no llevan a ninguna parte, y lo que cuenta
para eso es **dónde está el vídeo**, no cuál sea la fila abierta. La única
excepción es mientras se reproduce el tramo de un intercambio: ahí el vídeo va
por detrás de su marca —esa es la gracia del tramo—, y se cuenta desde el
intercambio, que si no "siguiente" devolvería una y otra vez el mismo.

Debajo del vídeo hay una tabla con lo etiquetado: instante, resultado con el
color de su marca y cómo iba el marcador. Y junto al reloj del vídeo, el marcador del segundo que se está
viendo, que da un respingo cuando cambia.

El reproductor se queda pegado al borde de arriba al bajar por la tabla:
etiquetar es mirar el vídeo y la lista a la vez.

### Qué probar cuando se toca esta pantalla

1. Etiqueta cinco o seis intercambios seguidos, como lo harías de verdad.
2. Comprueba que los saltos de ±0,1 s te dejan en el fotograma que quieres.
3. Toca una fila: debe reproducir su trozo y parar solo, sin abrir la ficha.
4. Toca su lápiz: debe abrir la ficha con lo que habías elegido.
5. Cambia el resultado a *Nada*: las zonas deben desaparecer y el marcador de
   la tabla recalcularse de ahí abajo.
6. Corrige el marcador de partida: todo debe moverse con él.
7. Borra un intercambio.
8. Cierra Teseo del todo y vuelve: debe estar todo.

### De qué color se pinta un intercambio

Del color de la **lámpara que se encendió**, no del resultado. Si tu lámpara es
la roja, tus tocados salen en rojo y los del rival en verde. Se probó al revés
—verde a favor, rojo en contra— y confunde: en la pista has visto encenderse
una lámpara concreta, y el ojo la busca. El doble sigue en ámbar y el nulo en
gris, que no son de nadie.

Para eso hace falta saber **de qué color eras tú**, y ése es un dato del
asalto (`asalto.miColor`), no de cada tiempo: te enchufas a un lado de la pista
y ahí te quedas. No se pregunta al crear el asalto, porque hasta que no ves el
vídeo no te acuerdas; se pregunta **al abrir un tiempo**, que es donde se
etiqueta y el único sitio donde puedes comprobarlo mirando el vídeo. Estuvo
también en la pantalla del asalto y se quitó en v70: preguntarlo dos veces
sólo servía para contestar de memoria. **Sin contestarlo no se puede
etiquetar** —ni a mano ni con la detección automática—, porque un "tocado a
favor" sin saber cuál era tu lámpara no se puede ni pintar ni verificar.

Antes este dato vivía dentro del calibrado de cada tiempo. Los asaltos de
entonces se migran solos al abrirlos: si alguno de sus tiempos lo trae en su
calibrado, se sube al asalto (`colorDelAsalto()` en `js/db.js`).

## El tanteo

Un doble suma a los dos: tres tocados a favor, uno en contra y dos dobles
dejan un 5-3. Lo que **no** se deduce de las etiquetas es con qué marcador
empieza cada tiempo, y por eso se guarda en el tiempo y se puede corregir a
mano: el vídeo puede no tener el primer tiempo, o cortarse antes de acabar.

Lo de dentro se sigue derivando de las etiquetas, y ésa es la razón: al
corregir un resultado se recalcula todo lo que viene detrás. Guardar el
marcador en cada intercambio habría hecho lo contrario.

El **resultado final del asalto** se pregunta aparte, en su ficha. Es cómo
acabó de verdad, lo diga o no la grabación.

## Detección automática de tocados

Si en el encuadre se ve el marcador del aparato, Teseo puede proponer los
tocados solo. **Es opcional**: hay grabaciones donde el marcador no se ve, y
ésas se etiquetan a mano como siempre.

`js/deteccion.js` es puro —píxeles a cuentas, cuentas a tocados—,
`js/seguimiento.js` busca el marcador en cada fotograma y `js/analisis.js` es
el que reproduce, muestrea y junta las dos cosas. La pantalla de calibrado es
`js/pantallas/calibrado.js`.

**El problema de verdad: el marcador no es una caja con dos bombillas.** Lleva
el cronómetro en ámbar y el tanteo en rojo de siete segmentos, encendidos todo
el rato y cambiando. Medido sobre un marcador de competición: con el recuadro
alrededor del aparato y **sin ningún tocado**, hay 443 píxeles rojos, más que
los 290 de la propia lámpara. Contar el recuadro entero es contar el tanteo.

**La solución: que el usuario marque las lámparas.** Tres recuadros: el
marcador, la lámpara roja y la lámpara verde. El análisis mira sólo dentro de
los dos últimos, así que los dígitos quedan fuera.

Antes lo buscaba Teseo solo, comparando una captura del marcador con las
lámparas apagadas contra otra con una encendida: lo que aparecía entre las dos
era la lámpara, porque los dígitos están en las dos y se van solos en la resta.
En teoría es elegante y en la práctica era **la parte más frágil de todo esto**:
si entre las dos capturas cambiaba el tanteo, ese dígito también "aparecía" y se
tomaba por lámpara; si el tocado elegido salía de refilón, la mancha se medía
pequeña; y había que explicarlo todo. Marcarlo a dedo es más rápido, no falla y
el usuario ve exactamente lo que Teseo va a mirar.

**Cada lámpara se guarda como una posición DENTRO del marcador**, no de la
pantalla. Eso es lo que permite marcar cada recuadro en el momento del vídeo
que se quiera: Teseo sabe dónde está el marcador en cada fotograma, así que
traduce lo que se dibuja a coordenadas del aparato. Lo cómodo es buscar un doble
y hacerlo todo en un fotograma, pero se puede marcar la roja en un tocado y la
verde en otro.

Y mientras se navega por el vídeo, **los tres recuadros siguen al marcador**.
Esa es la comprobación: si van pegados a él, el análisis va a funcionar.

**El umbral sale de lo que se vea al marcar.** Al cerrar el recuadro de una
lámpara se cuentan los píxeles de su color que hay dentro, y la cuarta parte de
esa cifra es el listón que habrá que superar durante el análisis. Por eso
conviene marcarla encendida; si no lo está, se avisa.

**Y sólo ahí de verdad.** La zona de cada lámpara se ensanchaba un 60 % por
cada lado, o sea 2,2 × 2,2: casi **cinco veces la lámpara**. Ese margen se puso
cuando el recuadro estaba clavado en un sitio del fotograma y había que aguantar
el temblor de la cámara; con seguimiento sólo servía para que cupieran dentro
los dígitos del tanteo, que están al lado y son igual de rojos. Ahora es un
15 %, y se rehace al analizar a partir de la mancha guardada, así que los
calibrados viejos se aprovechan sin repetirlos.

**Seguir y medir no se juegan lo mismo.** Para seguir vale un parecido regular
(0,55): se sabe por dónde anda el marcador y con eso basta. Para contar píxeles
hace falta saber dónde está la lámpara con precisión de dos o tres píxeles, así
que por debajo de **0,70 no se mide**: ese tramo cuenta como hueco, y si la
lámpara se enciende ahí se dirá al recuperarlo. Un hueco honesto vale más que
un tocado inventado.

**Se puede ampliar con dos dedos para encuadrar.** El marcador sale pequeño en
un vídeo grabado de lejos, y ajustarle un recuadro a pulso sobre una miniatura
es imposible. En el calibrado, **un dedo dibuja el recuadro y dos amplían y
pasean la imagen**; para volver al tamaño normal, se juntan los dedos. No hay
botón de ajustar porque el gesto ya lo dice.

Por dentro, el zoom se aplica a un envoltorio que lleva **dentro el vídeo y la
capa que recoge el trazo**. Eso es lo que evita tener que deshacer la
transformación a mano: `getBoundingClientRect()` de la capa ya viene ampliada,
así que la cuenta de siempre —(x − izquierda) / ancho— sigue dando la posición
dentro del fotograma. Comprobado: con zoom 3×, dibujar sobre todo el marco da
el tercio central del fotograma.

**El recuadro, ajustado al aparato.** La primera versión pedía dibujarlo grande
y con holgura, para que el temblor de la cámara no sacara el marcador; con el
seguimiento eso ya no hace falta, y lo que sobra estorba. Todo lo que no es el
aparato —la pista, la gente, el fondo— cambia a lo largo del vídeo, y eso baja
el parecido de la plantilla justo cuando hay que reconocerla. Confirmado probándolo: cuanto más ceñido, mejor va.
El único límite por abajo es que tenga dibujo que reconocer, y el calibrado lo
comprueba.

**Cómo clasifica un píxel.** En HSV: hace falta tono rojo o verde, saturación y
brillo. En HSV y no en RGB porque el móvil reajusta la exposición y un LED
potente satura el sensor y sale blanco, conservando el tinte sólo en el halo.
El rojo está partido en los dos extremos de la rueda de tonos, así que se miran
los dos rangos.

### Por qué el verde se ve peor que el rojo

No es cosa del código: es del sensor. **El verde pesa un 59 % del brillo de un
píxel y el rojo sólo un 30 %**, así que un LED verde potente revienta el canal
mucho antes. De un tocado verde queda un aro de color con un agujero blanco en
medio; de uno rojo, casi toda la mancha. Con los mismos umbrales para los dos,
el verde llega con la mitad de píxeles y se pierde tocados, y —lo peor— convierte
los dobles en tocados del rival.

Tres cosas lo compensan:

- **Menos exigencia por píxel** (saturación 0,25 y brillo 0,35, antes 0,35 y
  0,40). Ser tacaño aquí ya no quita falsos positivos —de eso se encarga el
  filtro del tiempo y una zona estrecha—, sólo pierde luz.
- **Menos exigencia por muestra**: hace falta ver encendida la cuarta parte de
  la mancha que se midió al calibrar, no el 40 %. Se rehace al analizar desde
  la mancha guardada, así que los calibrados viejos también se benefician.
- **Al segundo color de un doble se le pide menos.** Cuando una lámpara ya ha
  pasado el filtro del tiempo, sabemos que ahí hubo un tocado: la pregunta que
  queda no es "¿ha pasado algo?" sino "¿se encendieron las dos?", y basta con
  ver luz en la mitad de las muestras **desde que empezó el tocado** —no de la
  ventana entera, que arrastra muestras de antes y las diluye—.

Y el calibrado avisa si una lámpara sale con menos de la mitad de píxeles que
la otra, para poder volver a medirla en un tocado mejor.

**Cuándo da por encendida una lámpara: por el TIEMPO que aguanta.**

Una lámpara de espada se queda encendida unos **dos segundos**, hasta que el
árbitro rearma. El tanteo del marcador, cuando acaba de cambiar, **parpadea
cada dos décimas**. En color y en tamaño se parecen —dígitos enormes de siete
segmentos, rojos— pero en el tiempo no se parecen en nada, y eso es lo que se
mide: de todas las muestras de la última ventana (0,8 s de fábrica), **cuántas
vieron luz**. Una lámpara de verdad da casi el cien por cien; un parpadeo al
cincuenta por ciento se queda en la mitad. El corte está en el 80 %, medido:
por debajo del 85 % de luz por ciclo, un parpadeo no pasa.

Esto sustituyó a la regla de "dos de las tres últimas", que era justo lo que
dejaba entrar el parpadeo: en tres muestras seguidas de una luz que va y viene,
dos están encendidas casi siempre. Aquella regla existía para aguantar un
fotograma perdido, y eso lo sigue haciendo el 80 %: caben dos muestras en
blanco de cada diez.

**Y por eso se mira cada 0,08 s, que no es un número redondo.** Si se mirara
justo cada 0,1 o cada 0,2 se podría caer siempre en la misma fase de un
parpadeo de dos décimas y verlo encendido *siempre*: el error clásico de
muestrear al compás de lo que se mide. Con 0,08 las muestras caen en cinco
puntos distintos de cada parpadeo.

Lo que se busca es el **flanco de subida**, y el instante que se apunta es el
de la primera muestra que vio la luz, no el de la que lo confirmó. Si las dos
lámparas suben con menos de medio segundo de diferencia, es un doble.

Al guardar se barren veinte fotogramas repartidos por todo el vídeo; si en la
mayoría "habría lámpara encendida", algún recuadro coge de más y está cazando
un dígito. Se avisa y se deja guardar de todas formas.

**Nada se etiqueta solo.** Lo que sale son propuestas (`intercambio.propuesto`),
que aparecen en la tabla pero **no cuentan ni para el marcador ni para las
estadísticas** hasta que alguien las confirma.

### El marcador no se está quieto

Un vídeo grabado con el móvil en la mano se mueve, y a los treinta segundos el
marcador ya no está donde se enmarcó. Peor: **el tirador se planta delante del
aparato durante segundos enteros**, que es justo cuando hay tocados. Por eso el
recuadro no está fijo: en cada muestra se busca dónde está el marcador
(`js/seguimiento.js`) y se miran las lámparas ahí.

**Cómo se busca.** Con una plantilla —el recuadro en escala de grises tal y
como se veía al calibrar— y **correlación cruzada normalizada**, que resta la
media y divide por la desviación de cada trozo. Eso la hace inmune a la
autoexposición del móvil: si toda la escena se aclara, la plantilla sigue
encajando porque lo que se compara es el dibujo, no el brillo. En gris y no en
color a propósito: el color de un marcador son cuatro dígitos que cambian.

**Y en pirámide**, o no cabría en un móvil. Se rastrea el fotograma entero en
una copia reducida a la cuarta parte —dieciséis veces menos posiciones, y cada
una dieciséis veces más barata—, de ahí salen cuatro sitios prometedores y cada
uno se afina hacia abajo mirando dos píxeles alrededor. Cuatro y no uno porque
si un reflejo gana en miniatura ya no habría vuelta atrás. Medido: 0,6 ms por
muestra siguiendo, 2,3 ms rebuscando en todo el encuadre.

**Dos umbrales.** Seguir donde estaba pide 0,55 de parecido; reencontrarlo en
todo el fotograma pide 0,70, porque ahí se prueban miles de posiciones y alguna
se parecerá por casualidad. Además, al reencontrarlo **se prefiere lo cercano**:
se resta hasta un cuarto del parecido al que esté en la otra punta del encuadre.
Una sala de armas está llena de cosas rectangulares y claras sobre fondo oscuro,
y sin eso el recuadro se muda a un cartel de la pared y no vuelve.

**Cuando no se encuentra, no se mira nada.** Contar píxeles de donde ya no está
el marcador es inventarse tocados. Se abre un hueco, y lo que sabíamos de cada
lámpara se conserva —en espada se quedan encendidas hasta que el árbitro
rearma—: si estaba apagada antes del hueco y encendida después, el tocado
ocurrió mientras no se veía. Se propone igual, con el instante en que se
recuperó el marcador y **marcado con ≈** en la tabla, porque sólo se sabe
aproximadamente cuándo fue.

Lo que el seguimiento **no** hace: zooms ni giros, sólo desplazamiento. Si se
graba acercando y alejando, la plantilla deja de encajar y el marcador se da
por perdido, que al menos es no mentir.

### Hace falta resolución

La detección se juega en unas pocas decenas de píxeles. En un vídeo de 1024×576
la lámpara son cuatro píxeles y cualquier reflejo se le parece: falsos positivos
a montones. **Hay que grabar a 720p o más**, y con el marcador lo más cerca que
se pueda. El calibrado lo dice al abrirlo, y también avisa cuando la mancha que
localiza es pequeña.

**Limitaciones conocidas.** Los tiradores prueban la punta antes de empezar y
eso enciende la lámpara: habrá propuestas de más en las pausas. Si el marcador
sale del encuadre entero, no hay nada que hacer hasta que vuelva. Y si el
recuadro no tiene dibujo —una pared lisa, un aparato sobre fondo negro— no se
puede seguir: el calibrado avisa y el análisis mira siempre al mismo sitio, que
sólo vale con trípode.

## Una sola altura para todo lo que se toca

**Botones, campos, desplegables, botones de opción, deslizadores, el resumen de
un `<details>` y la cabecera de la pantalla miden 40 px de alto en toda la
aplicación.** No es capricho: una columna con controles de tres alturas parece
rota, y con el dedo se falla más cuando el objetivo cambia de tamaño en cada
fila.

La altura sale del token `--alto-control` en `css/estilos.css`, **nunca de un
número suelto**. "Compacto" (`.boton-compacto`) quiere decir menos aire por
dentro y menos hueco por fuera, no más bajo.

**Cuidado al cambiar ese número:** el relleno de arriba y abajo tiene que caber
dentro. Un botón con `padding: 0.75rem` mide 49 px por su cuenta, y entonces la
altura mínima no manda nada y bajar el token no se nota. Los rellenos están
puestos para que quepan.

Tres excepciones, y están escritas al lado de la regla:

| Qué | Cuánto | Por qué |
|---|---|---|
| Filas de lista | `--alto-fila-lista`, 64 px | Llevan dos renglones de texto |
| Iconos dentro de una fila de tabla | lo que ocupen | A 40 la fila sería el doble de alta y la tabla dejaría de caber de un vistazo |
| El botón que flota sobre el vídeo | 40 px | No está en el cuerpo de la pantalla, y cuanto menos tape mejor |

Un área de texto (`textarea`) es más alta a propósito: la regla es que nada
**baje** de `--alto-control`, no que nada la pase. Y un rótulo que no quepa en
un renglón parte el botón en dos y lo deja más alto: eso se arregla acortando
el rótulo, no tocando la altura.

**Esto se comprueba al tocar la interfaz**, midiendo los controles de todas las
pantallas: cualquier valor que no sea 40 o una de las tres excepciones es un
fallo.

## Ajustes avanzados

En **Menú → Configuración**, al final, se pueden tocar unas cuantas constantes
sin tocar el código. Viven en `js/ajustes.js`: catálogo, valor de fábrica y
límites en un solo sitio, guardadas todas juntas en un objeto de la tabla de
ajustes.

Se leen **muchas** veces y desde el pintado, así que se cargan una vez al
arrancar (`cargarAjustes()` en `js/app.js`) y se quedan en memoria;
`ajuste(id)` es síncrono a propósito. Todo valor pasa por `acotar()`: nada de
aquí puede dejar la aplicación inservible por un dedo torpe.

Grupo **Intercambios**:

| Ajuste | De fábrica | Para qué |
|---|---|---|
| Segundos antes del tocado | 2 | La carrerilla que se ve al reproducir un intercambio |
| Segundos después del tocado | 0,5 | Cuánto se sigue viendo detrás |
| Silencio tras un tocado confirmado | 8 | La ventana de limpieza de falsos positivos |

### La limpieza del rearme

Desde que suena un tocado hasta que los tiradores vuelven a estar en guardia
pasan ocho segundos largos: el árbitro concede, se vuelve a la línea y se
rearma. **En ese rato no se puede tocar**, así que cualquier propuesta de la
detección automática que caiga ahí es casi con seguridad un falso positivo —lo
típico es probar la punta en la guardia del contrario, que enciende la lámpara
igual que un tocado—.

Por eso, al **confirmar** una propuesta, se borran solas todas las propuestas
de los segundos siguientes. Dos límites deliberados: sólo se van **propuestas**
—lo etiquetado a mano no se toca nunca, si lo pusiste tú es que pasó—, y sólo
hacia **adelante**. Y se dice cuántas se han ido, en el contador de debajo de
la línea de tiempo: una limpieza silenciosa deja al usuario preguntándose
adónde han ido sus propuestas.

## El ranking

**Menú → Ranking** enseña el ranking federativo tal cual lo publica la RFEE:
puesto, tirador, club y puntos. Se eligen la temporada y la categoría; el
arma y el género salen del perfil.

El descargador guarda la posición y los puntos, y ordena por puesto. A quien
la federación aún no ha colocado lo marca con un 9999, y ahí se pone un guion.

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
precargan con la aplicación: son decenas de ficheros, así que se piden
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
- **El club viene como código** (`ECC-BU`, `CETC-M`), que es lo que publica la
  federación. Se puede corregir a mano.

Una advertencia: estos rankings incluyen nombre, apellidos, fecha de
nacimiento y club de **menores de edad**. Todo se queda en el dispositivo y no
sale de él, pero conviene importar sólo las categorías en las que realmente
competís, no el catálogo entero.

## Competiciones

Funcionan como los rivales: se guardan aparte y luego se eligen al crear el
asalto, en vez de teclear el nombre del torneo cada vez. Antes había un campo
de texto libre llamado "Torneo"; los asaltos antiguos lo conservan y se sigue
mostrando, pero los nuevos apuntan a una competición.

Desde **Competiciones → Traer del calendario de la RFEE** se importa el
calendario federativo. Se traen sólo las de **espada individual**, y de ellas
sólo las **de tu género**; la categoría se elige. El tipo de competición (TNR,
Cto. España…) no se filtra: vienen todas.

Cada temporada es **un solo fichero** con todas las categorías y ambos
géneros: son unas ochenta competiciones, y no compensa partirlo como se hace
con los rankings.

```bash
node herramientas/traer-competiciones.js --temporada 2025-2026
node herramientas/traer-competiciones.js --todo --ultimas 2
```

La tarea automática diaria baja el calendario junto con los rankings.

## Todo cuelga del perfil

En el perfil se indican **el género y las categorías en las que compite** el
tirador. Las dos cosas son obligatorias, y de ahí sale casi todo lo demás:

- Las palabras que cambian: *Diestra* o *Diestro*, *Más alta* o *Más alto*.
- Qué rivales se traen: los de **su género** y **sus categorías**.
- Qué competiciones se traen: las mismas categorías, espada, individual.

Por eso **los formularios de importar sólo preguntan la temporada**. El arma
es siempre espada, y el género y la categoría ya se saben.

Cuando alguien compite en dos categorías —lo normal: la suya y la de arriba—
se traen las dos y **quien aparece en ambas no se duplica**: los rankings se
van acumulando sobre la misma lista.

Y si la aplicación está vacía de rivales y competiciones, la pantalla de
inicio ofrece traérselo todo de una vez.

## Detalles que conviene conocer

**El género del tirador manda en toda la aplicación.** Se pide al crear tu
perfil y es obligatorio. De él dependen dos cosas: las palabras que se ven
("Diestra" o "Diestro", "Más alta" o "Más alto") y qué rankings se pueden
importar.

**El botón de retroceso de Android** hace lo mismo que "Volver" en todas las
pantallas. Sólo sale de la aplicación desde "Mis asaltos". Volver a esa
pantalla deshace todo el camino andado, para que desde ella el siguiente
atrás salga de verdad.

**Empezar de cero.** En Menú → Configuración hay un botón que borra todo:
perfil, rivales, asaltos, vídeos y marcas. Pide confirmación dos veces
porque no se puede deshacer. Existe porque desde los ajustes de Android no
siempre es evidente cómo vaciar los datos de una aplicación instalada desde
el navegador.

**La ayuda** (Menú → Ayuda) está escrita para alguien que abre Teseo por
primera vez. **Hay que actualizarla en cada versión que cambie algo que el
usuario vea**: vive en `js/pantallas/ayuda.js`.

**Menú → Configuración** reúne lo que no es del día a día: la casilla de los
textos de ayuda, cuánto espacio ocupa Teseo, protegerlo frente al borrado
automático, vaciar de golpe los rivales y las competiciones que no aparecen en
ningún asalto, empezar de cero y el registro interno por si algo falla.

**Los textos de ayuda se pueden apagar** con la primera casilla de esa
pantalla. La preferencia vive en `js/preferencias.js` y no repinta nada: pone
la clase `sin-ayuda` en el `<body>`, y el CSS esconde lo marcado con la clase
`explicacion`. Al escribir una pantalla nueva, **un párrafo que explica lleva
`explicacion` y uno que dice cómo están las cosas no**: los contadores, los
estados ("Analizando…", "Sin datos todavía"), el resumen de un asalto y los
avisos se quedan siempre, y la pantalla de Ayuda entera también.

## Las estadísticas

Se llega desde Menú → Estadísticas, y se pueden filtrar por rival, por mano
del rival y por **cómo iba el marcador** —ganando, empate o perdiendo—, que
no se tira igual por delante que por detrás. La situación es la de **antes**
del intercambio: es el estado con el que se decidió cómo tirarlo.

Queda también un filtro por número de asalto de la sesión, que sólo aparece
si hay asaltos viejos que lo tengan: ese dato dejó de preguntarse.

**Ofensivas.** Eficacia por acción (intentos frente a tocados conseguidos),
iniciativa (con qué acabas los intercambios: atacando, defendiendo o
contraatacando), y el reparto de tus tocados por tramo del asalto, por zona
del rival y por zona de la pista.

**Defensivas.** Eficacia de la parada-respuesta, **con qué te tocan** —la
acción con la que el rival acabó cada tocado en contra, que es la pregunta
que no se podía contestar hasta que se apuntó también su acción— y los
tocados recibidos por zona propia y por zona de la pista.

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
4. ✅ Etiquetado: línea de tiempo con marcas y la ficha del intercambio.
5. ✅ Estadísticas y filtros.

Desde entonces el trabajo va a petición, versión a versión: importación desde
la RFEE (rivales, competiciones y ranking), el tanteo, la tabla de
intercambios, el resultado del asalto y un buen repaso de la pantalla de
etiquetado para que quepa todo en un móvil.
