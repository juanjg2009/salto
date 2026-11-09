# Salto

Plataformas 2D de precisión. Veinte niveles en cinco zonas, seis formas de
moverte, un plátano escondido en cada nivel y ningún enemigo. Todo el esfuerzo
está puesto en una sola cosa: que **moverse dé gusto**.

Doble clic en `index.html`. Sin internet, sin instalar nada, sin imágenes ni
sonidos: todo se dibuja y se genera con código.

## Controles

| Tecla | Qué hace |
|---|---|
| `←` `→` o `A` `D` | moverte |
| `Espacio` o `Z` | saltar · suéltalo antes para saltar menos · **mantenlo al caer para planear** |
| `X` o `J` | dash en la dirección que estés pulsando |
| `C` o `K` | gancho (mantenido) · `↑` `↓` recogen y sueltan cuerda · `Espacio` te suelta con impulso |
| `R` | reiniciar · `Esc` menú |
| `F` | pantalla completa · `N` saltarte el nivel |

Cada zona desbloquea un movimiento nuevo, y la barra de arriba te dice cuáles
tienes. La última zona los pide todos.

Ningún nivel está bloqueado: `Esc` abre el menú y puedes ir a cualquiera, y `N`
te salta el que tengas delante. Si uno se te atraganta, pásalo de largo.

## Los plátanos

Hay **uno por nivel, veinte en total**, y ninguno está en el camino fácil: todos
piden un desvío, una pared o un dash de más. Se guardan en cuanto los tocas,
aunque te mueras después, y el contador de arriba lleva la cuenta.

Que se puedan coger no es una suposición: el comprobador de niveles busca cada
plátano igual que busca la salida, y los veinte dan alcanzable.

## El movimiento no es física: son trampas

Ninguno de estos números es realista. Son los que hacen que el personaje
responda como tú esperas.

| Qué | Valor | Por qué |
|---|---|---|
| Gravedad subiendo / bajando | 1500 / 2150 | Caer más rápido de lo que subes es lo que da **peso** al salto |
| Gravedad cerca del pico | 950 | Flotas un instante arriba y te da tiempo a leer dónde caes |
| Gravedad al soltar el botón | 3300 | Corta la subida: toque corto = salto corto |
| Acelerar / frenar en suelo | 2100 / 2900 | Frenar más rápido que acelerar se siente firme, no resbaladizo |
| Multiplicador al girarte | ×2,1 | Cambiar de sentido es lo más rápido de todo |
| Tiempo del coyote | 0,10 s | Puedes saltar después de salirte del borde |
| Memoria del botón | 0,12 s | Pulsar antes de aterrizar sigue valiendo |
| Perdón en las esquinas | 8 px | Si te comes un pico de refilón, te empuja de lado |
| Imagen congelada | 50 ms al dash | Diez líneas de código, el triple de impacto |

Todo está en el objeto `F` al principio de `juego.js`, con un comentario por
línea. Toca cualquier número y nota la diferencia: es la mejor forma de
entender por qué los plataformas buenos se sienten como se sienten.

Y lo más importante de todo: **morir cuesta 0,3 segundos**. Sin menú, sin
pantalla. Es la razón por la que fallar no da rabia.

## Medido, no supuesto

Congelé el bucle del juego y ejecuté la física paso a paso para medir:

| Qué | Medido |
|---|---|
| Altura de salto | 88 px = **3,38 casillas** |
| Alcance de un salto corriendo | 141 px = **5,44 casillas** |
| Distancia del dash | 59 px = **2,26 casillas** |
| Velocidad al deslizar por la pared | **95 px/s** (caída normal: 780) |
| Velocidad planeando | **135 px/s** |
| Salto de pared | sale a −260 px/s en horizontal y −368 en vertical, separándote |
| Tiempo del coyote | salta correctamente 0,05 s después de salirse del borde |
| Memoria del botón | el salto sale solo al aterrizar |
| Gancho | se engancha y oscila manteniendo la cuerda a 90 px |

## El gancho

La cuerda no tira del personaje: le **impide alejarse**. Cada paso de física,
si se ha pasado del largo, se le devuelve al círculo y se le quita la parte de
la velocidad que iba hacia fuera. Lo que queda es la parte que gira alrededor
del ancla — y eso, sin más, es un péndulo.

```js
if (d > largoCuerda) {
  const ux = dx / d, uy = dy / d;
  const cx = ancla.x + ux * largoCuerda;   // devolver al círculo
  const cy = ancla.y + uy * largoCuerda;
  p.vx = (cx - p.x) / dt;                  // la velocidad que queda es la tangencial
  p.vy = (cy - p.y) / dt;
}
```

## El comprobador de niveles (y los dos fallos que tuvo)

Un nivel que no se puede terminar es el peor fallo posible y se escapa mirando
el mapa. `comprobarNivel()` recorre el nivel con un personaje **más torpe que
el real**: salta 3 casillas (el real llega a 3,38), cruza 5 saltando a la misma
altura (el real 5,44) y el dash recorre 2 (el real 2,26). Si con eso se llega a
la salida, con el personaje de verdad seguro que también. Solo cuenta con los
movimientos desbloqueados en ese nivel.

Ha estado mal dos veces, y las dos se notaron jugando antes que mirando el
código.

**Fallo 1: dashes infinitos.** No llevaba la cuenta de si quedaba dash, así que
daba por bueno encadenarlos en el aire. Con eso aprobó un nivel 2 imposible.
Ahora el estado de la búsqueda incluye si la carga está gastada.

**Fallo 2: el planeo regalaba distancia.** Daba 4 casillas de avance por cada
casilla que bajabas. Planeando de verdad caes a 135 px/s y corres a 195, o sea
**1,44**. Con 4 aprobaba cualquier cosa, y así colaron los cuatro niveles de
Las ruinas, el 9 entre ellos: pedía cruzar 56 casillas de vacío de una tirada.
Ahora la deriva al caer sale de la física:

```js
const derivaCaida  = (h) => Math.floor(1.17 * Math.sqrt(h));  // caída libre
const derivaPlaneo = (h) => Math.floor(1.4 * h);              // planeando
```

Y el alcance del salto depende de cuánta altura ganes, porque llegar arriba del
todo te deja en el pico del arco: 5 casillas si aterrizas a tu misma altura, 2
si subes 3.

Para pasarlo, en la consola del navegador:

```js
comprobarTodos()
```

Además hay un bot que **juega los niveles de verdad** con la física real:
corre hacia la salida, salta al llegar al borde y mantiene el botón para
planear. Termina el 4 y el 9 sin morir. Los que piden muelles, gancho o subir
por corrientes de aire no sabe jugarlos, y de esos solo está la comprobación
del recorrido.

## El muelle que subía la mitad

Medido en el navegador: el muelle lanza a 790 px/s, que son 8 casillas. Subía
3,6. La causa es que el rebote dejaba `saltando = true`, y al no tener tú el
botón de salto pulsado se aplicaba la gravedad de corte (3300 en vez de 1500),
que es justo la que recorta un salto cuando sueltas pronto. El muelle no es un
salto tuyo, así que ahora pone `saltando = false` y sube las 8 casillas
(7,89 medidas). El salto normal se sigue recortando igual: 1,65 casillas con un
toque, 3,38 manteniéndolo.

## Editar los niveles

Están en `niveles.js` escritos como dibujos de texto. Puedes cambiarlos a mano:

```
#   suelo y paredes        *   cristal: recarga el dash en el aire
^   pinchos (matan)        o   anilla del gancho
S   dónde apareces         P   punto de control
E   la salida              @   el plátano del nivel
-   plataforma horizontal  =   plataforma vertical
x   bloque que se rompe    _   muelle
w   corriente de aire      > <  cintas transportadoras
A   bloque intermitente    B   el del turno contrario
```

Las filas se rellenan solas, así que no tienen que medir todas lo mismo.
`habilidades` decide qué sabe hacer el personaje en ese nivel.

## Trabajar desde otro ordenador

El juego vive en **github.com/juanjg2009/salto** y esta carpeta es un clon de
ese repositorio. En cualquier otro ordenador:

```
git clone https://github.com/juanjg2009/salto.git
```

Se edita igual, y al terminar:

```
git add -A
git commit -m "lo que hayas cambiado"
git push
```

Eso es todo: GitHub Pages republica **https://juanjg2009.github.io/salto/**
en un minuto o dos. No hay que tocar ningún ajuste ni dejar ningún ordenador
encendido.

Antes de ponerte a trabajar, `git pull` para traerte lo que hicieras en la
otra máquina.

## Pantalla completa

El botón pide la pantalla completa del navegador. Si el navegador se niega
—dentro de un panel incrustado la API contesta *Permissions check failed*—, el
respaldo estira el juego a toda la ventana con CSS, que funciona siempre.

## Lo que falta

Los niveles están comprobados y se pueden terminar, pero el diseño de niveles
no se valida con un algoritmo: se valida jugando una y otra vez y moviendo
bloques dos casillas hasta que el salto pide exactamente lo que tiene que
pedir. De los veinte, un bot con física real ha terminado unos pocos; el resto
solo tiene la comprobación del recorrido.

Otras cosas que irían bien:
- Un fantasma con tu mejor intento, corriendo a la vez.
- Mando de consola (la Gamepad API son unas 30 líneas).
- Un editor de niveles dentro del propio juego.
