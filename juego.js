/* ============================================================
   SALTO — motor
   Los números del objeto F son trampas, no física real: están
   elegidos para que el personaje responda como tú esperas.
   ============================================================ */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const F = {
  velMax: 195, acelSuelo: 2100, frenSuelo: 2900, acelAire: 1500, frenAire: 800, giro: 2.1,
  saltoV: 500, gravSube: 1500, gravBaja: 2150, gravCorte: 3300, gravPico: 950, picoVent: 115, caidaMax: 780,
  coyote: 0.10, memoria: 0.12, esquina: 8,
  dashV: 470, dashT: 0.13, dashFin: 0.55, dashEspera: 0.10, dashHielo: 0.05,
  paredDesliz: 95, paredSaltoX: 260, paredSaltoY: 455, paredBloqueo: 0.15, paredCoyote: 0.10,
  planeoGrav: 430, planeoMax: 135, planeoRetraso: 0.08,
  ganchoDist: 270, ganchoCarr: 150, ganchoMin: 40, ganchoSalto: 330,
  // elementos del escenario
  muelleV: 790, fragilAviso: 0.30, fragilVuelve: 2.0,
  vientoFuerza: 1500, vientoMax: 290,
  cintaVel: 125, alternaCada: 2.3, alternaAviso: 0.55,
  ancho: 16, alto: 22
};
const PASO = 1 / 120;

/* ---------- entrada ---------- */
const MAPA_TECLAS = {
  izq: ['ArrowLeft', 'a', 'A'], der: ['ArrowRight', 'd', 'D'],
  arr: ['ArrowUp', 'w', 'W'], aba: ['ArrowDown', 's', 'S'],
  salto: [' ', 'z', 'Z'], dash: ['x', 'X', 'j', 'J'], gancho: ['c', 'C', 'k', 'K', 'Shift']
};
const T = { izq: 0, der: 0, arr: 0, aba: 0, salto: 0, dash: 0, gancho: 0 };
const pulsadoAhora = {};
const accionDe = (k) => Object.keys(MAPA_TECLAS).find((a) => MAPA_TECLAS[a].includes(k)) || null;

/* ---------- estado ---------- */
const J = {
  nivel: null, iNivel: 0, p: null,
  camara: { x: 0, y: 0 }, particulas: [], fantasmas: [],
  temblor: 0, congelacion: 0, destello: 0,
  muertes: 0, tiempo: 0, estado: 'menu', tMuerte: 0, tFin: 0,
  mejores: {}, ctx: null, audio: null,
  faseAlterna: 0, tAlterna: 0, decor: null, aparicion: null
};

function nuevoJugador(spawn) {
  return {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    suelo: false, mira: 1, plataforma: null,
    tCoyote: 0, tMemoria: 0, saltando: false,
    dashes: 1, dashT: 0, dashDx: 0, dashDy: 0, tDash: -9,
    pared: 0, tParedCoyote: 0, paredUltima: 0, bloqueo: 0,
    planeando: false, enViento: false, tCayendo: 0,
    gancho: null, largoCuerda: 0,
    estira: 1, aplasta: 1, faseAndar: 0, tVivo: 0
  };
}

/* ============================================================
   SONIDO
   ============================================================ */
function crearAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = 0.28; master.connect(ctx.destination);
  const ruido = (() => {
    const n = ctx.sampleRate * 0.5, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();
  function tono(f1, f2, dur, tipo = 'triangle', vol = 0.5) {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function chas(f, dur, vol = 0.4, q = 1) {
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = ruido; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }
  return {
    ctx,
    salto: () => tono(340, 620, 0.12, 'triangle', 0.4),
    dash: () => { tono(820, 160, 0.16, 'sawtooth', 0.26); chas(2400, 0.14, 0.28, 0.7); },
    tierra: (f) => { tono(150, 70, 0.1, 'sine', Math.min(0.5, 0.14 + f * 0.38)); chas(600, 0.06, 0.13 + f * 0.18); },
    pared: () => { tono(260, 420, 0.1, 'square', 0.2); chas(1600, 0.05, 0.13); },
    muerte: () => { tono(300, 50, 0.4, 'sawtooth', 0.32); chas(900, 0.3, 0.28); },
    cristal: () => { tono(900, 1500, 0.12, 'sine', 0.28); tono(1350, 2100, 0.16, 'sine', 0.15); },
    gancho: () => { chas(1800, 0.07, 0.28, 2); tono(520, 760, 0.1, 'square', 0.15); },
    muelle: () => { tono(260, 980, 0.2, 'square', 0.3); chas(1200, 0.08, 0.2); },
    cruje: () => chas(420, 0.16, 0.22, 0.6),
    control: () => [0, 7].forEach((s, i) => setTimeout(() => tono(660 * Math.pow(2, s / 12), 660 * Math.pow(2, s / 12), 0.16, 'sine', 0.26), i * 90)),
    alterna: () => tono(520, 380, 0.07, 'square', 0.1),
    meta: () => [0, 4, 7, 12].forEach((s, i) => setTimeout(() => tono(523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.22, 'triangle', 0.3), i * 85))
  };
}
const sonar = (n, a) => { if (J.audio) try { J.audio[n](a); } catch (e) {} };

/* ============================================================
   MAPA — sólidos estáticos y dinámicos
   ============================================================ */
function esSolido(cx, cy) {
  const N = J.nivel;
  if (!N || cx < 0 || cy < 0 || cx >= N.ancho || cy >= N.alto) return false;
  if (N.solido[cy][cx]) return true;
  const k = cy * N.ancho + cx;
  const fr = N.mapaFragil.get(k);
  if (fr && fr.estado === 1) return true;
  const al = N.mapaAlterno.get(k);
  if (al && al.fase === J.faseAlterna) return true;
  return false;
}
const esPincho = (cx, cy) => {
  const N = J.nivel;
  return N && cx >= 0 && cy >= 0 && cx < N.ancho && cy < N.alto && N.pincho[cy][cx];
};

function chocaTiles(x, y, w, h) {
  const x0 = Math.floor((x - w / 2) / TILE), x1 = Math.floor((x + w / 2 - 0.01) / TILE);
  const y0 = Math.floor((y - h / 2) / TILE), y1 = Math.floor((y + h / 2 - 0.01) / TILE);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (esSolido(cx, cy)) return true;
  return false;
}
const solapa = (x, y, w, h, m) =>
  x - w / 2 < m.x + m.w && x + w / 2 > m.x && y - h / 2 < m.y + m.h && y + h / 2 > m.y;

function chocaCaja(x, y, w, h) {
  if (chocaTiles(x, y, w, h)) return true;
  for (const m of J.nivel.moviles) if (solapa(x, y, w, h, m)) return true;
  return false;
}
function tocaPincho(x, y, w, h) {
  const m = 4;
  const x0 = Math.floor((x - w / 2 + m) / TILE), x1 = Math.floor((x + w / 2 - m) / TILE);
  const y0 = Math.floor((y - h / 2 + m) / TILE), y1 = Math.floor((y + h / 2 - m) / TILE);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (esPincho(cx, cy)) return true;
  return false;
}
function celdasDe(x, y, w, h) {
  const out = [];
  const x0 = Math.floor((x - w / 2) / TILE), x1 = Math.floor((x + w / 2 - 0.01) / TILE);
  const y0 = Math.floor((y - h / 2) / TILE), y1 = Math.floor((y + h / 2 - 0.01) / TILE);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) out.push([cx, cy]);
  return out;
}

function moverEje(p, dx, dy) {
  const w = F.ancho, h = F.alto;
  if (dx) {
    p.x += dx;
    if (chocaCaja(p.x, p.y, w, h)) {
      p.x -= dx;
      let paso = Math.sign(dx) * 0.5, n = 0;
      while (n++ < Math.abs(dx) / 0.5 && !chocaCaja(p.x + paso, p.y, w, h)) p.x += paso;
      return true;
    }
  }
  if (dy) {
    p.y += dy;
    if (chocaCaja(p.x, p.y, w, h)) {
      if (dy < 0) {   // perdón en las esquinas al golpear con la cabeza
        for (let d = 1; d <= F.esquina; d++) {
          if (!chocaCaja(p.x + d, p.y, w, h)) { p.x += d; return false; }
          if (!chocaCaja(p.x - d, p.y, w, h)) { p.x -= d; return false; }
        }
      }
      p.y -= dy;
      let paso = Math.sign(dy) * 0.5, n = 0;
      while (n++ < Math.abs(dy) / 0.5 && !chocaCaja(p.x, p.y + paso, w, h)) p.y += paso;
      return true;
    }
  }
  return false;
}
const hayPared = (p, lado) => chocaCaja(p.x + lado * 3, p.y, F.ancho, F.alto - 6);

/* ============================================================
   ELEMENTOS DEL ESCENARIO
   ============================================================ */
function actualizarEscenario(dt) {
  const N = J.nivel;

  /* --- bloques intermitentes --- */
  J.tAlterna += dt;
  if (J.tAlterna >= F.alternaCada) {
    J.tAlterna = 0;
    J.faseAlterna = 1 - J.faseAlterna;
    if (N.alternos.length) sonar('alterna');
  }

  /* --- bloques que se desmoronan --- */
  for (const f of N.fragiles) {
    if (f.estado === 1 && f.t > 0) {
      f.t -= dt;
      if (f.t <= 0) {
        f.estado = 0; f.t = F.fragilVuelve;
        sonar('cruje');
        for (let i = 0; i < 8; i++)
          polvo(f.cx * TILE + TILE / 2 + (Math.random() - 0.5) * TILE,
                f.cy * TILE + TILE / 2, (Math.random() - 0.5) * 90, Math.random() * 60, 3);
      }
    } else if (f.estado === 0) {
      f.t -= dt;
      if (f.t <= 0 && !chocaJugadorCelda(f.cx, f.cy)) { f.estado = 1; f.t = 0; }
    }
  }

  /* --- plataformas móviles --- */
  for (const m of N.moviles) {
    const v = m.vel * m.dir * dt;
    m.dx = m.vertical ? 0 : v;
    m.dy = m.vertical ? v : 0;
    const nx = m.x + m.dx, ny = m.y + m.dy;
    const fuera = m.vertical ? Math.abs(ny - m.y0) > m.rango : Math.abs(nx - m.x0) > m.rango;
    if (fuera || chocaTiles(nx + m.w / 2, ny + m.h / 2, m.w - 2, m.h - 2)) {
      m.dir *= -1; m.dx = 0; m.dy = 0;
    } else { m.x = nx; m.y = ny; }
  }

  for (const mu of N.muelles) mu.t = Math.max(0, mu.t - dt);
}

function chocaJugadorCelda(cx, cy) {
  const p = J.p;
  if (!p) return false;
  return solapa(p.x, p.y, F.ancho, F.alto, { x: cx * TILE, y: cy * TILE, w: TILE, h: TILE });
}

/* ============================================================
   FÍSICA DEL JUGADOR
   ============================================================ */
function actualizarJugador(dt) {
  const p = J.p, N = J.nivel, H = N.habilidades;
  const ejeX = (T.der ? 1 : 0) - (T.izq ? 1 : 0);
  const ejeY = (T.aba ? 1 : 0) - (T.arr ? 1 : 0);

  p.tVivo += dt;
  if (ejeX) p.mira = ejeX;
  p.bloqueo = Math.max(0, p.bloqueo - dt);
  p.tCoyote = Math.max(0, p.tCoyote - dt);
  p.tParedCoyote = Math.max(0, p.tParedCoyote - dt);
  p.tMemoria = Math.max(0, p.tMemoria - dt);

  /* la plataforma en la que vas te arrastra */
  if (p.plataforma) {
    const m = p.plataforma;
    moverEje(p, m.dx, 0);
    if (m.dy) { p.y += m.dy; if (chocaCaja(p.x, p.y, F.ancho, F.alto)) p.y -= m.dy; }
  }

  /* ¿está dentro de una corriente de aire? */
  p.enViento = celdasDe(p.x, p.y, F.ancho - 4, F.alto - 4)
    .some(([cx, cy]) => N.setViento.has(cy * N.ancho + cx));

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashDx * F.dashV; p.vy = p.dashDy * F.dashV;
    if (p.dashT <= 0) { p.vx *= F.dashFin; p.vy *= F.dashFin; }
    if (Math.random() < 0.8) J.fantasmas.push({ x: p.x, y: p.y, mira: p.mira, vida: 0.2, max: 0.2 });
  } else {
    /* --- horizontal, con cinta si la hay --- */
    if (p.bloqueo <= 0) {
      let objetivo = ejeX * F.velMax;
      if (p.suelo) {
        const bajo = N.mapaCinta.get(Math.floor((p.y + F.alto / 2 + 3) / TILE) * N.ancho + Math.floor(p.x / TILE));
        if (bajo) objetivo = Math.max(-F.velMax * 1.5, Math.min(F.velMax * 1.5, objetivo + bajo.dir * F.cintaVel));
      }
      let a = p.suelo ? (ejeX ? F.acelSuelo : F.frenSuelo) : (ejeX ? F.acelAire : F.frenAire);
      if (ejeX && Math.sign(ejeX) !== Math.sign(p.vx) && p.vx !== 0) a *= F.giro;
      if (p.vx < objetivo) p.vx = Math.min(objetivo, p.vx + a * dt);
      else if (p.vx > objetivo) p.vx = Math.max(objetivo, p.vx - a * dt);
    }

    let g = p.vy < 0 ? ((!T.salto && p.saltando) ? F.gravCorte : F.gravSube) : F.gravBaja;
    if (Math.abs(p.vy) < F.picoVent && !p.suelo) g = F.gravPico;

    p.planeando = false;
    if (H.planeo && !p.suelo && p.vy > 0 && T.salto && p.tCayendo > F.planeoRetraso && !p.gancho && !p.enViento) {
      p.planeando = true; g = F.planeoGrav;
    }
    if (p.enViento) g = -F.vientoFuerza;

    if (!p.gancho) p.vy += g * dt;

    if (p.enViento) { if (p.vy < -F.vientoMax) p.vy = -F.vientoMax; }
    else {
      const techo = p.planeando ? F.planeoMax : F.caidaMax;
      if (p.vy > techo) p.vy = Math.max(techo, p.vy - 4000 * dt);
    }

    p.pared = 0;
    if (H.pared && !p.suelo && !p.gancho) {
      if (hayPared(p, 1) && ejeX > 0) p.pared = 1;
      else if (hayPared(p, -1) && ejeX < 0) p.pared = -1;
      if (p.pared) {
        p.paredUltima = p.pared; p.tParedCoyote = F.paredCoyote;
        if (p.vy > F.paredDesliz) p.vy = F.paredDesliz;
        if (Math.random() < 0.25) polvo(p.x + p.pared * 8, p.y + (Math.random() - 0.5) * 16, -p.pared * 25, -20, 2);
      }
    }
  }

  if (H.gancho) actualizarGancho(p, ejeY, dt);

  if (p.tMemoria > 0) {
    if (p.suelo || p.tCoyote > 0) saltar(p);
    else if (p.pared || p.tParedCoyote > 0) saltoPared(p);
    else if (p.gancho) soltarGanchoConSalto(p);
  }

  const antesVy = p.vy;
  if (moverEje(p, p.vx * dt, 0)) p.vx = 0;
  const chocoY = moverEje(p, 0, p.vy * dt);

  const estabaEnSuelo = p.suelo;
  p.suelo = chocaCaja(p.x, p.y + 2, F.ancho, F.alto);
  p.plataforma = null;
  if (p.suelo) {
    for (const m of N.moviles)
      if (solapa(p.x, p.y + 2, F.ancho, F.alto, m)) { p.plataforma = m; break; }
  }

  let rebote = false;
  if (chocoY) {
    if (antesVy > 0 && p.suelo) {
      /* ¿he caído sobre un muelle? */
      const cel = Math.floor((p.y + F.alto / 2 + 3) / TILE) * N.ancho + Math.floor(p.x / TILE);
      if (N.setMuelle.has(cel)) {
        rebote = true;
        const mu = N.muelles.find((m) => m.cy * N.ancho + m.cx === cel);
        if (mu) mu.t = 0.35;
        p.vy = -F.muelleV; p.suelo = false; p.saltando = true; p.dashes = 1;
        p.aplasta = 0.6; p.estira = 1.5;
        J.temblor = Math.max(J.temblor, 5);
        sonar('muelle');
        for (let i = 0; i < 14; i++)
          polvo(p.x + (Math.random() - 0.5) * 20, p.y + F.alto / 2, (Math.random() - 0.5) * 180, -Math.random() * 120, 2);
      } else if (!estabaEnSuelo) {
        const fuerza = Math.min(1, antesVy / 700);
        sonar('tierra', fuerza);
        p.aplasta = 1 + fuerza * 0.45; p.estira = 1 - fuerza * 0.3;
        J.temblor = Math.max(J.temblor, fuerza * 5);
        if (fuerza > 0.45) J.congelacion = Math.max(J.congelacion, 0.035);
        for (let i = 0; i < 4 + fuerza * 8; i++)
          polvo(p.x + (Math.random() - 0.5) * 14, p.y + F.alto / 2, (Math.random() - 0.5) * 140, -Math.random() * 60, 2 + Math.random() * 2);
      }
    }
    if (!rebote) p.vy = 0;
  }

  /* pisar un bloque frágil lo pone en marcha */
  if (p.suelo) {
    const cy = Math.floor((p.y + F.alto / 2 + 3) / TILE);
    for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor((p.x + dx * 6) / TILE);
      const fr = N.mapaFragil.get(cy * N.ancho + cx);
      if (fr && fr.estado === 1 && fr.t === 0) fr.t = F.fragilAviso;
    }
  }

  if (p.suelo) {
    p.tCoyote = F.coyote; p.saltando = false; p.tCayendo = 0;
    if (p.dashT <= 0 && J.tiempo - p.tDash > F.dashEspera) p.dashes = 1;
  } else p.tCayendo += dt;
  if (p.pared && p.dashT <= 0 && J.tiempo - p.tDash > F.dashEspera) p.dashes = 1;

  if (pulsadoAhora.dash && H.dash && p.dashes > 0 && p.dashT <= 0 && J.tiempo - p.tDash > F.dashEspera) {
    let dx = ejeX, dy = ejeY;
    if (!dx && !dy) { dx = p.mira; dy = 0; }
    const n = Math.hypot(dx, dy) || 1;
    p.dashDx = dx / n; p.dashDy = dy / n;
    p.dashT = F.dashT; p.dashes--; p.tDash = J.tiempo; p.saltando = false;
    if (p.gancho) p.gancho = null;
    J.congelacion = Math.max(J.congelacion, F.dashHielo);
    J.temblor = Math.max(J.temblor, 4);
    sonar('dash');
    for (let i = 0; i < 10; i++)
      polvo(p.x, p.y, -p.dashDx * (60 + Math.random() * 140), -p.dashDy * (60 + Math.random() * 140), 2 + Math.random() * 2);
  }

  if (p.suelo) p.faseAndar += Math.abs(p.vx) * dt * 0.075;
  p.aplasta += (1 - p.aplasta) * Math.min(1, 14 * dt);
  p.estira += (1 - p.estira) * Math.min(1, 14 * dt);
  if (!p.suelo && p.dashT <= 0) {
    const t = Math.max(-1, Math.min(1, p.vy / 600));
    p.aplasta += ((1 - t * 0.18) - p.aplasta) * Math.min(1, 8 * dt);
    p.estira += ((1 + t * 0.18) - p.estira) * Math.min(1, 8 * dt);
  }

  for (const c of N.cristales) {
    if (c.tomado) { c.recarga -= dt; if (c.recarga <= 0) c.tomado = false; continue; }
    if (Math.hypot(c.x - p.x, c.y - p.y) < 20) {
      c.tomado = true; c.recarga = 2.2; p.dashes = 1;
      sonar('cristal'); J.temblor = Math.max(J.temblor, 3);
      for (let i = 0; i < 12; i++) polvo(c.x, c.y, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 2, N.paleta.acento2);
    }
  }

  for (const c of N.controles) {
    if (c.tomado) continue;
    if (Math.abs(c.x - p.x) < 22 && Math.abs(c.y - p.y) < 26) {
      c.tomado = true;
      J.aparicion = { x: c.x, y: c.y };
      sonar('control'); J.temblor = Math.max(J.temblor, 3);
      for (let i = 0; i < 18; i++)
        polvo(c.x, c.y, (Math.random() - 0.5) * 160, -Math.random() * 180, 2.5, N.paleta.acento2);
    }
  }

  if (tocaPincho(p.x, p.y, F.ancho, F.alto) || p.y > N.altoPx + 240) morir();
  const s = N.salida;
  if (Math.abs(p.x - s.x) < 20 && Math.abs(p.y - s.y) < 24) completar();
}

function saltar(p) {
  p.vy = -F.saltoV; p.suelo = false; p.saltando = true;
  p.tCoyote = 0; p.tMemoria = 0; p.tCayendo = 0;
  p.aplasta = 0.72; p.estira = 1.3;
  sonar('salto');
  for (let i = 0; i < 6; i++)
    polvo(p.x + (Math.random() - 0.5) * 12, p.y + F.alto / 2, (Math.random() - 0.5) * 90, Math.random() * 40, 2);
}
function saltoPared(p) {
  const lado = p.pared || p.paredUltima;
  p.vy = -F.paredSaltoY; p.vx = -lado * F.paredSaltoX;
  p.bloqueo = F.paredBloqueo; p.saltando = true; p.mira = -lado;
  p.tMemoria = 0; p.tParedCoyote = 0; p.tCayendo = 0;
  p.aplasta = 0.75; p.estira = 1.25;
  J.temblor = Math.max(J.temblor, 3);
  sonar('pared');
  for (let i = 0; i < 8; i++)
    polvo(p.x + lado * 8, p.y + (Math.random() - 0.5) * 18, -lado * (40 + Math.random() * 120), (Math.random() - 0.5) * 100, 2);
}

/* ---------- gancho: la cuerda no tira, impide alejarse ---------- */
function hayVista(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 6);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (esSolido(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
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
      sonar('gancho'); J.temblor = Math.max(J.temblor, 2);
    }
  }
  if (p.gancho && !T.gancho) p.gancho = null;
  if (!p.gancho) return;
  if (ejeY) p.largoCuerda = Math.max(F.ganchoMin, p.largoCuerda + ejeY * F.ganchoCarr * dt);
  p.vy += F.gravBaja * 0.85 * dt;
  const ejeX = (T.der ? 1 : 0) - (T.izq ? 1 : 0);
  if (ejeX) p.vx += ejeX * 520 * dt;
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  const dx = nx - p.gancho.x, dy = ny - p.gancho.y, d = Math.hypot(dx, dy) || 0.001;
  if (d > p.largoCuerda) {
    const ux = dx / d, uy = dy / d;
    p.vx = (p.gancho.x + ux * p.largoCuerda - p.x) / dt;
    p.vy = (p.gancho.y + uy * p.largoCuerda - p.y) / dt;
  }
}
function soltarGanchoConSalto(p) {
  p.gancho = null;
  p.vy = Math.min(p.vy, 0) - F.ganchoSalto;
  p.saltando = true; p.tMemoria = 0;
  p.aplasta = 0.8; p.estira = 1.2;
  sonar('salto');
}

/* ============================================================
   PARTÍCULAS
   ============================================================ */
function polvo(x, y, vx, vy, tam, color) {
  J.particulas.push({ x, y, vx, vy, tam, vida: 0.35 + Math.random() * 0.3, max: 0.65,
    color: color || (J.nivel ? J.nivel.paleta.rocaAlto : '#777'), grav: 420 });
}
function actualizarParticulas(dt) {
  for (let i = J.particulas.length - 1; i >= 0; i--) {
    const q = J.particulas[i];
    q.vida -= dt;
    if (q.vida <= 0) { J.particulas.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.grav * dt;
  }
  for (let i = J.fantasmas.length - 1; i >= 0; i--) {
    J.fantasmas[i].vida -= dt;
    if (J.fantasmas[i].vida <= 0) J.fantasmas.splice(i, 1);
  }
  if (J.decor) for (const m of J.decor.motas) {
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.y < 0) m.y += J.nivel.altoPx;
    if (m.y > J.nivel.altoPx) m.y -= J.nivel.altoPx;
    if (m.x < 0) m.x += J.nivel.anchoPx;
    if (m.x > J.nivel.anchoPx) m.x -= J.nivel.anchoPx;
  }
}

/* ============================================================
   MUERTE, CONTROL Y META
   ============================================================ */
function morir() {
  if (J.estado !== 'jugando') return;
  J.estado = 'muerto'; J.tMuerte = 0; J.muertes++;
  J.temblor = 9; J.congelacion = 0.06; J.destello = 0.18;
  sonar('muerte');
  const p = J.p, col = J.nivel.paleta.acento;
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 280;
    J.particulas.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      tam: 2 + Math.random() * 3, vida: 0.4 + Math.random() * 0.3, max: 0.7, color: col, grav: 500 });
  }
  actualizarHUD();
}
function reaparecer() {
  J.p = nuevoJugador(J.aparicion || J.nivel.spawn);
  J.estado = 'jugando';
  J.nivel.cristales.forEach((c) => { c.tomado = false; c.recarga = 0; });
  J.nivel.fragiles.forEach((f) => { f.estado = 1; f.t = 0; });
}
function completar() {
  if (J.estado !== 'jugando') return;
  J.estado = 'completado'; J.tFin = 0;
  sonar('meta'); J.temblor = 6;
  const s = J.nivel.salida, col = J.nivel.paleta.acento2;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 300;
    J.particulas.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      tam: 2 + Math.random() * 3, vida: 0.5 + Math.random() * 0.7, max: 1.2, color: col, grav: 230 });
  }
  const previo = J.mejores[J.iNivel];
  if (!previo || J.tiempo < previo.tiempo) {
    J.mejores[J.iNivel] = { tiempo: J.tiempo, muertes: J.muertes };
    guardar();
  } else { J.mejores[J.iNivel].hecho = true; guardar(); }
}
function guardar() {
  try { localStorage.setItem('salto-mejores-v2', JSON.stringify(J.mejores)); } catch (e) {}
}

/* ============================================================
   CÁMARA
   ============================================================ */
function actualizarCamara(dt, instante) {
  const p = J.p, cv = $('#lienzo');
  const aV = cv.clientWidth, alV = cv.clientHeight;
  let tx = p.x + p.mira * 46 + p.vx * 0.14;
  let ty = p.y + 8 + p.vy * 0.06;
  tx = Math.max(aV / 2, Math.min(J.nivel.anchoPx - aV / 2, tx));
  ty = Math.max(alV / 2, Math.min(J.nivel.altoPx - alV / 2, ty));
  if (J.nivel.anchoPx < aV) tx = J.nivel.anchoPx / 2;
  if (J.nivel.altoPx < alV) ty = J.nivel.altoPx / 2;
  if (instante) { J.camara.x = tx; J.camara.y = ty; return; }
  const k = 1 - Math.exp(-7.5 * dt);
  J.camara.x += (tx - J.camara.x) * k;
  J.camara.y += (ty - J.camara.y) * k;
}

/* ============================================================
   DECORADO DE FONDO
   Se genera una vez por nivel con una semilla, para que sea
   siempre el mismo y no parpadee.
   ============================================================ */
function semilla(s) { return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function generarDecor(N) {
  const r = semilla(N.ancho * 7919 + N.alto * 104729 + N.zona * 31);
  const lejos = [], medio = [], motas = [];
  for (let i = 0; i < 16; i++) {
    const w = 120 + r() * 320, h = 90 + r() * 260;
    lejos.push({ x: r() * N.anchoPx, y: r() * N.altoPx, w, h, r: (r() - 0.5) * 0.3 });
  }
  for (let i = 0; i < 26; i++) {
    const w = 50 + r() * 150, h = 40 + r() * 160;
    medio.push({ x: r() * N.anchoPx, y: r() * N.altoPx, w, h, r: (r() - 0.5) * 0.5 });
  }
  for (let i = 0; i < 70; i++)
    motas.push({ x: r() * N.anchoPx, y: r() * N.altoPx, t: 1 + r() * 2.2,
      vx: (r() - 0.5) * 14, vy: -6 - r() * 14, a: 0.2 + r() * 0.45 });
  return { lejos, medio, motas };
}

/* ============================================================
   DIBUJO
   ============================================================ */
function dibujar() {
  const cv = $('#lienzo'), g = J.ctx;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const P = J.nivel ? J.nivel.paleta : ZONAS[0];
  g.fillStyle = P.fondo; g.fillRect(0, 0, w, h);
  if (!J.nivel) return;

  const tem = J.temblor;
  const ox = Math.round(w / 2 - J.camara.x + (Math.random() - 0.5) * tem);
  const oy = Math.round(h / 2 - J.camara.y + (Math.random() - 0.5) * tem);
  const N = J.nivel, D = J.decor;

  /* --- capas de fondo con paralaje --- */
  const capa = (lista, factor, color) => {
    g.save(); g.fillStyle = color;
    for (const s of lista) {
      const x = s.x + ox * factor, y = s.y + oy * factor;
      if (x > -s.w - 200 && x < w + 200 && y > -s.h - 200 && y < h + 200) {
        g.save(); g.translate(x, y); g.rotate(s.r);
        g.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        g.restore();
      }
    }
    g.restore();
  };
  capa(D.lejos, 0.22, P.lejos);
  capa(D.medio, 0.48, P.medio);

  g.save();
  g.translate(ox, oy);

  const cx0 = Math.max(0, Math.floor((-ox) / TILE) - 1);
  const cx1 = Math.min(N.ancho - 1, Math.floor((-ox + w) / TILE) + 1);
  const cy0 = Math.max(0, Math.floor((-oy) / TILE) - 1);
  const cy1 = Math.min(N.alto - 1, Math.floor((-oy + h) / TILE) + 1);

  /* --- roca --- */
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      if (!N.solido[y][x]) continue;
      const px = x * TILE, py = y * TILE;
      g.fillStyle = P.roca; g.fillRect(px, py, TILE, TILE);
      if (!N.solido[y - 1] || !N.solido[y - 1][x]) { g.fillStyle = P.rocaAlto; g.fillRect(px, py, TILE, 4); }
      g.fillStyle = 'rgba(0,0,0,.18)';
      if (N.solido[y + 1] && N.solido[y + 1][x]) g.fillRect(px, py + TILE - 2, TILE, 2);
    }
  }

  /* --- cintas --- */
  for (const c of N.cintas) {
    const px = c.cx * TILE, py = c.cy * TILE;
    g.fillStyle = P.rocaAlto;
    const desp = (J.tiempo * 90 * c.dir) % 13;
    for (let i = -1; i < 3; i++) g.fillRect(px + ((i * 13 + desp + 26) % 26), py + 3, 6, 3);
  }

  /* --- muelles --- */
  for (const m of N.muelles) {
    const px = m.cx * TILE, py = m.cy * TILE;
    const c = m.t > 0 ? 1 - m.t / 0.35 : 1;
    g.strokeStyle = P.acento; g.lineWidth = 3; g.lineCap = 'round';
    const alto = 6 + c * 8;
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const yy = py + TILE - 3 - (i / 3) * alto;
      g.lineTo(px + 4 + (i % 2) * (TILE - 8), yy);
    }
    g.stroke();
  }

  /* --- bloques frágiles --- */
  for (const f of N.fragiles) {
    const px = f.cx * TILE, py = f.cy * TILE;
    if (f.estado === 1) {
      const temblando = f.t > 0 ? (Math.random() - 0.5) * 2.5 : 0;
      g.fillStyle = P.rocaAlto;
      g.globalAlpha = f.t > 0 ? 0.65 + Math.sin(J.tiempo * 40) * 0.25 : 1;
      g.fillRect(px + temblando, py + temblando, TILE, TILE);
      g.globalAlpha = 1;
      g.strokeStyle = P.acento2; g.lineWidth = 1; g.globalAlpha = 0.5;
      g.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
      g.globalAlpha = 1;
    } else {
      g.strokeStyle = P.rocaAlto; g.globalAlpha = 0.25; g.lineWidth = 1;
      g.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5);
      g.globalAlpha = 1;
    }
  }

  /* --- bloques intermitentes --- */
  const quedan = F.alternaCada - J.tAlterna;
  for (const a of N.alternos) {
    const px = a.cx * TILE, py = a.cy * TILE;
    const activo = a.fase === J.faseAlterna;
    if (activo) {
      const parpadeo = quedan < F.alternaAviso ? 0.55 + Math.abs(Math.sin(J.tiempo * 24)) * 0.45 : 1;
      g.globalAlpha = parpadeo;
      g.fillStyle = P.roca; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = P.acento; g.globalAlpha = parpadeo * 0.55;
      g.fillRect(px, py, TILE, 3);
      g.globalAlpha = 1;
    } else {
      g.strokeStyle = P.acento; g.globalAlpha = 0.3; g.lineWidth = 1.5;
      g.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
      g.globalAlpha = 1;
    }
    // marca para distinguir los dos turnos sin depender del color
    g.fillStyle = P.acento2; g.globalAlpha = activo ? 0.9 : 0.45;
    if (a.fase === 0) g.fillRect(px + TILE / 2 - 2, py + TILE / 2 - 2, 4, 4);
    else g.fillRect(px + TILE / 2 - 6, py + TILE / 2 - 1.5, 12, 3);
    g.globalAlpha = 1;
  }

  /* --- corrientes de aire --- */
  for (const v of N.viento) {
    const px = v.cx * TILE, py = v.cy * TILE;
    g.fillStyle = P.acento; g.globalAlpha = 0.07;
    g.fillRect(px, py, TILE, TILE);
    g.globalAlpha = 0.5; g.strokeStyle = P.acento2; g.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const t = ((J.tiempo * 150 + i * 60 + v.cx * 37) % TILE);
      const yy = py + TILE - t;
      g.beginPath(); g.moveTo(px + 7 + i * 10, yy); g.lineTo(px + 7 + i * 10, yy - 7); g.stroke();
    }
    g.globalAlpha = 1;
  }

  /* --- plataformas móviles --- */
  for (const m of N.moviles) {
    g.fillStyle = P.roca; g.fillRect(m.x, m.y, m.w, m.h);
    g.fillStyle = P.rocaAlto; g.fillRect(m.x, m.y, m.w, 4);
    g.fillStyle = P.acento; g.globalAlpha = 0.65;
    const cx = m.x + m.w / 2;
    if (m.vertical) { g.fillRect(cx - 7, m.y + 10, 14, 2); g.fillRect(cx - 2, m.y + 7, 4, 8); }
    else { g.fillRect(cx - 7, m.y + 12, 14, 2); g.fillRect(cx - 9, m.y + 9, 2, 8); g.fillRect(cx + 7, m.y + 9, 2, 8); }
    g.globalAlpha = 1;
  }

  /* --- pinchos, mirando hacia fuera de la roca --- */
  g.fillStyle = P.acento2;
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      if (!N.pincho[y][x]) continue;
      const px = x * TILE, py = y * TILE;
      let dir = 'arriba';
      if (N.solido[y + 1] && N.solido[y + 1][x]) dir = 'arriba';
      else if (N.solido[y - 1] && N.solido[y - 1][x]) dir = 'abajo';
      else if (N.solido[y][x - 1]) dir = 'derecha';
      else if (N.solido[y][x + 1]) dir = 'izquierda';
      const n = 3, pa = TILE / n, L = TILE * 0.6;
      for (let i = 0; i < n; i++) {
        const c = i * pa, c2 = (i + 1) * pa, m2 = c + pa / 2;
        g.beginPath();
        if (dir === 'arriba') { g.moveTo(px + c, py + TILE); g.lineTo(px + m2, py + TILE - L); g.lineTo(px + c2, py + TILE); }
        else if (dir === 'abajo') { g.moveTo(px + c, py); g.lineTo(px + m2, py + L); g.lineTo(px + c2, py); }
        else if (dir === 'derecha') { g.moveTo(px, py + c); g.lineTo(px + L, py + m2); g.lineTo(px, py + c2); }
        else { g.moveTo(px + TILE, py + c); g.lineTo(px + TILE - L, py + m2); g.lineTo(px + TILE, py + c2); }
        g.closePath(); g.fill();
      }
    }
  }

  /* --- anillas --- */
  for (const a of N.anclas) {
    const cerca = J.p && Math.hypot(a.x - J.p.x, a.y - J.p.y) < F.ganchoDist && hayVista(J.p.x, J.p.y, a.x, a.y);
    g.strokeStyle = cerca ? P.acento : P.rocaAlto; g.lineWidth = 2;
    g.beginPath(); g.moveTo(a.x, a.y - 7); g.lineTo(a.x, a.y - 16); g.stroke();
    g.beginPath(); g.arc(a.x, a.y, 7, 0, Math.PI * 2); g.stroke();
    if (cerca) {
      g.globalAlpha = 0.3;
      g.beginPath(); g.arc(a.x, a.y, 12 + Math.sin(J.tiempo * 6) * 2, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
  }

  /* --- cristales --- */
  for (const c of N.cristales) {
    g.save(); g.translate(c.x, c.y); g.rotate(J.tiempo * 1.6);
    g.lineWidth = 2;
    if (c.tomado) { g.globalAlpha = 0.2; g.strokeStyle = P.rocaAlto; }
    else { g.strokeStyle = P.acento2; g.fillStyle = P.acento2; }
    g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 0); g.lineTo(0, 9); g.lineTo(-7, 0); g.closePath();
    if (c.tomado) g.stroke(); else { g.globalAlpha = 0.85; g.fill(); }
    g.restore(); g.globalAlpha = 1;
  }

  /* --- puntos de control --- */
  for (const c of N.controles) {
    g.strokeStyle = c.tomado ? P.acento : P.rocaAlto;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(c.x - 7, c.y + 12); g.lineTo(c.x - 7, c.y - 12); g.stroke();
    g.beginPath();
    g.moveTo(c.x - 7, c.y - 12);
    const ond = c.tomado ? Math.sin(J.tiempo * 5) * 2 : 0;
    g.lineTo(c.x + 11 + ond, c.y - 8); g.lineTo(c.x - 7, c.y - 3);
    g.closePath();
    if (c.tomado) { g.fillStyle = P.acento; g.fill(); } else g.stroke();
  }

  /* --- la salida --- */
  const s = N.salida;
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(s.x, s.y, 2, s.x, s.y, 54);
  gr.addColorStop(0, P.acento + 'aa'); gr.addColorStop(1, P.acento + '00');
  g.fillStyle = gr; g.fillRect(s.x - 54, s.y - 54, 108, 108);
  g.restore();
  g.strokeStyle = P.acento2; g.lineWidth = 2.5;
  const pulso = 13 + Math.sin(J.tiempo * 3.5) * 2.5;
  g.beginPath(); g.arc(s.x, s.y, pulso, 0, Math.PI * 2); g.stroke();
  g.fillStyle = P.acento2;
  g.beginPath(); g.arc(s.x, s.y, 4, 0, Math.PI * 2); g.fill();

  /* --- motas de polvo flotando --- */
  g.fillStyle = P.acento2;
  for (const m of D.motas) {
    g.globalAlpha = m.a * 0.5;
    g.fillRect(m.x, m.y, m.t, m.t);
  }
  g.globalAlpha = 1;

  /* --- partículas --- */
  for (const q of J.particulas) {
    g.globalAlpha = Math.max(0, q.vida / q.max);
    g.fillStyle = q.color;
    const t = q.tam * (q.vida / q.max);
    g.fillRect(q.x - t / 2, q.y - t / 2, t, t);
  }
  g.globalAlpha = 1;

  const p = J.p;
  if (p && p.gancho) {
    g.strokeStyle = P.acento2; g.lineWidth = 2;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.gancho.x, p.gancho.y); g.stroke();
    g.fillStyle = P.acento2;
    g.beginPath(); g.arc(p.gancho.x, p.gancho.y, 4, 0, Math.PI * 2); g.fill();
  }

  /* --- estela del dash --- */
  for (const f of J.fantasmas) {
    g.globalAlpha = (f.vida / f.max) * 0.4;
    g.fillStyle = P.acento;
    redondeado(g, f.x - F.ancho / 2, f.y - F.alto / 2, F.ancho, F.alto * 0.7, 5);
    g.fill();
  }
  g.globalAlpha = 1;

  if (p && J.estado !== 'muerto') dibujarPersonaje(g, p, P);

  g.restore();

  /* --- viñeta y destellos (encima de todo) --- */
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);

  if (J.destello > 0) {
    g.fillStyle = `rgba(255,255,255,${J.destello * 0.5})`;
    g.fillRect(0, 0, w, h);
  }
}

function dibujarPersonaje(g, p, P) {
  const an = F.ancho * p.estira, al = F.alto * p.aplasta;
  g.save(); g.translate(p.x, p.y);

  /* resplandor */
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(0, 0, 2, 0, 0, 46);
  gr.addColorStop(0, P.acento + '55'); gr.addColorStop(1, P.acento + '00');
  g.fillStyle = gr; g.fillRect(-46, -46, 92, 92);
  g.restore();

  if (p.planeando) {
    g.strokeStyle = P.acento2; g.lineWidth = 2; g.globalAlpha = 0.8;
    const f = Math.sin(J.tiempo * 16) * 3;
    g.beginPath(); g.moveTo(-an / 2, 0); g.lineTo(-an / 2 - 12, -5 + f); g.stroke();
    g.beginPath(); g.moveTo(an / 2, 0); g.lineTo(an / 2 + 12, -5 + f); g.stroke();
    g.globalAlpha = 1;
  }

  const tieneDash = p.dashes > 0;
  const color = tieneDash ? P.acento : P.rocaAlto;
  const cuerpoAlto = al * 0.70, yCadera = -al / 2 + cuerpoAlto, pierna = al - cuerpoAlto;

  let pies;
  if (p.dashT > 0) pies = [[-p.dashDx * 5 - 3, 0.45], [-p.dashDx * 7 + 1, 0.3]];
  else if (!p.suelo) pies = [[-p.mira - 3.5, 0.45], [-p.mira * 4 + 3.5, 0.15]];
  else if (Math.abs(p.vx) > 14) {
    const f = p.faseAndar;
    pies = [[Math.cos(f) * 4 - 1.5, Math.max(0, Math.sin(f)) * 0.8],
            [Math.cos(f + Math.PI) * 4 + 1.5, Math.max(0, Math.sin(f + Math.PI)) * 0.8]];
  } else pies = [[-3.5, 0], [3.5, 0]];

  g.fillStyle = color;
  for (const [dx, lev] of pies) g.fillRect(dx - 2, yCadera, 4, Math.max(2, pierna * (1 - lev * 0.55)));

  g.fillStyle = tieneDash ? P.acento : 'transparent';
  g.strokeStyle = color; g.lineWidth = 2.5;
  redondeado(g, -an / 2, -al / 2, an, cuerpoAlto, 5);
  if (tieneDash) g.fill(); else g.stroke();

  g.fillStyle = tieneDash ? P.fondo : P.rocaAlto;
  const ex = p.mira * 2.5, ey = -al / 2 + cuerpoAlto * 0.34;
  g.fillRect(ex - 4.5, ey, 2.5, 4);
  g.fillRect(ex + 2, ey, 2.5, 4);
  g.restore();
}

function redondeado(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

/* ============================================================
   HUD Y MENÚ
   ============================================================ */
const reloj = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

function actualizarHUD() {
  const N = J.nivel;
  $('#hNivel').textContent = `${J.iNivel + 1}/${NIVELES.length} · ${N.nombre}`;
  $('#hZona').textContent = ZONAS[N.zona].nombre;
  $('#hTiempo').textContent = reloj(J.tiempo);
  $('#hMuertes').textContent = J.muertes;
  const m = J.mejores[J.iNivel];
  $('#hMejor').textContent = m && m.tiempo ? reloj(m.tiempo) : '—';
  $('#pista').textContent = N.pista;
  document.body.style.setProperty('--zona', ZONAS[N.zona].acento);
}

function cargarNivel(i) {
  J.iNivel = i;
  J.nivel = prepararNivel(NIVELES[i]);
  J.decor = generarDecor(J.nivel);
  J.muertes = 0; J.tiempo = 0;
  J.particulas.length = 0; J.fantasmas.length = 0;
  J.temblor = 0; J.congelacion = 0; J.destello = 0;
  J.faseAlterna = 0; J.tAlterna = 0;
  J.aparicion = null;
  J.nivel.controles.forEach((c) => (c.tomado = false));
  reaparecer();
  actualizarCamara(0, true);
  actualizarHUD();
  pintarHabilidades();
  $('#menu').hidden = true;
  $('#fin').hidden = true;
}

function pintarHabilidades() {
  const H = J.nivel.habilidades;
  const lista = [['Saltar', true, 'Espacio'], ['Dash', !!H.dash, 'X'], ['Pared', !!H.pared, '—'],
                 ['Planeo', !!H.planeo, 'mantén Espacio'], ['Gancho', !!H.gancho, 'C']];
  $('#habilidades').innerHTML = lista.map(([n, a, t]) =>
    `<span class="hab ${a ? 'on' : ''}">${n}<i>${a ? t : '—'}</i></span>`).join('');
}

function abrirMenu() {
  $('#menu').hidden = false;
  const hechos = Object.keys(J.mejores).length;
  $('#progreso').textContent = `${hechos} de ${NIVELES.length} superados`;
  $('#listaNiveles').innerHTML = ZONAS.map((z, iz) => {
    const niv = NIVELES.map((n, i) => ({ n, i })).filter((o) => o.n.zona === iz);
    return `<div class="zona" style="--zc:${z.acento}">
      <div class="zona-cab"><span class="zona-n">${iz + 1}</span>
        <span class="zona-t">${z.nombre}</span><span class="zona-l">${z.lema}</span></div>
      <div class="zona-niv">${niv.map(({ n, i }) => {
        const m = J.mejores[i];
        return `<button type="button" class="niv ${m ? 'hecho' : ''}" data-nivel="${i}">
          <span class="niv-t">${n.nombre}</span>
          <span class="niv-m">${m && m.tiempo ? reloj(m.tiempo) + ' · ' + m.muertes + '†' : '—'}</span></button>`;
      }).join('')}</div></div>`;
  }).join('');
  $$('[data-nivel]').forEach((b) => b.addEventListener('click', () => cargarNivel(+b.dataset.nivel)));
}

/* ============================================================
   BUCLE — paso fijo de física a 120 Hz
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
  J.destello = Math.max(0, J.destello - dt * 2.2);

  if (J.congelacion > 0) { J.congelacion -= dt; dibujar(); return; }

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
    actualizarEscenario(dt);
    actualizarJugador(dt);
    if (Math.floor(J.tiempo * 20) % 2 === 0) $('#hTiempo').textContent = reloj(J.tiempo);
  } else if (J.estado === 'muerto') {
    actualizarEscenario(dt);
    J.tMuerte += dt;
    if (J.tMuerte > 0.3) reaparecer();
  } else if (J.estado === 'completado') {
    J.tFin += dt;
    if (J.tFin > 1.1) mostrarFin();
  }
}

function mostrarFin() {
  if (!$('#fin').hidden) return;
  const ultimo = J.iNivel >= NIVELES.length - 1;
  $('#finTitulo').textContent = ultimo ? '¡Te los has pasado todos!' : '¡Nivel superado!';
  $('#finDatos').innerHTML = `<span><b>${reloj(J.tiempo)}</b>tiempo</span><span><b>${J.muertes}</b>muertes</span>`;
  $('#btnSiguiente').textContent = ultimo ? 'Volver al menú' : 'Siguiente →';
  $('#btnSiguiente').onclick = () => (ultimo ? abrirMenu() : cargarNivel(J.iNivel + 1));
  $('#fin').hidden = false;
}

/* ============================================================
   EVENTOS Y ARRANQUE
   ============================================================ */
function eventos() {
  addEventListener('keydown', (e) => {
    const a = accionDe(e.key);
    if (!a) {
      if (e.key === 'r' || e.key === 'R') { if (J.nivel) { J.aparicion = null; cargarNivel(J.iNivel); } }
      if (e.key === 'Escape') abrirMenu();
      return;
    }
    e.preventDefault();
    if (!T[a]) pulsadoAhora[a] = 1;
    T[a] = 1;
    if (a === 'salto' && J.p) J.p.tMemoria = F.memoria;
    if (!J.audio) J.audio = crearAudio();
    if (J.audio.ctx.state === 'suspended') J.audio.ctx.resume();
  });
  addEventListener('keyup', (e) => { const a = accionDe(e.key); if (a) { T[a] = 0; e.preventDefault(); } });
  addEventListener('blur', () => { for (const k in T) T[k] = 0; });

  $('#btnMenu').addEventListener('click', abrirMenu);
  $('#btnReinicio').addEventListener('click', () => { J.aparicion = null; cargarNivel(J.iNivel); });
  $('#btnEmpezar').addEventListener('click', () => {
    const sig = NIVELES.findIndex((n, i) => !J.mejores[i]);
    cargarNivel(sig < 0 ? 0 : sig);
  });
}

(function init() {
  J.ctx = $('#lienzo').getContext('2d');
  try { J.mejores = JSON.parse(localStorage.getItem('salto-mejores-v2') || '{}'); } catch (e) { J.mejores = {}; }
  eventos();
  cargarNivel(0);
  abrirMenu();
  requestAnimationFrame(bucle);
})();
