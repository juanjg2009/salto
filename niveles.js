/* ============================================================
   LOS NIVELES
   Cada nivel es un dibujo en texto. Puedes editarlos a mano.

     #   suelo / pared
     ^   pinchos (matan)
     S   dónde apareces
     E   la salida
     *   cristal: te recarga el dash en el aire
     o   punto de enganche para el gancho
     .   aire (o deja el espacio en blanco)

   Las filas se rellenan solas hasta la más larga, así que no hace
   falta que midan todas lo mismo.

   `habilidades` dice qué sabe hacer el personaje en ese nivel. Así
   cada nivel enseña una cosa nueva sin que las anteriores estorben.
   ============================================================ */
'use strict';

const NIVELES = [
  {
    nombre: 'Primeros pasos',
    pista: 'Flechas o A/D para moverte · Espacio para saltar · suelta antes para saltar menos',
    habilidades: {},
    mapa: [
      '..............................................................',
      '..............................................................',
      '..............................................................',
      '..............................................................',
      '..............................................................',
      '..............................................................',
      '..............................................................',
      '.........................................................E....',
      '........................................................######',
      '.................................................#####........',
      '..............................................................',
      '.........................................#####................',
      '..S...........................................................',
      '###########...###########....##########.......................',
      '..............................................................',
      '..............................................................'
    ]
  },

  {
    nombre: 'Impulso',
    pista: 'X o J para el dash · se lanza hacia donde estés pulsando · se recarga al tocar suelo',
    habilidades: { dash: true },
    mapa: [
      '..................................................................',
      '..................................................................',
      '..................................................................',
      '..................................................................',
      '.............................................................E....',
      '............................................................######',
      '..................................................................',
      '..............................................*...................',
      '..................................................................',
      '.....................................#####........................',
      '..................................................................',
      '..................................................................',
      '..S...............................................................',
      '############............########..................................',
      '..............^^^^^^^^^^..........................................',
      '..................................................................'
    ]
  },

  {
    nombre: 'Entre paredes',
    pista: 'Pégate a una pared cayendo y salta · se puede encadenar de una a otra',
    habilidades: { dash: true, pared: true },
    mapa: [
      '......................................................',
      '.............................................E........',
      '............................................####......',
      '..........................................#....#......',
      '..........................................#....#......',
      '..........................................#....#......',
      '..........................................#....#......',
      '...................................#......#....#......',
      '...................................#......#...........',
      '...................................#......#...........',
      '......................#............#......#...........',
      '......................#............#..................',
      '..S...................#............#..................',
      '#########.............#............#..................',
      '.........^^^^^^^^^^^^^#^^^^^^^^^^^^#^^^^^^^^^^^^^^^^^^',
      '......................................................'
    ]
  },

  {
    nombre: 'Aire',
    pista: 'Mantén el salto al caer para planear · C o K lanza el gancho al punto más cercano',
    habilidades: { dash: true, pared: true, planeo: true, gancho: true },
    mapa: [
      '..........................................................................',
      '..............o...................o...............o.......................',
      '..........................................................................',
      '..........................................................................',
      '..........................................................................',
      '..........................................................................',
      '.......................................................................E..',
      '......................................................................####',
      '..........................................................................',
      '..................*.......................*...............................',
      '..........................................................................',
      '..........................................................................',
      '..S.......................................................................',
      '#########.................................................................',
      '.........^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
      '..........................................................................'
    ]
  },

  {
    nombre: 'Todo junto',
    pista: 'Sin tocar el suelo hasta el final. Encadena: dash · pared · planeo · gancho',
    habilidades: { dash: true, pared: true, planeo: true, gancho: true },
    mapa: [
      '..............................................................................',
      '...............o..........................o...................o..............',
      '..........................................................................E...',
      '.........................................................................####.',
      '..........................................................................#...',
      '....................#.....................................................#...',
      '....................#.........*...........................*...................',
      '....................#.........................................................',
      '....................#.................#.......................................',
      '..............*.....#.................#.......................................',
      '....................#.................#.......................................',
      '....................#.................#...........#...........................',
      '..S.................#.................#...........#...........................',
      '#######.............#.................#...........#...........................',
      '.......^^^^^^^^^^^^^#^^^^^^^^^^^^^^^^^#^^^^^^^^^^^#^^^^^^^^^^^^^^^^^^^^^^^^^^^',
      '..............................................................................'
    ]
  }
];

/* ---------- preparar un nivel ---------- */
const TILE = 26;

function prepararNivel(def) {
  const ancho = Math.max(...def.mapa.map((f) => f.length));
  const filas = def.mapa.map((f) => f.padEnd(ancho, '.'));

  const solido = [], pincho = [];
  const cristales = [], anclas = [];
  let spawn = null, salida = null;

  for (let y = 0; y < filas.length; y++) {
    solido[y] = []; pincho[y] = [];
    for (let x = 0; x < ancho; x++) {
      const c = filas[y][x];
      solido[y][x] = c === '#';
      pincho[y][x] = c === '^';
      const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
      if (c === 'S') spawn = { x: cx, y: cy };
      if (c === 'E') salida = { x: cx, y: cy };
      if (c === '*') cristales.push({ x: cx, y: cy, tomado: false, recarga: 0 });
      if (c === 'o') anclas.push({ x: cx, y: cy });
    }
  }

  if (!spawn) throw new Error(`El nivel "${def.nombre}" no tiene S`);
  if (!salida) throw new Error(`El nivel "${def.nombre}" no tiene E`);

  return {
    ...def, filas, ancho, alto: filas.length,
    solido, pincho, cristales, anclas, spawn, salida,
    anchoPx: ancho * TILE, altoPx: filas.length * TILE
  };
}

/* ============================================================
   COMPROBADOR DE NIVELES
   Antes de dar un nivel por bueno hay que saber que se puede
   terminar. Esto hace una inundación por el mapa con un modelo
   de movimiento CONSERVADOR (menos capacidad de la que tiene el
   personaje de verdad): si con esto se llega a la salida, con el
   personaje real seguro que también.
   ============================================================ */
const F_GANCHO_DIST = 270;    // debe coincidir con F.ganchoDist de juego.js

function comprobarNivel(N) {
  const { ancho, alto, solido, pincho } = N;
  const libre = (x, y) => x >= 0 && y >= 0 && x < ancho && y < alto && !solido[y][x] && !pincho[y][x];
  const suelo = (x, y) => y + 1 < alto && solido[y + 1][x];

  const sx = Math.floor(N.spawn.x / TILE), sy = Math.floor(N.spawn.y / TILE);
  const ex = Math.floor(N.salida.x / TILE), ey = Math.floor(N.salida.y / TILE);

  const visto = new Set();
  const cola = [[sx, sy]];
  const clave = (x, y) => y * ancho + x;
  visto.add(clave(sx, sy));

  const H = N.habilidades || {};
  const SALTO = 3;      // altura de salto en casillas (el real llega a 3,2)
  const ALCANCE = 4;    // casillas horizontales por salto (el real pasa de 4,5)
  const DASH = 2;       // medido: el dash recorre 2,26 casillas. Se redondea a la baja.

  const pared = (x, y) => solidoEn2(x - 1, y) || solidoEn2(x + 1, y);
  function solidoEn2(x, y) {
    return x < 0 || y < 0 || x >= ancho || y >= alto ? false : solido[y][x];
  }

  while (cola.length) {
    const [x, y] = cola.shift();
    const vecinos = [];
    const enSuelo = suelo(x, y);
    const enPared = H.pared && pared(x, y);

    // caer siempre se puede, y de paso derivar un poco de lado
    if (libre(x, y + 1)) {
      vecinos.push([x, y + 1]);
      if (libre(x - 1, y + 1)) vecinos.push([x - 1, y + 1]);
      if (libre(x + 1, y + 1)) vecinos.push([x + 1, y + 1]);
    }
    // andar, solo pisando algo
    if (enSuelo) {
      if (libre(x - 1, y)) vecinos.push([x - 1, y]);
      if (libre(x + 1, y)) vecinos.push([x + 1, y]);
    }
    // saltar: SOLO desde el suelo, o desde una pared si sabe saltarlas
    if (enSuelo || enPared) {
      for (let dy = 1; dy <= SALTO; dy++)
        for (let dx = -ALCANCE; dx <= ALCANCE; dx++)
          if (libre(x + dx, y - dy)) vecinos.push([x + dx, y - dy]);
    }
    // dash: una vez por salto, en ocho direcciones, también en el aire
    if (H.dash) {
      for (const [ux, uy] of [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]]) {
        for (let d = 1; d <= DASH; d++) {
          const nx = x + ux * d, ny = y + uy * d;
          if (!libre(nx, ny)) break;
          vecinos.push([nx, ny]);
        }
      }
    }
    // planeo: cayendo avanzas mucho más de lado
    if (H.planeo && libre(x, y + 1)) {
      for (let dx = -4; dx <= 4; dx++) if (libre(x + dx, y + 1)) vecinos.push([x + dx, y + 1]);
    }
    // gancho: si hay un ancla a tiro, puedes acabar en cualquier sitio de su radio
    if (H.gancho) {
      const R = Math.round(F_GANCHO_DIST / TILE);
      for (const a of N.anclas) {
        const ax = Math.floor(a.x / TILE), ay = Math.floor(a.y / TILE);
        if (Math.hypot(ax - x, ay - y) > R) continue;
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            if (Math.hypot(dx, dy) > R) continue;
            const nx = ax + dx, ny = ay + dy;
            if (ny >= ay && libre(nx, ny)) vecinos.push([nx, ny]);   // colgando, nunca por encima del ancla
          }
      }
    }

    for (const [nx, ny] of vecinos) {
      const k = clave(nx, ny);
      if (!visto.has(k) && libre(nx, ny)) { visto.add(k); cola.push([nx, ny]); }
    }
  }

  return {
    nivel: N.nombre,
    spawnLibre: libre(sx, sy),
    spawnConSuelo: suelo(sx, sy) || suelo(sx, sy + 1),
    salidaAlcanzable: visto.has(clave(ex, ey)),
    casillasAlcanzables: visto.size,
    cristales: N.cristales.length,
    anclas: N.anclas.length
  };
}
