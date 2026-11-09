/* ============================================================
   LOS NIVELES
   Cada nivel es un dibujo en texto. Puedes editarlos a mano.

     #   roca
     ^   pinchos (matan). Se dibujan apuntando hacia fuera de la
         roca en la que se apoyan, así que ponlos siempre pegados
         a algo sólido.
     S   dónde apareces
     E   la salida
     *   cristal: te recarga el dash en el aire
     o   anilla para el gancho
     .   aire

   Las filas se rellenan solas hasta la más larga.
   `habilidades` dice qué sabe hacer el personaje en ese nivel.
   ============================================================ */
'use strict';

const NIVELES = [
  {
    nombre: 'Primeros pasos',
    pista: 'Flechas o A/D para moverte · Espacio para saltar · suéltalo antes para saltar menos',
    habilidades: {},
    mapa: [
      '............................................................',
      '............................................................',
      '............................................................',
      '............................................................',
      '............................................................',
      '............................................................',
      '............................................................',
      '............................................................',
      '......................................................E.....',
      '....................................................########',
      '....................................................########',
      '...........................................#################',
      '..S........................................#################',
      '##########...###########...#################################',
      '##########^^^###########^^^#################################',
      '############################################################'
    ]
  },

  {
    nombre: 'Impulso',
    pista: 'X o J lanza el dash hacia donde estés pulsando · se recarga al tocar suelo o un cristal',
    habilidades: { dash: true },
    mapa: [
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '..................................................................E.....',
      '................................................................########',
      '................................................................########',
      '.....................................*..................################',
      '..S.....................................................################',
      '##############.....###############......################################',
      '##############^^^^^###############^^^^^^################################',
      '########################################################################'
    ]
  },

  {
    nombre: 'La chimenea',
    pista: 'Pégate a una pared cayendo y salta · se encadena de una pared a la otra. Sube hasta arriba',
    habilidades: { dash: true, pared: true },
    mapa: [
      '############################',
      '#########.E.################',
      '#########...################',
      '#########...################',
      '#########...################',
      '#########...################',
      '########^...################',
      '#########...################',
      '#########...################',
      '#########...################',
      '#########...^###############',
      '#########...################',
      '#########...################',
      '#########...################',
      '########^...################',
      '#########...################',
      '#########...################',
      '#########...################',
      '#########.S.################',
      '############################'
    ]
  },

  {
    nombre: 'El abismo',
    pista: 'Mantén Espacio al caer para planear · C o K engancha a la anilla más cercana · ↑ ↓ recogen cuerda',
    habilidades: { dash: true, pared: true, planeo: true, gancho: true },
    mapa: [
      '##########################################################################',
      '##########################################################################',
      '##########################################################################',
      '..................o.......o.......o.......o.......o.......o...............',
      '..........................................................................',
      '...S......................................................................',
      '############..............................................................',
      '############..............................................................',
      '############..................*...............*...........................',
      '############..................................................E...........',
      '############................................................##############',
      '############................................................##############',
      '############................................................##############',
      '############................................................##############',
      '############................................................##############',
      '############................................................##############',
      '############................................................##############',
      '############................................................##############',
      '############^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^##############',
      '##########################################################################'
    ]
  },

  {
    nombre: 'Todo junto',
    pista: 'Chimenea, abismo y salida. Usa todo lo que has aprendido',
    habilidades: { dash: true, pared: true, planeo: true, gancho: true },
    mapa: [
      '########################################################################',
      '########################################################################',
      '########################################################################',
      '#########.................o.......o.......o.......o.......o.............',
      '#########...............................................................',
      '#########...............................................................',
      '#########.....................*...............*.........................',
      '#########...#######.....................................................',
      '#########...#######...................................E.................',
      '#########...#######.................................#####################',
      '########^...#######.................................#####################',
      '#########...#######.................................#####################',
      '#########...#######.................................#####################',
      '#########..^#######.................................#####################',
      '#########...#######.................................#####################',
      '#########...#######.................................#####################',
      '#########.S.#######.................................#####################',
      '####################^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^#####################',
      '########################################################################'
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
      if (c === '*') cristales.push({ x: cx, y: cy, cx: x, cy: y, tomado: false, recarga: 0 });
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

   Recorre el mapa con un personaje DELIBERADAMENTE PEOR que el
   real: salta 3 casillas (el real llega a 3,38), avanza 4 (el
   real 5,44) y el dash recorre 2 (el real 2,26). Si con eso se
   llega a la salida, con el personaje de verdad seguro que sí.

   Lo importante: el estado incluye SI LE QUEDA DASH. La primera
   versión no lo hacía y daba por bueno encadenar dashes infinitos
   en el aire, que es imposible. Por eso coló un nivel 2 que no se
   podía pasar.
   ============================================================ */
const F_GANCHO_DIST = 270;    // debe coincidir con F.ganchoDist de juego.js

function comprobarNivel(N) {
  const { ancho, alto, solido, pincho } = N;
  const H = N.habilidades || {};

  const dentro = (x, y) => x >= 0 && y >= 0 && x < ancho && y < alto;
  const roca = (x, y) => dentro(x, y) && solido[y][x];
  const libre = (x, y) => dentro(x, y) && !solido[y][x] && !pincho[y][x];
  const suelo = (x, y) => roca(x, y + 1);
  const pared = (x, y) => roca(x - 1, y) || roca(x + 1, y);

  const cristal = new Set(N.cristales.map((c) => c.cy * ancho + c.cx));
  const anclasC = N.anclas.map((a) => ({ x: Math.floor(a.x / TILE), y: Math.floor(a.y / TILE) }));
  const R = Math.round(F_GANCHO_DIST / TILE);

  const SALTO = 3, ALCANCE = 4, DASH = 2;

  const sx = Math.floor(N.spawn.x / TILE), sy = Math.floor(N.spawn.y / TILE);
  const ex = Math.floor(N.salida.x / TILE), ey = Math.floor(N.salida.y / TILE);

  // estado = casilla + si le queda dash
  const clave = (x, y, d) => (y * ancho + x) * 2 + (d ? 1 : 0);
  const visto = new Set();
  const cola = [];

  function meter(x, y, d) {
    if (!libre(x, y)) return;
    // recargar el dash al pisar suelo, tocar pared (si sabe) o coger un cristal
    if (suelo(x, y) || (H.pared && pared(x, y)) || cristal.has(y * ancho + x)) d = true;
    const k = clave(x, y, d);
    if (visto.has(k)) return;
    visto.add(k);
    cola.push([x, y, d]);
  }

  meter(sx, sy, true);

  while (cola.length) {
    const [x, y, dash] = cola.shift();
    const enSuelo = suelo(x, y);
    const enPared = H.pared && pared(x, y);

    // caer, derivando un poco de lado
    if (libre(x, y + 1)) {
      meter(x, y + 1, dash);
      meter(x - 1, y + 1, dash);
      meter(x + 1, y + 1, dash);
    }
    // andar: solo pisando algo
    if (enSuelo) { meter(x - 1, y, dash); meter(x + 1, y, dash); }
    // saltar: solo desde suelo o pared
    if (enSuelo || enPared) {
      for (let dy = 1; dy <= SALTO; dy++)
        for (let dx = -ALCANCE; dx <= ALCANCE; dx++)
          meter(x + dx, y - dy, dash);
    }
    // dash: GASTA la carga, y hay que tenerla
    if (H.dash && dash) {
      for (const [ux, uy] of [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]]) {
        for (let d = 1; d <= DASH; d++) {
          const nx = x + ux * d, ny = y + uy * d;
          if (!libre(nx, ny)) break;
          meter(nx, ny, false);
        }
      }
    }
    // planeo: cayendo avanzas mucho más de lado
    if (H.planeo && libre(x, y + 1)) {
      for (let dx = -4; dx <= 4; dx++) meter(x + dx, y + 1, dash);
    }
    // gancho: con una anilla a tiro puedes acabar colgando en su radio
    if (H.gancho) {
      for (const a of anclasC) {
        if (Math.hypot(a.x - x, a.y - y) > R) continue;
        for (let dy = 0; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            if (Math.hypot(dx, dy) > R) continue;
            meter(a.x + dx, a.y + dy, dash);
          }
      }
    }
  }

  const llega = visto.has(clave(ex, ey, true)) || visto.has(clave(ex, ey, false));
  return {
    nivel: N.nombre,
    spawnLibre: libre(sx, sy),
    salidaAlcanzable: llega,
    estadosAlcanzables: visto.size,
    cristales: N.cristales.length,
    anclas: N.anclas.length
  };
}

function comprobarTodos() {
  return NIVELES.map((d) => {
    try { return comprobarNivel(prepararNivel(d)); }
    catch (e) { return { nivel: d.nombre, ERROR: e.message }; }
  });
}
