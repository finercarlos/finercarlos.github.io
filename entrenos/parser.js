/* Analizador de entrenamientos en texto libre (formato WhatsApp del entrenador).
   Devuelve una estructura editable: secciones -> partes (dinámicas) -> bloques -> series. */
(function (root) {
  'use strict';

  const WORD_NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, par: 2 };
  const WORD_DIST = {
    treintas: 30, cuarentas: 40, cincuentas: 50, sesentas: 60, setentas: 70, ochentas: 80,
    noventas: 90, cienes: 100, cientos: 100, 'ciento veintes': 120, 'ciento cincuentas': 150,
    doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600,
    ochocientos: 800, miles: 1000, mil: 1000
  };

  // ---------- normalización ----------
  function norm(t) {
    return String(t || '')
      .replace(/\r/g, '')
      .replace(/[’´`‘]/g, "'")
      .replace(/[”“″]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/×/g, 'x')
      .replace(/ /g, ' ');
  }
  function clean(t) { // quita marcas de formato de WhatsApp
    return t.replace(/[*_~]/g, '').replace(/[ \t]+/g, ' ').trim();
  }

  const TIME = String.raw`\d+(?:\s*'\s*\d*\s*"?|\s*")?(?:\s*-\s*\d+(?:\s*'\s*\d*\s*"?|\s*")?)?(?:\s*(?:min\w*|seg\w*|s\b))?`;

  function fmtRest(raw) {
    let r = raw.replace(/\s+/g, '').replace(/min\w*/i, "'").replace(/seg\w*|s$/i, '"');
    if (!/['"]/.test(r)) {
      // sin unidades: números pequeños = minutos, grandes = segundos
      const nums = r.split('-').map(Number);
      const unit = Math.max(...nums) <= 10 ? "'" : '"';
      r = nums.join(unit + '-') + unit;
    }
    return r.replace(/''/g, "'");
  }

  // ---------- descansos ----------
  function findSetRest(text) {
    const res = [
      new RegExp(String.raw`(${TIME})\s*(?:de\s*)?(?:recu\w*\s*)?entre\s*(?:cada\s*)?(?:bloques?|series|sets|tandas)`, 'i'),
      new RegExp(String.raw`(?:recu\w*|descanso)\s*(?:de\s*)?(${TIME})\s*entre\s*(?:cada\s*)?(?:bloques?|tandas|sets)`, 'i')
    ];
    for (const re of res) { const m = text.match(re); if (m) return fmtRest(m[1]); }
    return null;
  }

  function findRests(seg) {
    const out = [];
    const guard = /^\s*(?:min\w*\s*)?(?:de\s*)?(?:recu\w*\s*)?entre\s*(?:cada\s*)?(?:bloques?|tandas|sets)/i;
    const pats = [
      new RegExp(String.raw`(?:recu\w*|descanso|rec\.)\s*(?:de\s*)?(${TIME})`, 'gi'),
      new RegExp(String.raw`(${TIME})\s*(?:de\s*)?(?:recu\w*|descanso)`, 'gi'),
      /recu\w*\s+(andando|caminando|trotando|al trote|completa|total)/gi
    ];
    pats.forEach((re, k) => {
      let m;
      while ((m = re.exec(seg))) {
        const val = m[1];
        if (k < 2) {
          if (!/\d/.test(val)) continue;
          const after = seg.slice(m.index + m[0].length);
          if (k === 0 && guard.test(after)) continue;
          if (k === 1 && /entre\s*(?:cada\s*)?bloque/i.test(seg.slice(m.index, m.index + m[0].length + 25))) continue;
          // unitless needs some context
          if (!/['"]|min|seg/i.test(val) && k === 1) continue;
          out.push({ i: m.index, v: fmtRest(val) });
        } else {
          let w = val.trim().replace(/\s+(?:y|e|luego|,).*$/i, '');
          if (w.length > 34) w = w.slice(0, 32) + '…';
          out.push({ i: m.index, v: w });
        }
      }
    });
    out.sort((a, b) => a.i - b.i);
    // dedup overlaps
    return out.filter((r, i) => i === 0 || r.i - out[i - 1].i > 3);
  }

  // ---------- series ----------
  function okDist(d) { return d >= 20 && d <= 42195; }

  function findTokens(text) {
    const t = text.replace(/\([^)]*\)/g, m => ' '.repeat(m.length)); // ignora paréntesis
    const toks = [];
    let m;
    const reNx = /\b(\d+)(?:\s*-\s*(\d+))?\s*x\s*(\d{2,5})\b(?!\s*['"])/gi;
    while ((m = reNx.exec(t))) {
      const d = +m[3];
      if (okDist(d)) toks.push({ i: m.index, e: m.index + m[0].length, dists: [d], count: +m[1], countMax: +(m[2] || m[1]) });
    }
    const reDash = /\b(\d{2,5}(?:\s*-\s*\d{2,5})+)\b(?!\s*['"])/g;
    while ((m = reDash.exec(t))) {
      const ds = m[1].split('-').map(s => +s.trim());
      if (ds.every(okDist)) toks.push({ i: m.index, e: m.index + m[0].length, dists: ds, count: 1, countMax: 1, seq: true });
    }
    const words = Object.keys(WORD_DIST).sort((a, b) => b.length - a.length).join('|').replace(/ /g, '\\s*');
    const reW = new RegExp(String.raw`\b(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(${words})\b`, 'gi');
    while ((m = reW.exec(t))) {
      const n = /\d/.test(m[1]) ? +m[1] : WORD_NUM[m[1].toLowerCase()];
      const key = m[2].toLowerCase().replace(/\s+/g, ' ');
      toks.push({ i: m.index, e: m.index + m[0].length, dists: [WORD_DIST[key]], count: n, countMax: n });
    }
    const reOne = /\b(?:serie|series|un|una|el|hacer)\s+(?:de\s+)?(\d{2,5})\b(?!\s*(?:['"]|min|seg|x\b|metros\s+lanz|al\b))/gi;
    while ((m = reOne.exec(t))) {
      const d = +m[1];
      if (okDist(d)) toks.push({ i: m.index, e: m.index + m[0].length, dists: [d], count: 1, countMax: 1 });
    }
    toks.sort((a, b) => a.i - b.i || (b.e - b.i) - (a.e - a.i));
    const res = [];
    for (const k of toks) { if (!res.length || k.i >= res[res.length - 1].e) res.push(k); }
    return res;
  }

  function rep(dist, rest, optional) {
    return { dist, label: String(dist), unit: 'time', rest: rest || '', value: '', status: 'pending', optional: !!optional };
  }

  function parseMultiplier(text) {
    const m = text.match(/(\d+)(?:\s*-\s*(\d+))?\s*(?:veces|repeticiones del bloque|series del bloque)/i);
    return m ? { n: +m[1], max: +(m[2] || m[1]) } : null;
  }

  // Convierte el texto de una dinámica en bloques
  function parsePart(text, prev) {
    const t = norm(text);
    const setRest = findSetRest(t);
    let sets = 1, setsMax = 1, reps = [];
    const g = t.match(/(\d+)(?:\s*-\s*(\d+))?\s*x\s*\(\s*([^)]*)\)/i);
    let explicitSets = false;
    if (g) {
      sets = +g[1]; setsMax = +(g[2] || g[1]); explicitSets = true;
      const inner = findTokens(g[3]);
      const rests = findRests(t).filter(r => !(r.i >= g.index && r.i < g.index + g[0].length));
      const within = rests.length ? rests[0].v : '';
      inner.forEach(k => {
        const n = Math.max(k.countMax, 1);
        for (let c = 0; c < n; c++) k.dists.forEach(d => reps.push(rep(d, within, c >= k.count)));
      });
    } else {
      const toks = findTokens(t);
      toks.forEach((k, idx) => {
        const seg = t.slice(k.e, idx + 1 < toks.length ? toks[idx + 1].i : t.length);
        const rests = findRests(seg);
        let within = rests.length ? rests[0].v : '';
        let trans = rests.length ? rests[rests.length - 1].v : '';
        if (rests.length === 1 && idx + 1 < toks.length && /misma din[aá]mica/i.test(t) && prev && prev.within) within = prev.within;
        const flat = [];
        const n = Math.max(k.countMax, 1);
        for (let c = 0; c < n; c++) k.dists.forEach(d => flat.push(rep(d, within, c >= k.count)));
        if (flat.length) flat[flat.length - 1].rest = idx + 1 < toks.length ? trans : '';
        reps.push(...flat);
      });
      const mul = parseMultiplier(t);
      if (mul) { sets = mul.n; setsMax = mul.max; explicitSets = true; }
    }
    if (reps.length) reps[reps.length - 1].rest = '';
    const firstRest = reps.find(r => r.rest) ? reps.find(r => r.rest).rest : '';
    return { reps, sets, setsMax, explicitSets, setRest, within: firstRest };
  }

  function buildBlocks(pp, setRest) {
    const blocks = [];
    for (let s = 0; s < pp.setsMax; s++) {
      blocks.push({
        optional: s >= pp.sets,
        restAfter: s < pp.setsMax - 1 ? (pp.setRest || setRest || '') : '',
        reps: pp.reps.map(r => Object.assign({}, r))
      });
    }
    return blocks;
  }

  // ---------- estructura del mensaje ----------
  function isSectionHeader(line) {
    const raw = line.trim();
    if (!raw || /din[aá]mica/i.test(raw)) return null;
    const txt = clean(raw).replace(/[:.]$/, '');
    if (txt.length < 4 || txt.length > 40) return null;
    const letters = txt.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    if (letters.length < 4) return null;
    const upper = letters === letters.toUpperCase();
    const marked = /^[_*~]+.*[_*~]+$/.test(raw);
    if (upper && (marked || /^[A-ZÁÉÍÓÚÑ \-\/&]+$/.test(txt))) return txt;
    return null;
  }

  const DIN_RE = /^\s*[_*]*\s*(din[aá]mica|bloque|parte)\s*(\d+)\s*[_*]*\s*:?\s*[_*]*\s*:?\s*(.*)$/i;

  function paragraphs(lines) {
    const out = []; let cur = [];
    lines.forEach(l => {
      if (!l.trim()) { if (cur.length) out.push(cur.join('\n')); cur = []; }
      else cur.push(l);
    });
    if (cur.length) out.push(cur.join('\n'));
    return out;
  }

  function parseSection(title, lines) {
    const sec = { title, parts: [], notes: [] };
    const extras = [];
    let i = 0; let cur = null;
    // agrupa: dinámica = cabecera + líneas hasta línea en blanco
    while (i < lines.length) {
      const l = lines[i];
      const m = l.match(DIN_RE);
      if (m) {
        cur = { title: cap(m[1]) + ' ' + m[2], body: [] };
        if (m[3].trim()) cur.body.push(m[3]);
        sec.parts.push(cur);
        i++;
        while (i < lines.length && !lines[i].trim() && !cur.body.length) i++; // saltar blancos iniciales
        while (i < lines.length && lines[i].trim() && !DIN_RE.test(lines[i])) { cur.body.push(lines[i]); i++; }
        continue;
      }
      extras.push(l); i++;
    }
    const extraParas = paragraphs(extras);
    let globalMul = null, globalSetRest = null;
    const extraParts = [];
    extraParas.forEach(p => {
      const np = norm(p);
      const mul = parseMultiplier(np);
      const sr = findSetRest(np) || (np.match(new RegExp(String.raw`recu\w*\s*(?:de\s*)?(${TIME})\s*entre\s*cada\s*bloque`, 'i')) || [])[1];
      const toks = findTokens(np);
      if (mul && /cada/i.test(np)) globalMul = mul;
      if (sr) globalSetRest = fmtRest(sr);
      if (toks.length && !(mul && /cada/i.test(np) && !toks.length)) {
        extraParts.push({ title: /tacos/i.test(np) ? 'Extra · tacos' : 'Extra', body: [p] });
      } else if (!mul && !sr) {
        sec.notes.push(clean(p));
      } else {
        sec.notes.push(clean(p));
      }
    });
    if (!sec.parts.length && extraParts.length === 1 && !sec.notes.length) extraParts[0].title = title ? 'Series' : 'Entrenamiento';
    const all = sec.parts.concat(extraParts);
    let prev = null;
    sec.parts = all.map(p => {
      const text = p.body.join('\n');
      const pp = parsePart(text, prev);
      if (!pp.explicitSets && globalMul && sec.parts.includes(p)) { pp.sets = globalMul.n; pp.setsMax = globalMul.max; }
      prev = pp;
      return { title: p.title, text: clean(text), blocks: pp.reps.length ? buildBlocks(pp, sec.parts.includes(p) ? globalSetRest : null) : [] };
    });
    return sec;
  }

  function cap(s) { s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

  // parte común (antes de la primera sección): multisaltos, lanzamientos...
  function parseCommon(lines) {
    const text = lines.join('\n').trim();
    if (!text) return null;
    const items = [];
    const chunks = norm(text).split(/\n(?=\s*[-•])/);
    const notes = [];
    chunks.forEach(c => {
      const cc = clean(c.replace(/^\s*[-•]\s*/, ''));
      if (!cc) return;
      const small = cc.match(/\b(\d{1,2}(?:\s*-\s*\d{1,2})+)\b(?!\s*['"])/);
      if (/salto/i.test(cc) && small) {
        const name = (cc.match(/^[^(.\n]+/) || ['Saltos'])[0].trim().replace(/\s*\d.*$/, '');
        const ns = small[1].split('-').map(s => +s.trim()).filter(n => n > 0 && n < 20);
        items.push({ title: name || 'Multisaltos', text: cc, blocks: [{ optional: false, restAfter: '', reps: ns.map(n => ({ dist: null, label: n + (n === 1 ? ' salto' : ' saltos'), unit: 'm', rest: '', value: '', status: 'pending', optional: false })) }] });
      } else notes.push(cc);
    });
    return { title: 'Parte común', notes, parts: items };
  }

  function parseWorkout(input) {
    const lines = norm(input).split('\n');
    const sections = []; const pre = [];
    let cur = null;
    lines.forEach(l => {
      const h = isSectionHeader(l);
      if (h) { cur = { title: h, lines: [] }; sections.push(cur); }
      else if (cur) cur.lines.push(l);
      else pre.push(l);
    });
    if (!sections.length) {
      const s = parseSection('Entrenamiento', pre);
      return { common: null, sections: [s] };
    }
    return { common: parseCommon(pre), sections: sections.map(s => parseSection(s.title, s.lines)) };
  }

  const api = { parseWorkout, parsePart, findTokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrainParser = api;
})(this);
