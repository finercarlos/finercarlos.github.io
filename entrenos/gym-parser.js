/* Analizador de entrenamientos de gimnasio (texto del entrenador). */
(function (root) {
  'use strict';

  function norm(t) {
    return String(t || '').replace(/\r/g, '').replace(/[’´`‘]/g, "'").replace(/[”“″]/g, '"')
      .replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/ /g, ' ');
  }
  function clean(t) { return t.replace(/[*_~]/g, '').replace(/[ \t]+/g, ' ').trim(); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  const GYM_WORDS = /\bgym\b|gimnasio|\brm\b|sentadilla|press banca|peso muerto|cargada|clean and jerk|arrancada|hip thrust|\bhip\b|jal[oó]n|remo sentado|gemelos/i;
  function isGym(text) {
    const t = norm(text);
    const hits = (t.match(new RegExp(GYM_WORDS.source, 'gi')) || []).length;
    return hits >= 2 || /%\s*del\s*rm/i.test(t);
  }

  // "3 x (8+6)" -> [[8,6],[8,6],[8,6]] ; "12 + 10 + 8" / "12-10-8" -> [[12],[10],[8]] ; "4 x 6" -> [[6]x4]
  function parseScheme(t) {
    let m = t.match(/(\d+)\s*x\s*\(\s*(\d+(?:\s*\+\s*\d+)+)\s*\)/i);
    if (m) { const tand = m[2].split('+').map(s => +s.trim()); return Array.from({ length: +m[1] }, () => tand.slice()); }
    m = t.match(/(\d{1,2}(?:\s*[+\-]\s*\d{1,2})+)\s*[*_]*\s*(?:repes?\s*)?[*_]*\s*al\s*\d/i);
    if (m) return m[1].split(/[+\-]/).map(s => [+s.trim()]);
    m = t.match(/(\d+)\s*x\s*(\d+)\s*[*_]*\s*al\s*\d/i);
    if (m) return Array.from({ length: +m[1] }, () => [+m[2]]);
    return null;
  }

  function shortName(n) {
    n = n.replace(/[.:]+$/, '').trim();
    if (n.length > 26) {
      const m = n.match(/^(.{3,}?)\s+(?:con|en|de forma|desde|sin)\s+/i);
      if (m) n = m[1];
    }
    return cap(n);
  }

  function parseGym(input) {
    const t = norm(input);
    const lines = t.split('\n');
    const firstIdx = lines.findIndex(l => l.trim());
    const title = firstIdx >= 0 ? clean(lines[firstIdx]).replace(/[:.]$/, '') : 'Gimnasio';
    const out = { title, scheme: null, pct: null, lifts: [], applied: [], drags: null, notes: [] };

    const pctM = t.match(/al\s*(\d{2,3})\s*%/i);
    out.pct = pctM ? +pctM[1] : null;

    let mode = 'lifts', group = null;
    lines.forEach((raw, idx) => {
      if (idx === firstIdx || !raw.trim()) return;
      const c = clean(raw);
      if (!out.scheme && /%/.test(c)) { const sc = parseScheme(c); if (sc) out.scheme = sc; }

      if (/ejercicios aplicados/i.test(c)) { mode = 'applied'; return; }
      if (/ejercicios a realizar/i.test(c)) { mode = 'lifts'; if (c.length > 60) out.notes.push(c.replace(/^-\s*/, '')); return; }
      if (/arrastre/i.test(c)) {
        mode = 'drags';
        if (!out.drags) out.drags = { blocks: 0, reps: 0, dist: 30, optional: false, blockNotes: [], loads: null };
        if (/si (te|os) da tiempo|si da tiempo|opcional/i.test(c)) out.drags.optional = true;
        dragLine(c);
        out.notes.push(c);
        return;
      }
      if (/^\s*repes?\b/i.test(c)) return;

      if (mode === 'lifts') {
        const bold = raw.match(/^\s*[-•]?\s*\*([^*]+)\*\s*\.?\s*(.*)$/);
        let name, detail = '';
        if (bold) { name = bold[1]; detail = clean(bold[2]); }
        else if (c.length <= 45 && /[a-záéíóúñ]/i.test(c) && !/%|^(la idea|cerramos|fuera|nota)/i.test(c) && !/^\d+\./.test(c)) name = c;
        if (!name) { out.notes.push(c); return; }
        let note = '';
        name = name.replace(/\(([^)]*)\)/g, (m0, g) => { note = g; return ''; }).trim();
        const full = clean(name);
        const refM = detail.match(/usar\s+(?:el\s+)?rm\s+(?:nuevo\s+)?(?:de la\s+|del?\s+)?([a-záéíóúñ ]+?)\s*(?:\(|\.|,|$)/i);
        full.split(/\s*\/\s*/).forEach(n => {
          if (!n) return;
          out.lifts.push({ name: shortName(n), full: n, detail: [full !== shortName(n) && full.length > 26 ? full : '', detail, note].filter(Boolean).join(' · '), ref: refM ? cap(refM[1].trim()) : null });
        });
        return;
      }

      if (mode === 'applied') {
        const v = c.match(/^(\d+)\.\s?(\d+)\.?\s+(.+)$/);
        if (v) {
          if (!group) { group = { num: v[1], name: 'Ejercicio ' + v[1], schemes: [], variants: [] }; out.applied.push(group); }
          const txt = v[3];
          const nm = txt.split(/,|\.\s|\s-\s/)[0];
          group.variants.push({ code: v[1] + '.' + v[2], name: nm.length > 70 ? nm.slice(0, 68) + '…' : nm, detail: txt });
          return;
        }
        const g = c.match(/^(\d+)\.\s+(.+)$/);
        if (g) {
          const txt = g[2];
          const schemes = [];
          let m; const re = /(\d+)\s*x\s*(\d+(?:\s*\+\s*\d+)?)\s*(segundos|seg|s\b|metros|m\b)?/gi;
          while ((m = re.exec(txt))) schemes.push({ sets: +m[1], reps: m[2].replace(/\s/g, '') + (m[3] ? (/^s/i.test(m[3]) ? ' s' : ' m') : '') });
          group = { num: g[1], name: cap(txt.split(/[(:]/)[0].replace(/[.\s]+$/, '').trim()), schemes, variants: [], detail: txt };
          out.applied.push(group);
          return;
        }
        if (group && group.variants.length) group.variants[group.variants.length - 1].detail += ' ' + c;
        else out.notes.push(c);
        return;
      }

      if (mode === 'drags') { if (!dragLine(c)) out.notes.push(c); }
    });

    function dragLine(c) {
      const d = out.drags; let used = false;
      const sc = c.match(/(\d+)\s*x\s*\(?\s*(\d+)\s*x\s*(\d+)\s*\)?/i);
      if (sc && !d.blocks) { d.blocks = +sc[1]; d.reps = +sc[2]; d.dist = +sc[3]; used = true; }
      const bn = c.match(/^\s*(\d)\s*(?:er|do|ro|to|º|o)?\s*bloque[^-:]*[-:]\s*(.+)$/i);
      if (bn) { d.blockNotes[+bn[1] - 1] = clean(bn[2]); used = true; }
      const ld = c.match(/(\d+(?:,\d+)?)\s*k\w*\s*-\s*(\d+(?:,\d+)?)\s*k\w*\s*-\s*(\d+(?:,\d+)?)\s*k/i);
      if (ld && !d.loads) d.loads = [ld[1], ld[2], ld[3]];
      return used;
    }

    // asignar series a cada variante
    out.applied.forEach(g => {
      if (!g.variants.length) g.variants.push({ code: g.num, name: g.name, detail: '' });
      g.variants.forEach((v, i) => {
        const s = g.schemes.length === g.variants.length ? g.schemes[i] : (g.schemes[0] || { sets: 1, reps: '' });
        v.sets = s.sets; v.reps = s.reps;
      });
    });
    if (out.drags && !out.drags.blocks) out.drags = null;
    if (!out.scheme) out.scheme = [[10], [10], [10]];
    return out;
  }

  const api = { parseGym, isGym, parseScheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GymParser = api;
})(this);
