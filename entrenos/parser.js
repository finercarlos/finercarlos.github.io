/* Analizador de entrenamientos en texto libre (formato WhatsApp del entrenador).
   Devuelve una estructura editable: secciones -> partes (dinámicas) -> bloques -> series. */
(function (root) {
  'use strict';
  // Los multisaltos no se miden salvo que se indique lo contrario
  const MEASURE_JUMPS = false;

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
    const reDash = /\b(\d{2,5}(?:\s*[-+]\s*\d{2,5})+)\b(?!\s*['"])/g;
    while ((m = reDash.exec(t))) {
      const ds = m[1].split(/[-+]/).map(s => +s.trim());
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
    // "_- Series de velocidad:_" / "*Series de medio fondo:*"
    const t2 = txt.replace(/^[-•]\s*/, '');
    if (marked && /^[_*]/.test(raw) && t2.length <= 45 && (/:$/.test(clean(raw)) || /^[-•]/.test(txt)) && /^(series|grupo|velocidad|vallas|medio|fondo|saltos|lanz|sprint)/i.test(t2)) return t2;
    return null;
  }

  const DIN_RE = /^\s*[_*]*\s*(din[aá]mica|bloque|parte)\s*(\d+)\s*[_*]*\s*:?\s*[_*]*\s*:?\s*(.*)$/i;

  // lista de descansos: "Recus 3'-4'-5'" -> ["3'","4'","5'"]; "recu 4'-5'" -> ["4'-5'"]
  function restList(text) {
    const m = text.match(/(?:recu\w*|descansos?)\s*(?:de\s*)?((?:\d+\s*(?:'\s*\d*\s*"?|")?\s*(?:-|\by\b|,|\/)\s*)+\d+\s*(?:'\s*\d*\s*"?|")?)/i);
    if (m) {
      const vals = m[1].split(/\s*(?:-|\by\b|,|\/)\s*/).map(v => v.trim()).filter(Boolean);
      if (vals.length >= 3) return vals.map(fmtRest);
      if (vals.length === 2) return [fmtRest(vals.join('-'))];
    }
    const r = findRests(text);
    return r.length ? [r[0].v] : [];
  }
  const restAt = (list, j) => list.length ? list[Math.min(j, list.length - 1)] : '';

  // cuestas: "(dos ⬆️ una ⬇️)" -> ['↑','↑','↓']
  function directions(text, n) {
    let t = text;
    if (!/[⬆⬇↑↓]/.test(t)) t = t.replace(/cuesta\s+arriba|subiendo/gi, '⬆').replace(/cuesta\s+abajo|bajando/gi, '⬇');
    const ch = t.split(/([⬆⬇↑↓])/);
    const segs = [];
    for (let i = 1; i < ch.length; i += 2) {
      const nm = ch[i - 1].match(/\b(una|uno|un|dos|tres|cuatro|cinco|\d+)\b/i);
      segs.push({ d: /[⬆↑]/.test(ch[i]) ? '↑' : '↓', n: nm ? (WORD_NUM[nm[1].toLowerCase()] || +nm[1]) : null });
    }
    if (!segs.length) return null;
    const known = segs.reduce((a, x) => a + (x.n || 0), 0);
    const unk = segs.filter(x => x.n == null);
    unk.forEach((x, i) => { x.n = Math.max(0, Math.floor((n - known) / unk.length) + (i === unk.length - 1 ? (n - known) % unk.length : 0)); });
    const out = [];
    segs.forEach(x => { for (let k = 0; k < x.n; k++) out.push(x.d); });
    while (out.length < n) out.push(out[out.length - 1]);
    return out.slice(0, n);
  }

  function rowLine(line) {
    const c = norm(line).replace(/^[\s\-•(*_]+/, '');
    if (!/^\d/.test(c)) return null;
    const toks = findTokens(c);
    if (!toks.length || toks[0].i > 1) return null;
    const reps = [];
    toks.forEach(k => { for (let x = 0; x < Math.max(k.countMax, 1); x++) k.dists.forEach(d => reps.push({ dist: d, optional: x >= k.count })); });
    const dirs = directions(c.slice(toks[0].e), reps.length);
    if (dirs) reps.forEach((r, i) => { r.dir = dirs[i]; });
    return { reps, rests: /recu|descanso/i.test(c) ? restList(c) : [] };
  }

  const GRP = /\(([^()]*\d[^()]*)\)\s*x\s*(\d+)(?:\s*-\s*(\d+))?|\b(\d+)(?:\s*-\s*(\d+))?\s*x\s*\(([^()]*)\)/i;
  const VERB = /\b(hacer|hacemos|haremos|hacéis|hareis|terminamos|terminar|termináis|acabamos|acabar|se hacen?|meter|metemos)\b/i;

  function repObj(r, rest, opt) {
    return { dist: r.dist, label: String(r.dist) + (r.dir ? ' ' + r.dir : ''), unit: 'time', rest: rest || '', value: '', status: 'pending', optional: !!(opt || r.optional) };
  }
  function rowsBlocks(part) {
    const blocks = [];
    if (part.grouped) {
      for (let s = 0; s < part.setsMax; s++) {
        const reps = [];
        part.rows.forEach(row => { const L = row.rests.length ? row.rests : part.rests; row.reps.forEach((r, j) => reps.push(repObj(r, restAt(L, j)))); });
        if (reps.length) reps[reps.length - 1].rest = '';
        blocks.push({ optional: s >= part.sets, restAfter: s < part.setsMax - 1 ? restAt(part.rests, 99) : '', reps });
      }
    } else {
      part.rows.forEach((row, ri) => {
        const L = row.rests.length ? row.rests : part.rests;
        const reps = row.reps.map((r, j) => repObj(r, j < row.reps.length - 1 ? restAt(L, j) : ''));
        blocks.push({ optional: false, restAfter: ri < part.rows.length - 1 ? restAt(L, row.reps.length - 1) : '', reps });
      });
    }
    return blocks;
  }

  function parseSection(title, lines) {
    const sec = { title, parts: [], notes: [], variants: [] };
    // 1) unidades: dinámicas (cabecera + cuerpo) y párrafos sueltos
    const units = [];
    let i = 0, para = [];
    const flush = () => { if (para.length) units.push({ kind: 'para', lines: para }); para = []; };
    while (i < lines.length) {
      const l = lines[i];
      const m = l.match(DIN_RE);
      if (m) {
        flush();
        const u = { kind: 'din', title: cap(m[1]) + ' ' + m[2], body: [] };
        if (m[3].trim()) u.body.push(m[3]);
        i++;
        while (i < lines.length && !lines[i].trim() && !u.body.length) i++;
        while (i < lines.length && lines[i].trim() && !DIN_RE.test(lines[i])) { u.body.push(lines[i]); i++; }
        units.push(u); continue;
      }
      if (!l.trim()) flush(); else para.push(l);
      i++;
    }
    flush();

    // 2) interpretar
    let globalMul = null, globalSetRest = null, curRows = null;
    const raw = [];
    units.forEach(u => {
      if (u.kind === 'din') { raw.push({ type: 'din', title: u.title, text: u.body.join('\n') }); curRows = null; return; }
      const ptext = norm(u.lines.join('\n'));
      const g = ptext.match(GRP);
      if (g) {
        const inner = g[1] != null ? g[1] : g[6];
        const rows = inner.split('\n').map(rowLine).filter(Boolean);
        if (rows.length) {
          const n = +(g[2] || g[4]), mx = +(g[3] || g[5] || n);
          const rest = ptext.slice(0, g.index) + ' ' + ptext.slice(g.index + g[0].length);
          curRows = { type: 'rows', grouped: true, title: 'Series', rows, sets: n, setsMax: mx, rests: restList(rest), text: clean(ptext) };
          raw.push(curRows); curRows = null; return;
        }
      }
      let note = [];
      const flushNote = () => { if (note.length) sec.notes.push(clean(note.join(' '))); note = []; };
      u.lines.forEach(line => {
        const nl = norm(line);
        const sub = nl.match(/^[\s\-•*_]*(.+?)\s+sustituy\w*\s+(.+)$/i);
        if (sub) {
          const map = {}; let mm; const re = /\bel\s+(\d+)\s*(?:m\b|metros)?\s*(?:se\s+cambia\s+)?por\s+(?:el\s+)?(\d+)/gi;
          while ((mm = re.exec(sub[2]))) map[mm[1]] = +mm[2];
          if (Object.keys(map).length) { sec.variants.push({ name: clean(sub[1]), map }); flushNote(); note.push(line); flushNote(); curRows = null; return; }
        }
        const mul = parseMultiplier(nl);
        const sr = findSetRest(nl) || (nl.match(new RegExp(String.raw`recu\w*\s*(?:de\s*)?(${TIME})\s*entre\s*cada\s*bloque`, 'i')) || [])[1];
        if (mul && /cada/i.test(nl)) globalMul = mul;
        if (sr) globalSetRest = fmtRest(sr);
        if ((mul && /cada/i.test(nl)) || sr) { note.push(line); return; }
        const row = rowLine(nl);
        if (row) {
          flushNote();
          if (!curRows) { curRows = { type: 'rows', grouped: false, title: 'Series', rows: [], rests: [], text: '' }; raw.push(curRows); }
          curRows.rows.push(row);
          curRows.text += (curRows.text ? '\n' : '') + clean(line);
          return;
        }
        if (/^[\s*_\-]*(recu|descanso)/i.test(nl) && !findTokens(nl).length) {
          if (curRows && !curRows.rests.length) { curRows.rests = restList(nl); curRows.text += '\n' + clean(line); return; }
        }
        const toks = findTokens(nl);
        if (toks.length && VERB.test(nl)) {
          flushNote(); curRows = null;
          const optional = /si todo (va )?bien|si se puede|si pod[eé]is|opcional/i.test(nl);
          raw.push({ type: 'din', title: /tacos/i.test(nl) ? 'Extra · tacos' : /termin|acab/i.test(nl) ? 'Final' + (optional ? ' (si todo bien)' : '') : 'Extra', text: line, optional });
          return;
        }
        curRows = null;
        note.push(line);
      });
      flushNote();
    });

    // 3) construir bloques
    let prev = null;
    sec.parts = raw.map(p => {
      if (p.type === 'rows') return { title: p.title, text: p.text, grouped: p.grouped, blocks: rowsBlocks(p) };
      const pp = parsePart(p.text, prev);
      const isDin = /^(din|bloque|parte)/i.test(p.title);
      if (!pp.explicitSets && globalMul && isDin) { pp.sets = globalMul.n; pp.setsMax = globalMul.max; }
      prev = pp;
      const blocks = pp.reps.length ? buildBlocks(pp, isDin ? globalSetRest : null) : [];
      if (p.optional) blocks.forEach(b => b.reps.forEach(r => { r.optional = true; }));
      return { title: p.title, text: clean(p.text), blocks };
    });
    // varias partes "Series" seguidas sin agrupar -> numerarlas
    const ser = sec.parts.filter(p => p.title === 'Series');
    if (ser.length > 1) ser.forEach((p, k) => { p.title = 'Series ' + (k + 1); });
    const fulltext = lines.join(' ');
    sec.optionsMode = sec.parts.filter(p => p.grouped).length >= 2 && /tipos|posibles|opci[oó]n|a elegir|elegid|elige/i.test(fulltext);
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
      if (MEASURE_JUMPS && /salto/i.test(cc) && small) {
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
    let common = null, secs;
    if (!sections.length) {
      const first = clean((pre.find(l => l.trim()) || ''));
      const tm = first.match(/entrenamiento (?:de|del) ([a-záéíóúñ ]+?)(?:\s+para|\s+del?|[.(:]|$)/i);
      secs = [parseSection(tm ? cap(tm[1].trim()) : 'Entrenamiento', pre)];
    }
    else { common = parseCommon(pre); secs = sections.map(s => parseSection(s.title, s.lines)); }
    // "4 tipos de series posibles" -> cada tipo es una opción
    const out = [];
    secs.forEach(sec => {
      if (!sec.optionsMode) { out.push(sec); return; }
      const groups = sec.parts.filter(p => p.grouped), rest = sec.parts.filter(p => !p.grouped);
      groups.forEach((g, k) => out.push(Object.assign({}, sec, { title: (sec.title === 'Entrenamiento' ? '' : sec.title + ' · ') + 'Opción ' + (k + 1), parts: [Object.assign({}, g, { title: 'Series' })].concat(rest) })));
    });
    return { common, sections: out };
  }

  const api = { parseWorkout, parsePart, findTokens, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrainParser = api;
})(this);
