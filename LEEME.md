# Salto

Plataformas 2D de precisión. Cinco niveles, seis formas de moverte, sin enemigos.
Todo el esfuerzo está puesto en una sola cosa: que **moverse dé gusto**.

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

Cada nivel desbloquea un movimiento nuevo, y la barra de arriba te dice cuáles
tienes. El quinto los pide todos.

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

## El comprobador de niveles

Un nivel que no se puede terminar es el peor fallo posible, y se escapa a
simple vista. `comprobarNivel()` hace una inundación por el mapa con un modelo
de movimiento **más torpe que el personaje real**: salta 3 casillas (el real
llega a 3,38), avanza 4 (el real 5,44), el dash recorre 2 (el real 2,26). Si
con ese modelo se llega a la salida, con el personaje de verdad seguro que
también.

Y solo cuenta con los movimientos que ese nivel tiene desbloqueados, así que no
se puede colar un nivel 1 que en realidad necesite el dash.

Para pasarlo, abre la consola del navegador y escribe:

```js
NIVELES.map(d => comprobarNivel(prepararNivel(d)))
```

Los cinco niveles lo pasan.

## Editar los niveles

Están en `niveles.js` escritos como dibujos de texto. Puedes cambiarlos a mano:

```
#   suelo y paredes        *   cristal: recarga el dash en el aire
^   pinchos (matan)        o   punto de enganche del gancho
S   dónde apareces         .   aire
E   la salida
```

Las filas se rellenan solas, así que no tienen que medir todas lo mismo.
`habilidades` decide qué sabe hacer el personaje en ese nivel.

## Lo que falta

Los niveles son un **primer borrador**. Están comprobados y se pueden terminar,
pero el diseño de niveles no se valida con un algoritmo: se valida jugando una
y otra vez y moviendo plataformas dos casillas hasta que el salto pide
exactamente lo que tiene que pedir. Eso está sin hacer, y se nota sobre todo
en el 4 y el 5, que son más vacíos de lo que deberían.

Otras cosas que irían bien:
- Un fantasma con tu mejor intento, corriendo a la vez.
- Mando de consola (la Gamepad API son unas 30 líneas).
- Un editor de niveles dentro del propio juego.
- Plataformas que se mueven y bloques que desaparecen al pisarlos.
