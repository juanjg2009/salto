/* ============================================================
   SALTO — plataformas de precisión
   Todo el trabajo está en que moverse dé gusto. Los números de
   aquí abajo NO son física real: son trampas cuidadosamente
   elegidas para que el personaje responda como esperas.
   ============================================================ */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ============================================================
   LOS NÚMEROS DE LA SENSACIÓN
   Si tocas algo, toca esto. Cada línea cambia cómo se siente.
   ============================================================ */
const F = {
  // --- correr ---
  velMax:      195,   // px por segundo
  acelSuelo:   2100,  // tarda 0,09 s en ir a tope
  frenSuelo:   2900,  // frena más rápido de lo que acelera: se siente firme
  acelAire:    1500,
  frenAire:    800,   // en el aire frenas poco: conservas el impulso
  giro:        2.1,   // cambiar de sentido es MÁS rápido que acelerar

  // --- saltar ---
  saltoV:      500,   // sube 3,2 casillas
  gravSube:    1500,
  gravBaja:    2150,  // caes más rápido de lo que subes. La trampa nº1.
  gravCorte:   3300,  // si sueltas el botón pronto, cortas la subida
  gravPico:    950,   // cerca del punto más alto la gravedad baja: flotas un instante
  picoVent:    115,   // a qué velocidad vertical empieza ese "pico"
  caidaMax:    780,

  // --- los perdones (invisibles, imprescindibles) ---
  coyote:      0.10,  // puedes saltar 0,1 s después de salirte del borde
  memoria:     0.12,  // si pulsas 0,12 s antes de aterrizar, el salto sale igual
  esquina:     8,     // px que te empuja de lado si te comes un pico de refilón

  // --- dash ---
  dashV:       470,
  dashT:       0.13,
  dashFin:     0.55,  // qué parte de la velocidad conservas al terminar
  dashEspera:  0.10,
  dashHielo:   0.05,  // segundos de imagen congelada al lanzarlo

  // --- pared ---
  paredDesliz: 95,
  paredSaltoX: 260,
  paredSaltoY: 455,
  paredBloqueo:0.15,  // tus controles no responden un instante: evita pelear con el salto
  paredCoyote: 0.10,

  // --- planeo ---
  planeoGrav:  430,
  planeoMax:   135,
  planeoRetraso: 0.08, // no planeas hasta que llevas un poco cayendo

  // --- gancho ---
  ganchoDist:  270,
  ganchoCarr:  150,   // velocidad al recoger o soltar cuerda
  ganchoMin:   40,
  ganchoSalto: 330,   // impulso al soltarte con salto

  // --- cuerpo ---
  ancho: 16, alto: 22
};

const PASO = 1 / 120;          // la física va siempre a 120 pasos por segundo

/* ============================================================
   ENTRADA
   ============================================================ */
const MAPA_TECLAS = {
  izq: ['ArrowLeft', 'a', 'A'],
  der: ['ArrowRight', 'd', 'D'],
  arr: ['ArrowUp', 'w', 'W'],
  aba: ['ArrowDown', 's', 'S'],
  salto: [' ', 'z', 'Z'],
  dash: ['x', 'X', 'j', 'J'],
  gancho: ['c', 'C', 'k', 'K', 'Shift']
};
const T = { izq: 0, der: 0, arr: 0, aba: 0, salto: 0, dash: 0, gancho: 0 };
const pulsadoAhora = {};       // se puso a 1 en este paso

function accionDe(key) {
  for (const [a, teclas] of Object.entries(MAPA_TECLAS)) if (teclas.includes(key)) return a;
  return null;
}

/* ============================================================
   ESTADO
   ============================================================ */
const J = {
  nivel: null, iNivel: 0,
  p: null,
  camara: { x: 0, y: 0 },
  particulas: [],
  temblor: 0,
  congelacion: 0,
  muertes: 0, tiempo: 0,
  estado: 'menu',              // menu | jugando | muerto | completado
  tMuerte: 0, tFin: 0,
  mejores: {},
  ctx: null, audio: null
};

function nuevoJugador(spawn) {
  return {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    suelo: false, mira: 1,
    tCoyote: 0, tMemoria: 0, saltando: false,
    dashes: 1, dashT: 0, dashDx: 0, dashDy: 0, tDash: -9,
    pared: 0, tParedCoyote: 0, paredUltima: 0, bloqueo: 0,
    planeando: false, tCayendo: 0,
    gancho: null, largoCuerda: 0,
    estira: 1, aplasta: 1
  };
}

/* ============================================================
   SONIDO
   Pequeños sonidos sintetizados. Sin ficheros de audio.
   ============================================================ */
function crearAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.3;
  master.connect(ctx.destination);

  const ruido = (() => {
    const n = ctx.sampleRate * 0.5;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  function tono(f1, f2, dur, tipo = 'triangle', vol = 0.5) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function chasquido(f, dur, vol = 0.4, q = 1) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = ruido; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }

  return {
    ctx,
    salto:   () => tono(340, 620, 0.12, 'triangle', 0.4),
    dash:    () => { tono(820, 160, 0.16, 'sawtooth', 0.28); chasquido(2400, 0.14, 0.3, 0.7); },
    tierra:  (f) => { tono(150, 70, 0.1, 'sine', Math.min(0.5, 0.15 + f * 0.4)); chasquido(600, 0.06, 0.15 + f * 0.2); },
    pared:   () => { tono(260, 420, 0.1, 'square', 0.22); chasquido(1600, 0.05, 0.14); },
    muerte:  () => { tono(300, 50, 0.4, 'sawtooth', 0.35); chasquido(900, 0.3, 0.3); },
    cristal: () => { tono(900, 1500, 0.12, 'sine', 0.3); tono(1350, 2100, 0.16, 'sine', 0.16); },
    gancho:  () => { chasquido(1800, 0.07, 0.3, 2); tono(520, 760, 0.1, 'square', 0.16); },
    meta:    () => [0, 4, 7, 12].forEach((s, i) => setTimeout(() => tono(523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.22, 'triangle', 0.3), i * 85))
  };
}
const sonar = (n, a) => { if (J.audio) try { J.audio[n](a); } catch (e) {} };

/* ============================================================
   MAPA Y COLISIONES
   ============================================================ */
const solidoEn = (cx, cy) => {
  const N = J.nivel;
  if (cx < 0 || cy < 0 || cx >= N.ancho || cy >= N.alto) return false;
  return N.solido[cy][cx];
};
const pinchoEn = (cx, cy) => {
  const N = J.nivel;
  if (cx < 0 || cy < 0 || cx >= N.ancho || cy >= N.alto) return false;
  return N.pincho[cy][cx];
};

/* ¿Hay algún bloque dentro de esta caja? */
function chocaCaja(x, y, w, h) {
  const x0 = Math.floor((x - w / 2) / TILE), x1 = Math.floor((x + w / 2 - 0.01) / TILE);
  const y0 = Math.floor((y - h / 2) / TILE), y1 = Math.floor((y + h / 2 - 0.01) / TILE);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (solidoEn(cx, cy)) return true;
  return false;
}
function tocaPincho(x, y, w, h) {
  const m = 4;                                   // margen: los pinchos perdonan un poco
  const x0 = Math.floor((x - w / 2 + m) / TILE), x1 = Math.floor((x + w / 2 - m) / TILE);
  const y0 = Math.floor((y - h / 2 + m) / TILE), y1 = Math.floor((y + h / 2 - m) / TILE);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (pinchoEn(cx, cy)) return true;
  return false;
}

/* Mueve en un eje y se para al chocar. Devuelve si chocó. */
function moverEje(p, dx, dy) {
  const w = F.ancho, h = F.alto;
  if (dx) {
    p.x += dx;
    if (chocaCaja(p.x, p.y, w, h)) {
      const signo = Math.sign(dx);
      const borde = signo > 0
        ? Math.floor((p.x + w / 2) / TILE) * TILE - w / 2 - 0.01
        : (Math.floor((p.x - w / 2) / TILE) + 1) * TILE + w / 2 + 0.01;
      p.x = borde;
      return true;
    }
  }
  if (dy) {
    p.y += dy;
    if (chocaCaja(p.x, p.y, w, h)) {
      /* --- perdón en las esquinas ---
         Si subiendo te comes un pico por poco, te empuja de lado
         en vez de pararte en seco. Es el detalle que más
         frustración quita de todo el juego. */
      if (dy < 0) {
        for (let d = 1; d <= F.esquina; d++) {
          if (!chocaCaja(p.x + d, p.y, w, h)) { p.x += d; return false; }
          if (!chocaCaja(p.x - d, p.y, w, h)) { p.x -= d; return false; }
        }
      }
      const signo = Math.sign(dy);
      const borde = signo > 0
        ? Math.floor((p.y + h / 2) / TILE) * TILE - h / 2 - 0.01
        : (Math.floor((p.y - h / 2) / TILE) + 1) * TILE + h / 2 + 0.01;
      p.y = borde;
      return true;
    }
  }
  return false;
}

const hayPared = (p, lado) => chocaCaja(p.x + lado * 3, p.y, F.ancho, F.alto - 6);

/* ============================================================
   FÍSICA DEL JUGADOR
   ============================================================ */
function actualizarJugador(dt) {
  const p = J.p;
  const H = J.nivel.habilidades;
  const ejeX = (T.der ? 1 : 0) - (T.izq ? 1 : 0);
  const ejeY = (T.aba ? 1 : 0) - (T.arr ? 1 : 0);

  if (ejeX) p.mira = ejeX;
  p.bloqueo = Math.max(0, p.bloqueo - dt);
  p.tCoyote = Math.max(0, p.tCoyote - dt);
  p.tParedCoyote = Math.max(0, p.tParedCoyote - dt);
  p.tMemoria = Math.max(0, p.tMemoria - dt);

  /* ---------- DASH (manda sobre todo lo demás) ---------- */
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashDx * F.dashV;
    p.vy = p.dashDy * F.dashV;
    if (p.dashT <= 0) { p.vx *= F.dashFin; p.vy *= F.dashFin; }
    if (Math.random() < 0.7) estela(p.x, p.y);
  } else {
    /* ---------- movimiento horizontal ---------- */
    if (p.bloqueo <= 0) {
      const objetivo = ejeX * F.velMax;
      let a = p.suelo ? (ejeX ? F.acelSuelo : F.frenSuelo) : (ejeX ? F.acelAire : F.frenAire);
      if (ejeX && Math.sign(ejeX) !== Math.sign(p.vx) && p.vx !== 0) a *= F.giro;
      if (p.vx < objetivo) p.vx = Math.min(objetivo, p.vx + a * dt);
      else if (p.vx > objetivo) p.vx = Math.max(objetivo, p.vx - a * dt);
    }

    /* ---------- gravedad ---------- */
    let g;
    if (p.vy < 0) g = (!T.salto && p.saltando) ? F.gravCorte : F.gravSube;
    else g = F.gravBaja;
    if (Math.abs(p.vy) < F.picoVent && !p.suelo) g = F.gravPico;   // flotar en el pico

    /* ---------- planeo ---------- */
    p.planeando = false;
    if (H.planeo && !p.suelo && p.vy > 0 && T.salto && p.tCayendo > F.planeoRetraso && !p.gancho) {
      p.planeando = true;
      g = F.planeoGrav;
    }

    if (!p.gancho) p.vy += g * dt;

    const techo = p.planeando ? F.planeoMax : F.caidaMax;
    if (p.vy > techo) p.vy = Math.max(techo, p.vy - 4000 * dt);

    /* ---------- deslizar por la pared ---------- */
    p.pared = 0;
    if (H.pared && !p.suelo && !p.gancho) {
      if (hayPared(p, 1) && ejeX > 0) p.pared = 1;
      else if (hayPared(p, -1) && ejeX < 0) p.pared = -1;
      if (p.pared) {
        p.paredUltima = p.pared;
        p.tParedCoyote = F.paredCoyote;
        if (p.vy > F.paredDesliz) p.vy = F.paredDesliz;
        if (Math.random() < 0.25) polvo(p.x + p.pared * 8, p.y + (Math.random() - 0.5) * 16, -p.pared * 25, -20, 2);
      }
    }
  }

  /* ---------- gancho ---------- */
  if (H.gancho) actualizarGancho(p, ejeY, dt);

  /* ---------- saltos ---------- */
  if (p.tMemoria > 0) {
    if (p.suelo || p.tCoyote > 0) saltar(p);
    else if (p.pared || p.tParedCoyote > 0) saltoPared(p);
    else if (p.gancho) soltarGanchoConSalto(p);
  }

  /* ---------- mover y colisionar ---------- */
  const antesVy = p.vy;
  if (moverEje(p, p.vx * dt, 0)) p.vx = 0;
  const chocoY = moverEje(p, 0, p.vy * dt);

  const estabaEnSuelo = p.suelo;
  p.suelo = chocaCaja(p.x, p.y + 2, F.ancho, F.alto);

  if (chocoY) {
    if (antesVy > 0 && p.suelo) {
      // aterrizaje
      const fuerza = Math.min(1, antesVy / 700);
      if (!estabaEnSuelo) {
        sonar('tierra', fuerza);
        p.aplasta = 1 + fuerza * 0.45;
        p.estira = 1 - fuerza * 0.3;
        J.temblor = Math.max(J.temblor, fuerza * 5);
        if (fuerza > 0.45) J.congelacion = Math.max(J.congelacion, 0.035);
        for (let i = 0; i < 4 + fuerza * 8; i++)
          polvo(p.x + (Math.random() - 0.5) * 14, p.y + F.alto / 2,
                (Math.random() - 0.5) * 140, -Math.random() * 60, 2 + Math.random() * 2);
      }
    }
    p.vy = 0;
  }

  if (p.suelo) {
    p.tCoyote = F.coyote;
    p.saltando = false;
    p.tCayendo = 0;
    if (p.dashT <= 0 && J.tiempo - p.tDash > F.dashEspera) p.dashes = 1;
  } else {
    p.tCayendo += dt;
  }
  if (p.pared && p.dashT <= 0 && J.tiempo - p.tDash > F.dashEspera) p.dashes = 1;

  /* ---------- lanzar dash ---------- */
  if (pulsadoAhora.dash && H.dash && p.dashes > 0 && p.dashT <= 0 && J.tiempo - p.tDash > F.dashEspera) {
    let dx = ejeX, dy = ejeY;
    if (!dx && !dy) { dx = p.mira; dy = 0; }
    const n = Math.hypot(dx, dy) || 1;
    p.dashDx = dx / n; p.dashDy = dy / n;
    p.dashT = F.dashT;
    p.dashes--;
    p.tDash = J.tiempo;
    p.saltando = false;
    if (p.gancho) p.gancho = null;
    J.congelacion = Math.max(J.congelacion, F.dashHielo);
    J.temblor = Math.max(J.temblor, 4);
    sonar('dash');
    for (let i = 0; i < 10; i++)
      polvo(p.x, p.y, -p.dashDx * (60 + Math.random() * 140), -p.dashDy * (60 + Math.random() * 140), 2 + Math.random() * 2);
  }

  /* ---------- deformación elástica ---------- */
  p.aplasta += (1 - p.aplasta) * Math.min(1, 14 * dt);
  p.estira += (1 - p.estira) * Math.min(1, 14 * dt);
  if (!p.suelo && p.dashT <= 0) {
    const t = Math.max(-1, Math.min(1, p.vy / 600));
    p.aplasta += ((1 - t * 0.18) - p.aplasta) * Math.min(1, 8 * dt);
    p.estira += ((1 + t * 0.18) - p.estira) * Math.min(1, 8 * dt);
  }

  /* ---------- cristales ---------- */
  for (const c of J.nivel.cristales) {
    if (c.tomado) { c.recarga -= dt; if (c.recarga <= 0) c.tomado = false; continue; }
    if (Math.hypot(c.x - p.x, c.y - p.y) < 20) {
      c.tomado = true; c.recarga = 2.2;
      p.dashes = 1;
      sonar('cristal');
      J.temblor = Math.max(J.temblor, 3);
      for (let i = 0; i < 12; i++)
        polvo(c.x, c.y, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 2, '#e8e6e0');
    }
  }

  /* ---------- muerte y meta ---------- */
  if (tocaPincho(p.x, p.y, F.ancho, F.alto) || p.y > J.nivel.altoPx + 200) morir();
  const s = J.nivel.salida;
  if (Math.abs(p.x - s.x) < 20 && Math.abs(p.y - s.y) < 24) completar();
}

function saltar(p) {
  p.vy = -F.saltoV;
  p.suelo = false; p.saltando = true;
  p.tCoyote = 0; p.tMemoria = 0; p.tCayendo = 0;
  p.aplasta = 0.72; p.estira = 1.3;
  sonar('salto');
  for (let i = 0; i < 6; i++)
    polvo(p.x + (Math.random() - 0.5) * 12, p.y + F.alto / 2,
          (Math.random() - 0.5) * 90, Math.random() * 40, 2);
}

function saltoPared(p) {
  const lado = p.pared || p.paredUltima;
  p.vy = -F.paredSaltoY;
  p.vx = -lado * F.paredSaltoX;
  p.bloqueo = F.paredBloqueo;
  p.saltando = true;
  p.mira = -lado;
  p.tMemoria = 0; p.tParedCoyote = 0; p.tCayendo = 0;
  p.aplasta = 0.75; p.estira = 1.25;
  J.temblor = Math.max(J.temblor, 3);
  sonar('pared');
  for (let i = 0; i < 8; i++)
    polvo(p.x + lado * 8, p.y + (Math.random() - 0.5) * 18,
          -lado * (40 + Math.random() * 120), (Math.random() - 0.5) * 100, 2);
}

/* ============================================================
   GANCHO
   La cuerda no tira del personaje: le IMPIDE alejarse. Cada paso,
   si se ha pasado del largo, se le devuelve al círculo y se le
   quita la parte de la velocidad que iba hacia fuera. Lo que
   queda es la parte que gira — y eso es un péndulo.
   ============================================================ */
function hayVista(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const pasos = Math.ceil(d / 6);
  for (let i = 1; i < pasos; i++) {
    const t = i / pasos;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (solidoEn(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
  }
  return true;
}

function anclaMasCerca(p) {
  let mejor = null, mejorD = F.ganchoDist;
  for (const a of J.nivel.anclas) {
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < mejorD && hayVista(p.x, p.y, a.x, a.y)) { mejor = a; mejorD = d; }
  }
  return mejor;
}

function actualizarGancho(p, ejeY, dt) {
  if (pulsadoAhora.gancho && !p.gancho) {
    const a = anclaMasCerca(p);
    if (a) {
      p.gancho = a;
      p.largoCuerda = Math.max(F.ganchoMin, Math.hypot(a.x - p.x, a.y - p.y));
      sonar('gancho');
      J.temblor = Math.max(J.temblor, 2);
    }
  }
  if (p.gancho && !T.gancho) p.gancho = null;
  if (!p.gancho) return;

  // recoger o soltar cuerda
  if (ejeY) p.largoCuerda = Math.max(F.ganchoMin, p.largoCuerda + ejeY * F.ganchoCarr * dt);

  // la gravedad sigue actuando: es lo que hace que el péndulo oscile
  p.vy += F.gravBaja * 0.85 * dt;

  // empujar un poco con las flechas para coger carrerilla
  const ejeX = (T.der ? 1 : 0) - (T.izq ? 1 : 0);
  if (ejeX) p.vx += ejeX * 520 * dt;

  // la restricción de la cuerda
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  const dx = nx - p.gancho.x, dy = ny - p.gancho.y;
  const d = Math.hypot(dx, dy) || 0.001;
  if (d > p.largoCuerda) {
    const ux = dx / d, uy = dy / d;
    const cx = p.gancho.x + ux * p.largoCuerda;
    const cy = p.gancho.y + uy * p.largoCuerda;
    p.vx = (cx - p.x) / dt;
    p.vy = (cy - p.y) / dt;
  }
  if (Math.random() < 0.3) estela(p.x, p.y, '#55555f');
}

function soltarGanchoConSalto(p) {
  p.gancho = null;
  p.vy = Math.min(p.vy, 0) - F.ganchoSalto;
  p.saltando = true;
  p.tMemoria = 0;
  p.aplasta = 0.8; p.estira = 1.2;
  sonar('salto');
}

/* ============================================================
   PARTÍCULAS
   ============================================================ */
function polvo(x, y, vx, vy, tam, color) {
  J.particulas.push({ x, y, vx, vy, tam, vida: 0.35 + Math.random() * 0.3, max: 0.65, color: color || '#6a6a74', grav: 420 });
}
function estela(x, y, color) {
  J.particulas.push({ x, y, vx: 0, vy: 0, tam: 7, vida: 0.22, max: 0.22, color: color || '#ff5a3c', grav: 0 });
}
function actualizarParticulas(dt) {
  for (let i = J.particulas.length - 1; i >= 0; i--) {
    const q = J.particulas[i];
    q.vida -= dt;
    if (q.vida <= 0) { J.particulas.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.grav * dt;
  }
}

/* ============================================================
   MUERTE Y META
   Morir tiene que costar menos de medio segundo. Si castiga, la
   dificultad deja de ser divertida.
   ============================================================ */
function morir() {
  if (J.estado !== 'jugando') return;
  J.estado = 'muerto';
  J.tMuerte = 0;
  J.muertes++;
  J.temblor = 9;
  J.congelacion = 0.06;
  sonar('muerte');
  const p = J.p;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 260;
    J.particulas.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      tam: 2 + Math.random() * 3, vida: 0.4 + Math.random() * 0.3, max: 0.7, color: '#ff5a3c', grav: 500 });
  }
  actualizarHUD();
}

function reaparecer() {
  J.p = nuevoJugador(J.nivel.spawn);
  J.estado = 'jugando';
  J.nivel.cristales.forEach((c) => { c.tomado = false; c.recarga = 0; });
}

function completar() {
  if (J.estado !== 'jugando') return;
  J.estado = 'completado';
  J.tFin = 0;
  sonar('meta');
  J.temblor = 6;
  const s = J.nivel.salida;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 280;
    J.particulas.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      tam: 2 + Math.random() * 3, vida: 0.5 + Math.random() * 0.6, max: 1.1, color: '#ff5a3c', grav: 240 });
  }
  const clave = J.iNivel;
  const previo = J.mejores[clave];
  if (!previo || J.tiempo < previo.tiempo) {
    J.mejores[clave] = { tiempo: J.tiempo, muertes: J.muertes };
    try { localStorage.setItem('salto-mejores', JSON.stringify(J.mejores)); } catch (e) {}
  }
}

/* ============================================================
   CÁMARA
   ============================================================ */
function actualizarCamara(dt, instante) {
  const p = J.p;
  const cv = $('#lienzo');
  const anchoV = cv.clientWidth, altoV = cv.clientHeight;

  let tx = p.x + p.mira * 46 + p.vx * 0.14;
  let ty = p.y + 8 + p.vy * 0.06;

  tx = Math.max(anchoV / 2, Math.min(J.nivel.anchoPx - anchoV / 2, tx));
  ty = Math.max(altoV / 2, Math.min(J.nivel.altoPx - altoV / 2, ty));
  if (J.nivel.anchoPx < anchoV) tx = J.nivel.anchoPx / 2;
  if (J.nivel.altoPx < altoV) ty = J.nivel.altoPx / 2;

  if (instante) { J.camara.x = tx; J.camara.y = ty; return; }
  const k = 1 - Math.exp(-7.5 * dt);
  J.camara.x += (tx - J.camara.x) * k;
  J.camara.y += (ty - J.camara.y) * k;
}

/* ============================================================
   DIBUJO
   Blanco y negro, con un único color para lo que importa.
   ============================================================ */
const COL = {
  fondo: '#0b0b0d',
  rejilla: '#141419',
  bloque: '#2a2a30',
  bloqueAlto: '#3d3d46',
  pincho: '#d9d7d1',
  acento: '#ff5a3c',
  gastado: '#7a7a85',
  claro: '#e8e6e0'
};

function dibujar() {
  const cv = $('#lienzo');
  const g = J.ctx;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  g.fillStyle = COL.fondo;
  g.fillRect(0, 0, w, h);
  if (!J.nivel) return;

  const tem = J.temblor;
  const ox = Math.round(w / 2 - J.camara.x + (Math.random() - 0.5) * tem);
  const oy = Math.round(h / 2 - J.camara.y + (Math.random() - 0.5) * tem);

  /* --- fondo con paralaje --- */
  g.save();
  g.translate(ox * 0.35, oy * 0.35);
  g.strokeStyle = COL.rejilla; g.lineWidth = 1;
  const sep = 78;
  const x0 = Math.floor((-ox * 0.35) / sep) * sep, y0 = Math.floor((-oy * 0.35) / sep) * sep;
  for (let x = x0; x < x0 + w + sep; x += sep) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h + sep); g.stroke(); }
  for (let y = y0; y < y0 + h + sep; y += sep) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w + sep, y); g.stroke(); }
  g.restore();

  g.save();
  g.translate(ox, oy);

  const N = J.nivel;
  const cx0 = Math.max(0, Math.floor((-ox) / TILE) - 1);
  const cx1 = Math.min(N.ancho - 1, Math.floor((-ox + w) / TILE) + 1);
  const cy0 = Math.max(0, Math.floor((-oy) / TILE) - 1);
  const cy1 = Math.min(N.alto - 1, Math.floor((-oy + h) / TILE) + 1);

  /* --- bloques --- */
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      if (!N.solido[y][x]) continue;
      const px = x * TILE, py = y * TILE;
      g.fillStyle = COL.bloque;
      g.fillRect(px, py, TILE, TILE);
      if (!solidoEn(x, y - 1)) { g.fillStyle = COL.bloqueAlto; g.fillRect(px, py, TILE, 3); }
    }
  }

  /* --- pinchos --- */
  g.fillStyle = COL.pincho;
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      if (!N.pincho[y][x]) continue;
      const px = x * TILE, py = y * TILE;
      const n = 3, an = TILE / n;
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.moveTo(px + i * an, py + TILE);
        g.lineTo(px + i * an + an / 2, py + TILE * 0.38);
        g.lineTo(px + (i + 1) * an, py + TILE);
        g.closePath(); g.fill();
      }
    }
  }

  /* --- anclas del gancho --- */
  for (const a of N.anclas) {
    const cerca = J.p && Math.hypot(a.x - J.p.x, a.y - J.p.y) < F.ganchoDist && hayVista(J.p.x, J.p.y, a.x, a.y);
    g.strokeStyle = cerca ? COL.acento : COL.gastado;
    g.lineWidth = 2;
    g.beginPath(); g.arc(a.x, a.y, 7, 0, Math.PI * 2); g.stroke();
    if (cerca) {
      g.globalAlpha = 0.28;
      g.beginPath(); g.arc(a.x, a.y, 12 + Math.sin(J.tiempo * 6) * 2, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
  }

  /* --- cristales de dash --- */
  for (const c of N.cristales) {
    g.save(); g.translate(c.x, c.y); g.rotate(J.tiempo * 1.6);
    if (c.tomado) { g.globalAlpha = 0.2; g.strokeStyle = COL.gastado; }
    else { g.strokeStyle = COL.claro; g.fillStyle = COL.claro; }
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 0); g.lineTo(0, 9); g.lineTo(-7, 0); g.closePath();
    c.tomado ? g.stroke() : (g.globalAlpha = 0.85, g.fill());
    g.restore(); g.globalAlpha = 1;
  }

  /* --- la salida --- */
  const s = N.salida;
  g.strokeStyle = COL.acento; g.lineWidth = 2.5;
  const pulso = 13 + Math.sin(J.tiempo * 3.5) * 2.5;
  g.beginPath(); g.arc(s.x, s.y, pulso, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.35;
  g.beginPath(); g.arc(s.x, s.y, pulso + 7, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = COL.acento;
  g.beginPath(); g.arc(s.x, s.y, 4, 0, Math.PI * 2); g.fill();

  /* --- partículas --- */
  for (const q of J.particulas) {
    g.globalAlpha = Math.max(0, q.vida / q.max);
    g.fillStyle = q.color;
    const t = q.tam * (q.vida / q.max);
    g.fillRect(q.x - t / 2, q.y - t / 2, t, t);
  }
  g.globalAlpha = 1;

  /* --- cuerda del gancho --- */
  const p = J.p;
  if (p && p.gancho) {
    g.strokeStyle = COL.claro; g.lineWidth = 2;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.gancho.x, p.gancho.y); g.stroke();
    g.fillStyle = COL.claro;
    g.beginPath(); g.arc(p.gancho.x, p.gancho.y, 4, 0, Math.PI * 2); g.fill();
  }

  /* --- el personaje --- */
  if (p && J.estado !== 'muerto') {
    const an = F.ancho * p.estira, al = F.alto * p.aplasta;
    g.save();
    g.translate(p.x, p.y);

    if (p.planeando) {                        // alitas al planear
      g.strokeStyle = COL.gastado; g.lineWidth = 2;
      const f = Math.sin(J.tiempo * 16) * 3;
      g.beginPath(); g.moveTo(-an / 2, 0); g.lineTo(-an / 2 - 11, -4 + f); g.stroke();
      g.beginPath(); g.moveTo(an / 2, 0); g.lineTo(an / 2 + 11, -4 + f); g.stroke();
    }

    const tieneDash = p.dashes > 0;
    g.fillStyle = tieneDash ? COL.acento : 'transparent';
    g.strokeStyle = tieneDash ? COL.acento : COL.gastado;
    g.lineWidth = 2.5;
    redondeado(g, -an / 2, -al / 2, an, al, 5);
    if (tieneDash) g.fill(); else g.stroke();

    // ojos: dicen hacia dónde miras, y es lo que lo hace "alguien"
    g.fillStyle = COL.fondo;
    const ex = p.mira * 2.5;
    g.fillRect(ex - 4.5, -al / 6, 2.5, 4);
    g.fillRect(ex + 2, -al / 6, 2.5, 4);
    g.restore();
  }

  g.restore();
}

function redondeado(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

/* ============================================================
   HUD, MENÚ, NIVELES
   ============================================================ */
const reloj = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

function actualizarHUD() {
  $('#hNivel').textContent = `${J.iNivel + 1}/${NIVELES.length} · ${J.nivel.nombre}`;
  $('#hTiempo').textContent = reloj(J.tiempo);
  $('#hMuertes').textContent = J.muertes;
  const m = J.mejores[J.iNivel];
  $('#hMejor').textContent = m ? reloj(m.tiempo) : '—';
  $('#pista').textContent = J.nivel.pista;
}

function cargarNivel(i) {
  J.iNivel = i;
  J.nivel = prepararNivel(NIVELES[i]);
  J.muertes = 0; J.tiempo = 0;
  J.particulas.length = 0;
  J.temblor = 0; J.congelacion = 0;
  reaparecer();
  actualizarCamara(0, true);
  actualizarHUD();
  $('#menu').hidden = true;
  $('#fin').hidden = true;
  pintarHabilidades();
}

function pintarHabilidades() {
  const H = J.nivel.habilidades;
  const lista = [
    ['Saltar', true, 'Espacio'],
    ['Dash', !!H.dash, 'X'],
    ['Pared', !!H.pared, '—'],
    ['Planeo', !!H.planeo, 'mantén Espacio'],
    ['Gancho', !!H.gancho, 'C']
  ];
  $('#habilidades').innerHTML = lista.map(([n, activa, t]) =>
    `<span class="hab ${activa ? 'on' : ''}">${n}<i>${activa ? t : 'bloqueado'}</i></span>`).join('');
}

function abrirMenu() {
  $('#menu').hidden = false;
  $('#listaNiveles').innerHTML = NIVELES.map((n, i) => {
    const m = J.mejores[i];
    return `<button type="button" class="niv" data-nivel="${i}">
      <span class="niv-n">${i + 1}</span>
      <span class="niv-t">${n.nombre}</span>
      <span class="niv-m">${m ? reloj(m.tiempo) + ' · ' + m.muertes + ' muertes' : 'sin terminar'}</span>
    </button>`;
  }).join('');
  $$('[data-nivel]').forEach((b) => b.addEventListener('click', () => cargarNivel(+b.dataset.nivel)));
}

/* ============================================================
   BUCLE
   Paso fijo: la física se calcula siempre 120 veces por segundo,
   pase lo que pase con los fotogramas. Así el juego se siente
   igual en cualquier ordenador y los saltos son reproducibles.
   ============================================================ */
let acumulado = 0, tAnterior = 0;

function bucle(ms) {
  requestAnimationFrame(bucle);
  const t = ms / 1000;
  let dt = tAnterior ? t - tAnterior : 0;
  tAnterior = t;
  if (dt > 0.25) dt = 0.25;

  J.temblor *= Math.pow(0.0015, dt);
  if (J.temblor < 0.15) J.temblor = 0;

  /* Imagen congelada: ni se simula ni se borran las teclas recién
     pulsadas, para no comerse un dash lanzado durante el parón. */
  if (J.congelacion > 0) {
    J.congelacion -= dt;
    dibujar();
    return;
  }

  acumulado += dt;
  let n = 0;
  while (acumulado >= PASO && n++ < 8) {
    paso(PASO);
    acumulado -= PASO;
    for (const k in pulsadoAhora) delete pulsadoAhora[k];
  }

  if (J.nivel) actualizarCamara(dt, false);
  dibujar();
}

function paso(dt) {
  if (!J.nivel) return;
  actualizarParticulas(dt);

  if (J.estado === 'jugando') {
    J.tiempo += dt;
    actualizarJugador(dt);
    if (Math.floor(J.tiempo * 20) % 2 === 0) $('#hTiempo').textContent = reloj(J.tiempo);
  } else if (J.estado === 'muerto') {
    J.tMuerte += dt;
    if (J.tMuerte > 0.3) reaparecer();        // reaparecer rápido: morir no castiga
  } else if (J.estado === 'completado') {
    J.tFin += dt;
    if (J.tFin > 1.1) mostrarFin();
  }
}

function mostrarFin() {
  if (!$('#fin').hidden) return;
  const ultimo = J.iNivel >= NIVELES.length - 1;
  $('#finTitulo').textContent = ultimo ? '¡Te los has pasado todos!' : '¡Nivel superado!';
  $('#finDatos').innerHTML =
    `<span><b>${reloj(J.tiempo)}</b>tiempo</span><span><b>${J.muertes}</b>muertes</span>`;
  $('#btnSiguiente').textContent = ultimo ? 'Volver al menú' : 'Siguiente nivel →';
  $('#btnSiguiente').onclick = () => (ultimo ? abrirMenu() : cargarNivel(J.iNivel + 1));
  $('#fin').hidden = false;
}

/* ============================================================
   ARRANQUE
   ============================================================ */
function eventos() {
  addEventListener('keydown', (e) => {
    const a = accionDe(e.key);
    if (!a) {
      if (e.key === 'r' || e.key === 'R') { if (J.nivel && J.estado === 'jugando') morir(); }
      if (e.key === 'Escape') abrirMenu();
      return;
    }
    e.preventDefault();
    if (!T[a]) pulsadoAhora[a] = 1;
    T[a] = 1;
    if (a === 'salto' && J.p) J.p.tMemoria = F.memoria;   // memoria del botón
    if (!J.audio) { J.audio = crearAudio(); }
    if (J.audio && J.audio.ctx.state === 'suspended') J.audio.ctx.resume();
  });

  addEventListener('keyup', (e) => {
    const a = accionDe(e.key);
    if (a) { T[a] = 0; e.preventDefault(); }
  });

  addEventListener('blur', () => { for (const k in T) T[k] = 0; });

  $('#btnMenu').addEventListener('click', abrirMenu);
  $('#btnReinicio').addEventListener('click', () => cargarNivel(J.iNivel));
  $('#btnEmpezar').addEventListener('click', () => cargarNivel(0));
}

(function init() {
  J.ctx = $('#lienzo').getContext('2d');
  try { J.mejores = JSON.parse(localStorage.getItem('salto-mejores') || '{}'); } catch (e) { J.mejores = {}; }
  eventos();
  cargarNivel(0);
  abrirMenu();
  requestAnimationFrame(bucle);
})();
