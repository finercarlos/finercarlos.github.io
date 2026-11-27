/* Entrenos — app de registro de entrenamientos (PWA, datos en el propio móvil) */
(function () {
  'use strict';
  const VERSION = '9';
  const LS_W = 'entrenos.workouts.v1', LS_D = 'entrenos.draft.v1', LS_RM = 'entrenos.rms.v1', LS_SET = 'entrenos.settings.v1', LS_CALC = 'entrenos.calc.v1';
  const SEED_EX = ['Clean and jerk', 'Arrancada', 'Cargada', 'Coso', 'Peso muerto', 'Sentadilla 90', 'Hip thrust', 'Press banca', 'Gemelos barra', 'Jalón', 'Remo sentado'];
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const SERIES_DAYS = [1, 4]; // lunes y jueves

  const $app = document.getElementById('app');
  const $hdr = document.getElementById('hdr');
  const $title = document.getElementById('title');

  // ---------- almacenamiento ----------
  function load(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('No se pudo guardar en el móvil'); } }
  let workouts = load(LS_W, []);
  let draft = load(LS_D, null) || newDraft();
  const S = { view: 'input', detailId: null, edit: false, prog: null, calcTab: 'pace', ocr: null };
  let rms = load(LS_RM, null) || { round: 2.5, list: SEED_EX.map(n => ({ id: uid(), name: n, rm: null, date: null, history: [] })) };
  let settings = load(LS_SET, { apiKey: '' });
  let calc = load(LS_CALC, { mode: 't2p', dist: '300', time: '45', pace: '15', unit: '100', ex: '', w: '', r: '' });
  function persistRM() { save(LS_RM, rms); }
  const LS_WK = 'entrenos.weeks.v1';
  let weekTags = load(LS_WK, null);
  if (!weekTags) { weekTags = {}; weekTags[weekStart(todayISO())] = 'C1'; save(LS_WK, weekTags); }

  function newDraft() { return { stage: 'paste', raw: '', date: todayISO(), parsed: null, includeCommon: true, workout: null, editingId: null }; }
  function persistDraft() { save(LS_D, draft); }
  function persistW() { save(LS_W, workouts); }

  // ---------- fechas ----------
  function todayISO() { const d = new Date(); return iso(d); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function weekStart(s) { const d = parseISO(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); }
  function isoWeekNum(s) {
    const d = parseISO(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  }
  function fmtDate(s, long) { const d = parseISO(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (long ? ' ' + d.getFullYear() : ''); }
  function dayInfo(s) {
    const d = parseISO(s).getDay();
    return SERIES_DAYS.includes(d) ? '<span class="pill acc">' + cap(DAYS[d]) + ' · día de series</span>' : '<span class="pill">' + cap(DAYS[d]) + '</span>';
  }

  // ---------- tiempos ----------
  // Admite: 52.4 · 52,4 · 1:02.5 · 1'02.5 · 1,02,5 · 2,45 (en 900 = 2:45)
  function parseTime(str, dist) {
    let s = String(str || '').trim().replace(/\s/g, '').replace(/,/g, '.').replace(/["s]$/, '');
    if (!s) return null;
    let m;
    if ((m = s.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/))) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    if ((m = s.match(/^(\d+)[:'](\d{1,2}(?:\.\d+)?)$/))) return +m[1] * 60 + +m[2];
    if ((m = s.match(/^(\d+)\.(\d{2})\.(\d+)$/))) return +m[1] * 60 + +m[2] + +('0.' + m[3]);
    if ((m = s.match(/^(\d+)\.(\d{2})$/)) && dist >= 200 && +m[1] < 10) return +m[1] * 60 + +m[2];
    if ((m = s.match(/^\d+(?:\.\d+)?$/))) return +s;
    return null;
  }
  function fmtT(sec) {
    if (sec == null || isNaN(sec)) return '—';
    const r = Math.round(sec * 100) / 100;
    if (r < 60) return trimZ(r.toFixed(2));
    const h = Math.floor(r / 3600), mi = Math.floor((r % 3600) / 60), se = r - h * 3600 - mi * 60;
    let ss = trimZ(se.toFixed(2)); if (se < 10) ss = '0' + ss;
    return (h ? h + ':' + String(mi).padStart(2, '0') : mi) + ':' + ss;
  }
  function trimZ(s) { return s.replace(/\.?0+$/, '') || '0'; }
  function per100(sec, dist) { return fmtT(Math.round(sec / dist * 1000) / 10).replace('.', ',') + (sec / dist * 100 < 60 ? ' s' : '') + '/100m'; }
  function paceStr(sec, dist) {
    if (!sec || !dist) return '';
    const p100 = per100(sec, dist);
    if (dist >= 200) { const p = sec / dist * 1000; return fmtT(Math.round(p)).replace(/\.\d+$/, '') + '/km · ' + p100; }
    return (dist / sec).toFixed(2) + ' m/s · ' + p100;
  }
  function repSec(r) { return r.unit === 'm' ? null : parseTime(r.value, r.dist); }
  function repNum(r) { const v = parseFloat(String(r.value).replace(',', '.')); return isNaN(v) ? null : v; }

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function prettyTitle(t) { return t.toLowerCase().replace(/(^|[\s\-\/])(\S)/g, (a, b, c) => b + c.toUpperCase()); }
  let tt;
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const ICON = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  };

  // ---------- construir el entreno a partir de lo elegido ----------
  function buildWorkout(secIdx, varIdx) {
    const p = draft.parsed; const sec = p.sections[secIdx];
    const variant = varIdx != null && sec.variants ? sec.variants[varIdx] : null;
    const parts = [];
    let notes = sec.notes.slice();
    if (p.common && draft.includeCommon) {
      parts.push(...JSON.parse(JSON.stringify(p.common.parts)));
      notes = p.common.notes.concat(notes);
    }
    parts.push(...JSON.parse(JSON.stringify(sec.parts)));
    if (variant) parts.forEach(pt => pt.blocks.forEach(b => b.reps.forEach(r => {
      if (r.dist != null && variant.map[r.dist] != null) { const nd = variant.map[r.dist]; r.label = r.label.replace(/^\d+/, String(nd)); r.dist = nd; }
    })));
    if (!parts.some(x => x.blocks.length)) parts.push({ title: 'Series', text: '', blocks: [{ optional: false, restAfter: '', reps: [] }] });
    return { id: null, date: draft.date, group: sec.title + (variant ? ' · ' + variant.name : ''), raw: draft.raw, notes, parts, comment: '', rpe: null };
  }

  // ---------- vistas ----------
  function render() {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.nav === (S.view === 'detail' ? 'history' : S.view === 'settings' ? 'input' : S.view)));
    $hdr.innerHTML = '';
    if (S.view === 'calc') renderCalc();
    else if (S.view === 'settings') renderSettings();
    else if (S.view === 'input') renderInput();
    else if (S.view === 'history') renderHistory();
    else if (S.view === 'detail') renderDetail();
    else if (S.view === 'progress') renderProgress();
  }

  function renderInput() {
    if (draft.stage === 'paste') {
      $title.innerHTML = 'Nuevo entreno<small>Pega el mensaje o sube una foto</small>';
      $hdr.innerHTML = '<button class="hdrbtn" data-act="settings">Ajustes</button>';
      $app.innerHTML = `
        <div class="datebox"><input type="date" id="date" value="${esc(draft.date)}"> ${dayInfo(draft.date)}</div>
        <textarea id="raw" placeholder="Pega aquí el entrenamiento (carrera o gimnasio) tal cual te lo manda tu entrenador. Puedes juntar fotos y mensajes: el texto de cada foto se añade aquí y debajo pegas las aclaraciones…">${esc(draft.raw)}</textarea>
        <div id="ocrstatus">${ocrStatusHtml()}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="paste">Pegar</button>
          <button class="btn" data-act="photo">📷 Foto</button>
          <button class="btn pri grow" data-act="analyze">Analizar</button>
        </div>
        <div class="card" style="margin-top:16px"><b>✍️ ¿Entrenaste sin mensaje del entrenador?</b>
          <p class="small muted" style="margin:4px 0 8px">Cuéntamelo en una frase y lo apunto. Ej: <i>"Rodaje 30 min y 6x200 a 31"</i> o <i>"Gym: sentadilla y press banca, piernas cargadas"</i>.</p>
          <textarea class="field" id="quick" style="min-height:64px" placeholder="Qué hiciste…">${esc(draft.quick || '')}</textarea>
          <div class="rpe" style="margin:8px 0">${[...Array(10)].map((_, i) => `<button data-act="quickrpe" data-v="${i + 1}" class="${draft.quickRpe === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
          <button class="btn block" data-act="quicksave">Apuntar (fecha de arriba)</button></div>
        <p class="muted small" style="margin-top:14px">Consejo: copia el mensaje entero de WhatsApp. Las secciones en mayúsculas (<b>_*VELOCIDAD-VALLAS*_</b>) se convierten en opciones y cada <b>*Dinámica*</b> en bloques para rellenar.</p>`;
      return;
    }
    if (draft.stage === 'choose') {
      $title.innerHTML = '¿Qué grupo haces hoy?<small>' + fmtDate(draft.date) + '</small>';
      $hdr.innerHTML = '<button class="hdrbtn" data-act="back-paste">Texto</button>';
      const p = draft.parsed;
      let h = '';
      if (p.gym) {
        const g = p.gym;
        h += `<button class="opt" data-act="choose-gym"><b>🏋 ${esc(g.title)}</b><span class="small muted">${esc(g.lifts.map(l => l.name).join(' · '))}${g.applied.length ? ' · ' + g.applied.length + ' ejercicios aplicados' : ''}${g.drags ? ' · arrastres' : ''}</span><br><span class="pill" style="margin-top:8px">${esc(schemeStr(g.scheme))}${g.pct ? ' al ' + g.pct + '%' : ''}</span></button>`;
        $app.innerHTML = h + '<button class="addrep" data-act="as-run">No es de gimnasio → tratarlo como entreno de carrera</button>';
        return;
      }
      if (p.common && (p.common.parts.length || p.common.notes.length)) {
        h += `<label class="check"><input type="checkbox" id="inclCommon" ${draft.includeCommon ? 'checked' : ''}>
          <span><b>Incluir parte común</b><br><span class="small muted">${esc(p.common.parts.map(x => x.title).concat(p.common.notes.map(n => n.split(/[.(]/)[0])).slice(0, 4).join(' · '))}</span></span></label>`;
      }
      p.sections.forEach((s, i) => {
        const nReps = s.parts.reduce((a, x) => a + x.blocks.reduce((b, bl) => b + bl.reps.filter(r => !r.optional && !bl.optional).length, 0), 0);
        const desc = s.parts.map(x => x.title + (x.blocks.length ? ': ' + summarizeStructure(x) : '')).join(' · ');
        const opts = [{ v: '', name: s.variants && s.variants.length ? 'General' : '' }].concat((s.variants || []).map((vv, k) => ({ v: k, name: vv.name, map: vv.map })));
        opts.forEach(o => {
          const sub = o.map ? 'Cambia ' + Object.keys(o.map).map(k => k + '→' + o.map[k]).join(', ') : desc;
          h += `<button class="opt" data-act="choose" data-i="${i}" data-v="${o.v}"><b>${esc(prettyTitle(s.title))}${o.name ? ' · ' + esc(o.name) : ''}</b><span class="small muted">${esc(sub || 'Sin series detectadas — podrás añadirlas a mano')}</span><br><span class="pill" style="margin-top:8px">${nReps} series</span></button>`;
        });
      });
      $app.innerHTML = h + '<button class="addrep" data-act="as-gym">¿Es de gimnasio? → tratarlo como gimnasio</button>';
      return;
    }
    renderForm();
  }

  function summarizeStructure(part) {
    const one = bl => {
      const inner = bl.reps.filter(r => !r.optional);
      const optR = bl.reps.length - inner.length;
      const labs = inner.map(r => r.label);
      if (labs.length > 1 && labs.every(l => l === labs[0])) return labs.length + '×' + labs[0] + (optR ? '(+' + optR + ')' : '');
      return labs.join('-') + (optR ? '(+' + optR + ')' : '');
    };
    const bl = part.blocks.filter(b => !b.optional);
    const optB = part.blocks.length - bl.length;
    if (!bl.length) return '';
    const strs = bl.map(one);
    if (strs.every(x => x === strs[0])) return bl.length > 1 || optB ? bl.length + (optB ? '-' + (bl.length + optB) : '') + '×(' + strs[0] + ')' : strs[0];
    return strs.join(' / ');
  }

  function repRow(r, p, b, i) {
    const cls = ['rep', r.status === 'locked' ? 'locked' : '', r.status === 'skipped' ? 'skipped' : '', r.optional ? 'opt-rep' : ''].join(' ');
    const dis = r.status !== 'pending' && !S.edit ? 'disabled' : '';
    const unitLab = r.unit === 'm' ? 'metros' : (r.dist ? 'm' : '');
    const ph = r.status === 'skipped' ? (r.value ? 'Incompleta' : 'No hecha') : (r.unit === 'm' ? 'distancia (m)' : (r.dist >= 400 ? 'tiempo · ej 1,25' : r.dist <= 150 ? 'tiempo · ej 6,85' : 'tiempo · ej 52,4'));
    const lab = S.edit
      ? `<button class="editlab" data-act="editdist" data-p="${p}" data-b="${b}" data-r="${i}">${esc(r.label)}<small style="display:block;font-size:10px;color:var(--acc);font-weight:700">cambiar</small></button>`
      : `<div class="lab">${esc(r.dist ? r.dist : r.label.split(' ')[0])}<small>${esc(r.dist ? unitLab + ' ' + r.label.replace(/^[\d.,]+\s*/, '') : r.label.split(' ').slice(1).join(' '))}${r.optional ? ' · opc.' : ''}</small></div>`;
    const btns = S.edit
      ? `<button class="ib del" data-act="delrep" data-p="${p}" data-b="${b}" data-r="${i}" aria-label="Borrar serie">${ICON.trash}</button>`
      : `<button class="ib lock" data-act="lock" data-p="${p}" data-b="${b}" data-r="${i}" aria-label="${r.status === 'locked' ? 'Desbloquear' : 'Bloquear'}">${r.status === 'locked' ? ICON.unlock : ICON.lock}</button>
         <button class="ib skip ${r.status === 'skipped' ? 'on' : ''}" data-act="skip" data-p="${p}" data-b="${b}" data-r="${i}" aria-label="No hecha">${ICON.x}</button>`;
    const load = r.load !== undefined ? `<input class="t kg" type="text" inputmode="decimal" autocomplete="off" data-act="load" data-p="${p}" data-b="${b}" data-r="${i}" value="${esc(r.load)}" placeholder="${esc(r.loadHint ? r.loadHint + ' kg' : 'kg')}" ${dis}>` : '';
    return `<div class="${cls}">${lab}${load}
      <input class="t" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" data-act="val" data-p="${p}" data-b="${b}" data-r="${i}" id="in-${p}-${b}-${i}" value="${esc(r.value)}" placeholder="${ph}" ${dis}>
      ${btns}</div><div class="pace" id="pc-${p}-${b}-${i}">${esc(hint(r))}</div>`;
  }
  function hint(r) {
    if (!r.value) return '';
    if (r.unit === 'm') { const v = repNum(r); return v == null ? '' : v.toFixed(2) + ' m'; }
    const s = repSec(r); if (s == null) return '¿formato?';
    return '= ' + fmtT(s) + (r.dist ? ' · ' + paceStr(s, r.dist) : '');
  }

  function progress(w) {
    let tot = 0, done = 0;
    (w.lifts || []).forEach(l => l.sets.forEach(x => { tot++; if (x.status !== 'pending') done++; }));
    (w.applied || []).forEach(g => g.variants.forEach(v => v.done.forEach(d => { tot++; if (d) done++; })));
    w.parts.forEach(p => p.blocks.forEach(b => b.reps.forEach(r => {
      if (!(b.optional || r.optional)) tot++;
      if (r.status !== 'pending' && !(b.optional || r.optional)) done++;
    })));
    return { tot, done };
  }

  function renderForm() {
    const w = draft.workout;
    if (w.type === 'gym') return renderGymForm();
    $title.innerHTML = esc(prettyTitle(w.group)) + '<small>' + fmtDate(w.date) + (draft.editingId ? ' · editando' : '') + '</small>';
    $hdr.innerHTML = `<button class="hdrbtn" data-act="toggle-edit">${S.edit ? 'Hecho' : 'Editar'}</button>`;
    const pr = progress(w);
    let h = `<div class="sumbar"><span>${pr.done}/${pr.tot}</span><div class="bar"><i style="width:${pr.tot ? pr.done / pr.tot * 100 : 0}%"></i></div>
      <input type="date" id="fdate" value="${esc(w.date)}" style="background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:5px 6px;font-size:13px"></div>`;
    h += editBar();
    if (w.notes && w.notes.length) h += '<ul class="notes">' + w.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>';
    h += renderParts(w);
    h += formFooter(w);
    $app.innerHTML = h;
  }
  function editBar() {
    return S.edit
      ? `<div class="card small" style="border-color:var(--acc)"><b>Modo edición.</b> Puedes cambiar tiempos aunque estén bloqueados, distancias, descansos, borrar 🗑, duplicar ⧉ o añadir series y bloques.<button class="btn pri block" data-act="toggle-edit" style="margin-top:10px">✓ Terminar edición</button></div>`
      : `<button class="btn block" data-act="toggle-edit" style="margin-bottom:12px">✏️ Editar / corregir entreno</button>`;
  }
  function formFooter(w) {
    return `<div class="card"><div class="small muted" style="margin-bottom:6px">Esfuerzo percibido (RPE) <b style="color:var(--acc)">· obligatorio</b> <span class="tiny">1 muy suave · 5 moderado · 8 duro · 10 máximo</span></div><div class="rpe">${[...Array(10)].map((_, i) => `<button data-act="rpe" data-v="${i + 1}" class="${w.rpe === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
      <div class="small muted" style="margin:12px 0 6px">Sensaciones / notas</div><textarea class="field" id="comment" style="min-height:70px" placeholder="Clavos, viento, molestias, cargas, ritmos que te dio el entrenador…">${esc(w.comment)}</textarea></div>
      <button class="btn pri block" data-act="savew">Guardar entrenamiento</button>
      <button class="btn ghost block" data-act="discard" style="margin-top:8px;color:var(--mut)">Descartar</button>`;
  }
  function renderParts(w) {
    let h = '';
    w.parts.forEach((part, p) => {
      h += `<div class="part">` + (S.edit ? `<input class="field" style="font-weight:700;color:var(--acc2);margin-bottom:6px" data-act="edittitle" data-p="${p}" value="${esc(part.title)}">` : `<h3>${esc(part.title)}${part.optional ? ' <span class="pill">opcional</span>' : ''}</h3>`);
      if (part.text) h += `<div class="parttxt clamp" data-act="expand">${esc(part.text)}</div>`;
      const multi = part.blocks.length > 1;
      part.blocks.forEach((bl, b) => {
        h += `<div class="blk ${bl.optional ? 'optional' : ''}">`;
        if (multi || bl.optional || S.edit) {
          h += `<div class="blkh"><span>Bloque ${b + 1}${bl.optional ? ' <span class="pill">opcional</span>' : ''}${bl.note ? ' <span style="text-transform:none;letter-spacing:0;font-weight:600;color:var(--txt)">· ' + esc(bl.note) + '</span>' : ''}</span>`;
          if (S.edit) h += `<span class="row" style="gap:6px"><button class="ib" data-act="dupblk" data-p="${p}" data-b="${b}" aria-label="Duplicar">⧉</button><button class="ib del" data-act="delblk" data-p="${p}" data-b="${b}" aria-label="Borrar bloque">${ICON.trash}</button></span>`;
          h += `</div>`;
        }
        bl.reps.forEach((r, i) => {
          h += repRow(r, p, b, i);
          if (i < bl.reps.length - 1) {
            h += S.edit ? `<div class="rest"><button class="chip" style="padding:5px 10px;font-size:12px" data-act="editrest" data-p="${p}" data-b="${b}" data-r="${i}">${r.rest ? esc(r.rest) : '+ descanso'} ✏️</button></div>`
              : (r.rest ? `<div class="rest">${esc(r.rest)}</div>` : '');
          }
        });
        if (S.edit) h += `<button class="addrep" data-act="addrep" data-p="${p}" data-b="${b}">+ Añadir serie</button>`;
        h += `</div>`;
        if (b < part.blocks.length - 1 && bl.restAfter) h += `<div class="rest big">${esc(bl.restAfter)} entre bloques</div>`;
      });
      if (S.edit) h += `<button class="addrep" data-act="addblk" data-p="${p}">+ Añadir bloque</button> &nbsp; <button class="addrep" style="color:var(--bad)" data-act="delpart" data-p="${p}">Quitar ${esc(part.title)}</button>`;
      h += `</div>`;
    });
    if (S.edit && w.type !== 'gym') h += `<button class="btn block" data-act="addpart" style="margin-bottom:16px">+ Añadir dinámica</button>`;
    return h;
  }

  // ---------- historial ----------
  function weekGroups() {
    const g = {};
    workouts.forEach(w => { const k = weekStart(w.date); (g[k] = g[k] || []).push(w); });
    return Object.keys(g).sort().reverse().map(k => ({ k, items: g[k].sort((a, b) => b.date.localeCompare(a.date) || (b.savedAt || 0) - (a.savedAt || 0)) }));
  }
  function doneReps(w) { const out = []; w.parts.forEach(p => p.blocks.forEach(b => b.reps.forEach(r => { if (r.status === 'locked') out.push(r); }))); return out; }
  function meters(w) { return doneReps(w).reduce((a, r) => a + (r.unit !== 'm' && r.dist ? r.dist : 0), 0); }
  function partSummary(part) {
    const reps = []; part.blocks.forEach(b => b.reps.forEach(r => { if (r.status === 'locked') reps.push(r); }));
    if (!reps.length) return null;
    const by = {}; reps.forEach(r => (by[r.label] = by[r.label] || []).push(r));
    return Object.keys(by).map(l => {
      const rs = by[l]; const vals = rs.map(r => r.unit === 'm' ? repNum(r) : repSec(r)).filter(v => v != null);
      if (rs[0].unit === 'm') return l + ': mejor ' + (vals.length ? Math.max(...vals).toFixed(2) + 'm' : '—');
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return rs.length + '×' + l + (avg ? ' · x̄ ' + fmtT(avg) : '');
    }).join(', ');
  }
  function renderHistory() {
    $title.innerHTML = 'Historial<small>' + workouts.length + ' entrenamientos</small>';
    if (!workouts.length) { $app.innerHTML = '<div class="empty">Aún no hay entrenos guardados.<br><br>Pega el primero en <b>Entreno</b>.</div>' + backupHtml(); return; }
    let h = '';
    weekGroups().forEach(({ k, items }) => {
      const end = parseISO(k); end.setDate(end.getDate() + 6);
      const start = parseISO(k);
      const km = items.reduce((a, w) => a + meters(w), 0);
      const days = new Set(items.map(w => parseISO(w.date).getDay()));
      const sd = SERIES_DAYS.map(d => `<span class="pill ${days.has(d) ? 'ok' : ''}">${DAYS[d].charAt(0).toUpperCase()} ${days.has(d) ? '✓' : '·'}</span>`).join(' ');
      h += `<div class="week"><div class="weekh"><b>Semana ${isoWeekNum(k)} · ${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}</b><span>${sd}</span></div>
        <div style="margin:-2px 2px 8px">${(() => { const ti = weekTagInfo(k); return `<button class="pill ${ti && ti.tag !== 'D' ? 'acc' : ''}" data-act="wtag" data-k="${k}" style="${ti && ti.auto ? 'border-style:dashed;opacity:.75' : ''}">${ti ? TAGS[ti.tag] + (ti.auto ? ' ?' : '') : 'Marcar carga/descarga'}</button>`; })()}${S.tagWeek === k ? tagPicker(k) : ''}</div>
        <div class="small muted" style="margin:-4px 2px 8px">${items.length} sesión${items.length > 1 ? 'es' : ''}${km ? ' · ' + (km / 1000).toFixed(2).replace('.', ',') + ' km de series' : ''}</div>`;
      items.forEach(w => {
        const sums = (w.type === 'free' ? '<div>' + esc(w.raw.length > 110 ? w.raw.slice(0, 108) + '…' : w.raw) + '</div>' : '') + gymSummary(w) + w.parts.map(p => { const s = partSummary(p); return s ? '<div>' + esc(p.title) + ': ' + esc(s) + '</div>' : ''; }).join('');
        h += `<button class="wo" data-act="open" data-id="${w.id}"><div class="d">${fmtDate(w.date)}${w.rpe ? ' · RPE ' + w.rpe : ''}</div><div class="g">${w.type === 'gym' ? '🏋 ' : ''}${esc(w.type === 'gym' ? w.group : prettyTitle(w.group))}</div><div class="s">${sums || 'Sin tiempos'}</div></button>`;
      });
      h += '</div>';
    });
    $app.innerHTML = h + backupHtml();
  }
  function backupHtml() {
    return `<div class="card" style="margin-top:24px"><b>Copia de seguridad</b><p class="small muted" style="margin:4px 0 10px">Los datos viven solo en este móvil. Exporta de vez en cuando.</p>
      <div class="row"><button class="btn grow" data-act="export">Exportar</button><button class="btn grow" data-act="import">Importar</button></div>
      <p class="tiny muted" style="margin:10px 0 0">Versión de la app: ${VERSION}</p></div>`;
  }

  function renderDetail() {
    const w = workouts.find(x => x.id === S.detailId);
    if (!w) { S.view = 'history'; return render(); }
    $title.innerHTML = esc(prettyTitle(w.group)) + '<small>' + fmtDate(w.date, true) + '</small>';
    $hdr.innerHTML = '<button class="hdrbtn" data-act="back-hist">‹ Volver</button>';
    let h = '';
    const reps = doneReps(w);
    if (w.type === 'gym') h += `<div class="stat"><div><b>${(w.lifts || []).reduce((a, l) => a + l.sets.filter(x => x.status === 'locked').length, 0)}</b><span>series de fuerza</span></div><div><b>${w.pct ? w.pct + '%' : '—'}</b><span>del RM</span></div><div><b>${w.rpe || '—'}</b><span>RPE</span></div></div>`;
    else h += `<div class="stat"><div><b>${reps.length}</b><span>series hechas</span></div><div><b>${(meters(w) / 1000).toFixed(2).replace('.', ',')} km</b><span>volumen</span></div><div><b>${w.rpe || '—'}</b><span>RPE</span></div></div>`;
    if (w.comment) h += `<ul class="notes"><li>${esc(w.comment)}</li></ul>`;
    if (w.type === 'gym') h += gymDetailHtml(w);
    if (w.type === 'free') h += `<div class="card"><div class="small muted">Lo que me contaste</div><div>${esc(w.raw)}</div></div>`;
    w.parts.forEach(part => {
      h += `<div class="card"><h3>${esc(part.title)}</h3>`;
      part.blocks.forEach((bl, b) => {
        if (part.blocks.length > 1) h += `<div class="small muted" style="margin-top:8px;font-weight:700">BLOQUE ${b + 1}</div>`;
        h += '<table class="tbl">';
        const vals = [];
        bl.reps.forEach(r => {
          let v, extra = '';
          if (r.status === 'skipped') v = '<span style="color:var(--bad)">' + (r.value ? 'Incompleta (' + esc(r.value) + ')' : 'No hecha') + '</span>';
          else if (r.unit === 'm') { const n = repNum(r); v = n != null ? n.toFixed(2) + ' m' : '—'; }
          else { const s = repSec(r); v = s != null ? '<b>' + fmtT(s) + '</b>' : '<span class="muted">sin dato</span>'; if (s != null) { vals.push(s); extra = paceStr(s, r.dist); } }
          h += `<tr><td>${esc(r.label)}${r.load ? ' <span class="muted small">· ' + esc(r.load) + ' kg</span>' : ''}</td><td class="r">${v}</td><td class="r muted small">${extra}</td></tr>`;
        });
        if (vals.length > 1) { const avg = vals.reduce((a, c) => a + c, 0) / vals.length; h += `<tr><td class="muted small">media · mejor</td><td class="r small">${fmtT(avg)}</td><td class="r small" style="color:var(--ok)">${fmtT(Math.min(...vals))}</td></tr>`; }
        h += '</table>';
      });
      h += '</div>';
    });
    if (w.raw) h += `<details class="card"><summary>Mensaje original del entrenador</summary><div class="parttxt">${esc(w.raw)}</div></details>`;
    h += `<div class="row"><button class="btn grow" data-act="share">Enviar al entrenador</button><button class="btn grow" data-act="editw">Editar</button></div>
      <button class="btn ghost block" data-act="delw" style="margin-top:8px;color:var(--bad)">Borrar entreno</button>`;
    $app.innerHTML = h;
  }

  function shareText(w) {
    let t = prettyTitle(w.group) + ' — ' + fmtDate(w.date, true) + '\n';
    if (w.type === 'gym') t += gymShareText(w);
    w.parts.forEach(part => {
      t += '\n' + part.title + '\n';
      part.blocks.forEach((bl, b) => {
        const xs = bl.reps.map(r => r.status === 'skipped' ? r.label + ' ✗' : r.status === 'locked' || r.value ? r.label + ' ' + (r.unit === 'm' ? r.value + 'm' : fmtT(repSec(r))) : null).filter(Boolean);
        if (xs.length) t += (part.blocks.length > 1 ? 'B' + (b + 1) + ': ' : '') + xs.join(' | ') + '\n';
      });
    });
    if (w.rpe) t += '\nRPE ' + w.rpe;
    if (w.comment) t += '\n' + w.comment;
    return t;
  }

  // ---------- progresión ----------
  function renderProgress() {
    $title.innerHTML = 'Progreso<small>Forma, ciclos y marcas</small>';
    const top = formHtml() + cyclesHtml() + '<h2 style="margin-top:22px">Por distancia y ejercicio</h2>';
    const series = {}; // label -> [{date, vals}]
    workouts.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(w => {
      const per = {};
      doneReps(w).forEach(r => {
        const v = r.unit === 'm' ? repNum(r) : repSec(r); if (v == null) return;
        const key = r.unit === 'm' ? r.label : r.label + ' m';
        (per[key] = per[key] || { unit: r.unit, vals: [], dist: r.dist }).vals.push(v);
      });
      (w.lifts || []).forEach(l => l.sets.forEach(x => {
        const v = parseFloat(String(x.value).replace(',', '.')); if (x.status !== 'locked' || isNaN(v)) return;
        const key = '🏋 ' + l.name; (per[key] = per[key] || { unit: 'kg', vals: [] }).vals.push(v);
      }));
      Object.keys(per).forEach(k => (series[k] = series[k] || []).push({ date: w.date, id: w.id, group: w.group, unit: per[k].unit, dist: per[k].dist, vals: per[k].vals }));
    });
    const keys = Object.keys(series).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    if (!keys.length) { $app.innerHTML = top + '<p class="small muted">Cuando guardes entrenos con tiempos verás aquí tu evolución por distancia.</p>'; return; }
    if (!S.prog || !series[S.prog]) S.prog = keys[0];
    let h = top + '<div class="chips">' + keys.map(k => `<button class="chip ${k === S.prog ? 'on' : ''}" data-act="prog" data-k="${esc(k)}">${esc(k)}</button>`).join('') + '</div>';
    const rows = series[S.prog]; const isM = rows[0].unit === 'm' || rows[0].unit === 'kg'; const U = rows[0].unit === 'kg' ? ' kg' : ' m';
    const pts = rows.map(r => ({ d: r.date, best: isM ? Math.max(...r.vals) : Math.min(...r.vals), avg: r.vals.reduce((a, b) => a + b, 0) / r.vals.length, n: r.vals.length, id: r.id, dist: r.dist }));
    const allBest = isM ? Math.max(...pts.map(p => p.best)) : Math.min(...pts.map(p => p.best));
    h += `<div class="card"><div class="stat"><div><b>${isM ? (Math.round(allBest * 100) / 100) + U : fmtT(allBest)}</b><span>mejor marca</span></div><div><b>${pts.length}</b><span>sesiones</span></div><div><b>${pts.reduce((a, p) => a + p.n, 0)}</b><span>repeticiones</span></div></div>`;
    if (pts.length > 1) h += spark(pts.map(p => p.avg), isM);
    h += '<table class="tbl">' + pts.slice().reverse().map(p => `<tr data-act="open" data-id="${p.id}"><td class="small">${fmtDate(p.d)}</td><td class="r small muted">${p.n}×</td><td class="r">x̄ ${isM ? p.avg.toFixed(2) : fmtT(p.avg)}</td><td class="r" style="color:var(--ok)">${isM ? p.best.toFixed(2) : fmtT(p.best)}</td></tr>`).join('') + '</table>';
    h += `<p class="tiny muted" style="margin-top:8px">${isM ? 'Más alto es mejor.' : 'Gráfica de la media por sesión: más abajo = más rápido.'}</p></div>`;
    $app.innerHTML = h;
  }
  function spark(vals, higherBetter) {
    const W = 300, H = 70, pad = 6;
    const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
    const xy = vals.map((v, i) => [pad + i * (W - 2 * pad) / (vals.length - 1), higherBetter ? H - pad - (v - mn) / rg * (H - 2 * pad) : pad + (v - mn) / rg * (H - 2 * pad)]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" points="${xy.map(p => p.join(',')).join(' ')}"/>${xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--acc2)"/>`).join('')}</svg>`;
  }

  // ---------- gimnasio ----------
  function nk(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function rmFor(name) {
    const k = nk(name); if (!k) return null;
    return rms.list.find(x => nk(x.name) === k) || rms.list.find(x => { const a = nk(x.name); return a.startsWith(k + ' ') || k.startsWith(a + ' '); }) || null;
  }
  function ensureExercise(name) {
    if (!name || rmFor(name)) return;
    rms.list.push({ id: uid(), name: cap(name), rm: null, date: null, history: [] }); persistRM();
  }
  function roundKg(x) { const r = +rms.round || 2.5; return Math.round(x / r) * r; }
  function fmtKg(x) { return x == null || isNaN(x) ? '—' : String(Math.round(x * 100) / 100).replace('.', ','); }
  function num(v) { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  function schemeStr(sc) {
    if (!sc || !sc.length) return '';
    const t = sc.map(x => x.join('+'));
    if (t.every(x => x === t[0])) return sc.length + '×' + (sc[0].length > 1 ? '(' + t[0] + ')' : t[0]);
    return t.join('-');
  }
  function liftTarget(w, l) {
    const pct = l.pct != null && l.pct !== '' ? +l.pct : w.pct;
    const e = rmFor(l.ref || l.name);
    return e && e.rm && pct ? roundKg(e.rm * pct / 100) : null;
  }
  function buildGymWorkout(g) {
    const scheme = g.scheme;
    const lifts = g.lifts.map(l => {
      ensureExercise(l.ref || l.name);
      return {
        name: l.name, ref: l.ref, detail: l.detail, pct: null,
        sets: scheme.flatMap((tandas, si) => tandas.map((reps, ti) => ({ n: si + 1, t: tandas.length > 1 ? ti : null, reps, value: '', status: 'pending' })))
      };
    });
    const applied = g.applied.map(gr => {
      const names = gr.variants.map(v => v.name);
      return {
        num: gr.num, name: gr.name, variants: gr.variants.map(v => {
          let name = v.name;
          if (names.filter(n => n === name).length > 1) { const after = v.detail.split(',').slice(1).join(',').trim(); if (after) name = cap(after.length > 70 ? after.slice(0, 68) + '…' : after); }
          return { code: v.code, name, detail: v.detail, sets: v.sets, reps: v.reps, done: Array(v.sets || 1).fill(false), load: '' };
        })
      };
    });
    const parts = [];
    if (false && g.drags) {
      const d = g.drags;
      parts.push({
        title: 'Arrastres', optional: d.optional, text: '', blocks: Array.from({ length: d.blocks }, (_, bi) => ({
          optional: false, restAfter: '', note: d.blockNotes[bi] || '',
          reps: Array.from({ length: d.reps }, (_, ri) => ({ dist: d.dist, label: String(d.dist), unit: 'time', rest: '', value: '', status: 'pending', optional: !!d.optional, load: '', loadHint: d.loads ? d.loads[ri % d.loads.length] : '' }))
        }))
      });
    }
    return { type: 'gym', id: null, date: draft.date, group: g.title, raw: draft.raw, notes: g.notes, endNotes: g.dragLines || [], pct: g.pct, scheme, lifts, applied, parts, comment: '', rpe: null };
  }

  function renderGymForm() {
    const w = draft.workout;
    $title.innerHTML = '🏋 ' + esc(w.group) + '<small>' + fmtDate(w.date) + (draft.editingId ? ' · editando' : '') + '</small>';
    $hdr.innerHTML = `<button class="hdrbtn" data-act="toggle-edit">${S.edit ? 'Hecho' : 'Editar'}</button>`;
    const pr = progress(w);
    let h = `<div class="sumbar"><span>${pr.done}/${pr.tot}</span><div class="bar"><i style="width:${pr.tot ? pr.done / pr.tot * 100 : 0}%"></i></div>
      <input type="date" id="fdate" value="${esc(w.date)}" style="background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:5px 6px;font-size:13px"></div>`;
    h += editBar();
    if (w.notes && w.notes.length) h += '<details class="card"><summary>Notas del entrenador (' + w.notes.length + ')</summary><ul class="notes" style="margin:0">' + w.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></details>';
    if (w.lifts.length) {
      h += `<div class="part"><h3>Fuerza · ${esc(schemeStr(w.scheme))}</h3>
        <div class="row small muted" style="margin-bottom:10px">al <input class="field" style="width:70px;padding:6px 8px" inputmode="decimal" data-act="gpct" value="${esc(w.pct == null ? '' : w.pct)}" placeholder="%"> % de tu RM</div>`;
      w.lifts.forEach((l, i) => {
        const ref = l.ref || l.name; const e = rmFor(ref); const tg = liftTarget(w, l);
        const pct = l.pct != null && l.pct !== '' ? l.pct : w.pct;
        h += `<div class="blk">`;
        const allDone = l.sets.length && l.sets.every(x => x.status !== 'pending');
        h += S.edit ? `<input class="field" style="font-weight:800;margin-bottom:6px" data-act="gname" data-i="${i}" value="${esc(l.name)}">` : `<div class="row" style="justify-content:space-between"><b style="font-size:18px;${allDone ? 'text-decoration:line-through;color:var(--ok)' : ''}">${esc(l.name)}</b><span class="row" style="gap:6px"><button class="chip ${allDone ? 'on' : ''}" style="padding:6px 10px;font-size:13px" data-act="gall" data-i="${i}">${allDone ? '✓ hecho' : '☐ todo'}</button><button class="chip ${S.gEdit === i ? 'on' : ''}" style="padding:6px 10px;font-size:13px" data-act="gedit" data-i="${i}">✏️</button></span></div>`;
        if (e && e.rm) h += `<div class="small muted" style="margin:2px 0 4px">RM${nk(ref) !== nk(l.name) ? ' de ' + esc(e.name) : ''}: ${fmtKg(e.rm)} kg → ${pct || '?'}% = <b style="color:var(--txt)">${tg != null ? fmtKg(tg) + ' kg' : '—'}</b> <button class="addrep" style="padding:0 0 0 6px" data-act="grm" data-i="${i}">cambiar RM</button></div>`;
        else h += `<button class="addrep" data-act="grm" data-i="${i}">+ Poner mi RM de ${esc(e ? e.name : ref)}</button>`;
        if (S.edit) {
          h += `<div class="row small muted" style="margin:6px 0;flex-wrap:wrap">RM de referencia <select class="field" style="width:auto;padding:6px" data-act="gref" data-i="${i}">${rms.list.map(x => `<option ${nk(x.name) === nk(e ? e.name : ref) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
            % propio <input class="field" style="width:64px;padding:6px" inputmode="decimal" data-act="glpct" data-i="${i}" value="${esc(l.pct == null ? '' : l.pct)}" placeholder="${esc(w.pct || '')}"></div>`;
        }
        if (l.detail) h += `<div class="parttxt clamp" data-act="expand">${esc(l.detail)}</div>`;
        if (S.gEdit === i) h += `<div class="tiny" style="color:var(--acc2);margin-top:6px">Toca una serie para cambiar el peso o las repeticiones, o marcarla como no hecha.</div>`;
        h += `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px">`;
        l.sets.forEach((x, j) => {
          const kg = x.value !== '' && x.value != null ? x.value : (tg != null ? fmtKg(tg) : '?');
          const reps = x.repsDone != null ? x.repsDone : x.reps;
          const chg = (x.value !== '' && x.value != null && (tg == null || num(x.value) !== tg)) || x.repsDone != null;
          const st = x.status === 'locked' ? 'done' : x.status === 'skipped' ? 'skip' : '';
          h += `<button class="gset ${st} ${chg ? 'chg' : ''}" data-act="gset" data-i="${i}" data-j="${j}">${x.status === 'locked' ? '✓ ' : ''}${x.status === 'skipped' ? esc(x.reps) + ' · no hecha' : (kg === '?' ? esc(reps) + ' reps' : esc(reps) + ' × ' + esc(kg) + ' kg')}${x.t != null ? '<small>serie ' + x.n + ' · tanda ' + (x.t + 1) + '</small>' : ''}</button>`;
        });
        h += `</div>`;
        if (S.edit) h += `<button class="addrep" data-act="gadd" data-i="${i}">+ Añadir serie</button> &nbsp; <button class="addrep" data-act="gdel" data-i="${i}">− Quitar serie</button> &nbsp; <button class="addrep" style="color:var(--bad)" data-act="gdellift" data-i="${i}">Quitar ejercicio</button>`;
        h += `</div>`;
      });
      if (S.edit) h += `<button class="addrep" data-act="gaddlift">+ Añadir ejercicio de fuerza</button>`;
      h += `<p class="tiny muted">Toca una serie para tacharla. Si hiciste otro peso u otras repeticiones, pulsa ✏️ en el ejercicio y luego la serie.</p></div>`;
    }
    if (w.applied.length) {
      h += `<div class="part"><h3>Ejercicios aplicados</h3>`;
      w.applied.forEach((g, gi) => {
        h += `<div class="blk"><div style="font-weight:800;margin-bottom:6px">${esc(g.num)}. ${esc(g.name)}</div>`;
        g.variants.forEach((v, vi) => {
          h += `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="small"><b style="color:var(--acc2)">${esc(v.code)}</b> ${esc(v.name)}</div>`;
          if (v.detail && v.detail.length > v.name.length + 3) h += `<div class="parttxt clamp tiny" data-act="expand" style="margin:2px 0 6px">${esc(v.detail)}</div>`;
          h += `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">${v.done.map((d, k) => `<button class="chip ${d ? 'on' : ''}" data-act="achip" data-g="${gi}" data-v="${vi}" data-k="${k}">${d ? '✓ ' : ''}${k + 1}ª · ${esc(v.reps || 'serie')}</button>`).join('')}
            <input class="field" style="width:78px;padding:7px 8px" inputmode="decimal" data-act="aload" data-g="${gi}" data-v="${vi}" value="${esc(v.load)}" placeholder="kg"></div></div>`;
        });
        h += `</div>`;
      });
      h += `</div>`;
    }
    h += renderParts(w);
    h += endNotesHtml(w);
    h += formFooter(w);
    $app.innerHTML = h;
  }
  function endNotesHtml(w) {
    return w.endNotes && w.endNotes.length ? '<div class="part"><h3>Arrastres</h3><ul class="notes">' + w.endNotes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '';
  }

  function gymLock(el) {
    const w = draft.workout; const i = +el.dataset.i, j = +el.dataset.j; const l = w.lifts[i]; const x = l.sets[j];
    if (x.status === 'locked') { x.status = 'pending'; persistDraft(); render(); setTimeout(() => { const n = document.getElementById(`gv-${i}-${j}`); n && n.focus(); }, 30); return; }
    if (!String(x.value).trim()) {
      const tg = liftTarget(w, l);
      if (tg == null) { toast('Escribe el peso (o pon tu RM para calcularlo)'); const n = document.getElementById(`gv-${i}-${j}`); n && n.focus(); return; }
      x.value = fmtKg(tg);
    }
    if (num(x.value) == null) { toast('Escribe el peso en kg, ej. 52,5'); return; }
    x.status = 'locked'; persistDraft(); render();
    const next = [...document.querySelectorAll('input[data-act="gval"]:not([disabled])')].find(n => (+n.dataset.i > i || (+n.dataset.i === i && +n.dataset.j > j)) && !n.value);
    if (next) next.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function askRM(name, cur) {
    const v = prompt('RM de ' + name + ' (kg):', cur ? fmtKg(cur) : '');
    if (v == null) return false;
    const n = num(v); if (n == null || n <= 0) { toast('Número no válido'); return false; }
    let e = rmFor(name); if (!e) { e = { id: uid(), name: cap(name), rm: null, date: null, history: [] }; rms.list.push(e); }
    e.rm = n; e.date = todayISO(); e.history = e.history || []; e.history.push({ date: e.date, rm: n, src: 'manual' });
    persistRM(); toast('RM de ' + e.name + ': ' + fmtKg(n) + ' kg'); return true;
  }

  function gymClick(a, el) {
    const w = draft.workout; const i = +el.dataset.i, j = +el.dataset.j;
    switch (a) {
      case 'glock': gymLock(el); return true;
      case 'gedit': S.gEdit = S.gEdit === i ? null : i; render(); return true;
      case 'gall': { const ss = w.lifts[i].sets; const all = ss.every(x => x.status !== 'pending'); ss.forEach(x => { if (all) { if (x.status === 'locked') x.status = 'pending'; } else if (x.status === 'pending') x.status = 'locked'; }); persistDraft(); render(); return true; }
      case 'gset': {
        const l = w.lifts[i], x = l.sets[j];
        if (S.gEdit === i) {
          const tg = liftTarget(w, l);
          const cur = (x.value !== '' && x.value != null ? x.value : (tg != null ? fmtKg(tg) : '')) + ' x ' + (x.repsDone != null ? x.repsDone : x.reps);
          const v = prompt('Serie ' + x.n + (x.t != null ? '.' + (x.t + 1) : '') + ' de ' + l.name + '. Escribe peso x repeticiones (ej. "55 x 8"), solo el peso ("55") o "no" si no la hiciste:', cur);
          if (v == null) return true;
          if (/^\s*no/i.test(v)) { x.status = 'skipped'; }
          else {
            const m = v.replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)\s*(?:kg)?\s*(?:[x×*]\s*(\d+))?/i);
            if (!m) { toast('No lo entiendo. Ej: 55 x 8'); return true; }
            x.value = fmtKg(+m[1]); x.repsDone = m[2] && +m[2] !== +x.reps ? +m[2] : null; x.status = 'locked';
          }
        } else x.status = x.status === 'pending' ? 'locked' : 'pending';
        persistDraft(); render(); return true;
      }
      case 'gskip': { const x = w.lifts[i].sets[j]; x.status = x.status === 'skipped' ? 'pending' : 'skipped'; persistDraft(); render(); return true; }
      case 'gdel': w.lifts[i].sets.splice(isNaN(j) ? w.lifts[i].sets.length - 1 : j, 1); persistDraft(); render(); return true;
      case 'gadd': { const ss = w.lifts[i].sets; const last = ss[ss.length - 1] || { n: 0, reps: 10, t: null }; ss.push({ n: last.n + 1, t: null, reps: last.reps, value: '', status: 'pending' }); persistDraft(); render(); return true; }
      case 'gdellift': if (confirm('¿Quitar ' + w.lifts[i].name + '?')) { w.lifts.splice(i, 1); persistDraft(); render(); } return true;
      case 'gaddlift': {
        const n = prompt('Nombre del ejercicio:'); if (!n) return true;
        ensureExercise(n);
        w.lifts.push({ name: cap(n.trim()), ref: null, detail: '', pct: null, sets: (w.scheme || [[10]]).flatMap((t, si) => t.map((reps, ti) => ({ n: si + 1, t: t.length > 1 ? ti : null, reps, value: '', status: 'pending' }))) });
        persistDraft(); render(); return true;
      }
      case 'grm': { const l = w.lifts[i]; const e = rmFor(l.ref || l.name); if (askRM(e ? e.name : (l.ref || l.name), e && e.rm)) render(); return true; }
      case 'achip': { const v = w.applied[+el.dataset.g].variants[+el.dataset.v]; const k = +el.dataset.k; v.done[k] = !v.done[k]; persistDraft(); render(); return true; }
    }
    return false;
  }
  function gymInput(a, el) {
    const w = draft.workout; if (!w) return false; const i = +el.dataset.i;
    switch (a) {
      case 'gval': w.lifts[i].sets[+el.dataset.j].value = el.value; persistDraft(); return true;
      case 'gname': w.lifts[i].name = el.value; persistDraft(); return true;
      case 'aload': w.applied[+el.dataset.g].variants[+el.dataset.v].load = el.value; persistDraft(); return true;
      case 'gpct': case 'glpct': return true; // se aplican al salir del campo (change)
    }
    return false;
  }
  function gymChange(el) {
    const w = draft.workout; const a = el.dataset.act; if (!w || !a) return;
    if (a === 'gpct') { w.pct = num(el.value); persistDraft(); render(); }
    if (a === 'glpct') { w.lifts[+el.dataset.i].pct = num(el.value); persistDraft(); render(); }
    if (a === 'gref') { w.lifts[+el.dataset.i].ref = el.value; persistDraft(); render(); }
  }

  function gymSummary(w) {
    if (w.type !== 'gym') return '';
    const lf = (w.lifts || []).map(l => { const vs = l.sets.filter(x => x.status === 'locked').map(x => num(x.value)).filter(v => v != null); return vs.length ? l.name + ' ' + fmtKg(Math.max(...vs)) : null; }).filter(Boolean);
    let ap = 0, at = 0; (w.applied || []).forEach(g => g.variants.forEach(v => v.done.forEach(d => { at++; if (d) ap++; })));
    return (lf.length ? '<div>Fuerza' + (w.pct ? ' al ' + w.pct + '%' : '') + ': ' + esc(lf.join(', ')) + ' kg</div>' : '') + (at ? '<div>Aplicados: ' + ap + '/' + at + ' series</div>' : '');
  }
  function gymDetailHtml(w) {
    let h = '';
    if ((w.lifts || []).length) {
      h += `<div class="card"><h3>Fuerza · ${esc(schemeStr(w.scheme))}${w.pct ? ' al ' + w.pct + '%' : ''}</h3><table class="tbl">`;
      w.lifts.forEach(l => {
        h += `<tr><td colspan="3" style="padding-top:10px"><b>${esc(l.name)}</b></td></tr>`;
        l.sets.forEach(x => {
          const v = x.status === 'skipped' ? '<span style="color:var(--bad)">No hecha</span>' : x.status === 'locked' ? '<b>' + esc(x.value) + ' kg</b>' : '<span class="muted">sin dato</span>';
          h += `<tr><td class="small">Serie ${x.n}${x.t != null ? '.' + (x.t + 1) : ''} · ${esc(x.repsDone != null ? x.repsDone + ' de ' + x.reps : x.reps)} reps</td><td class="r">${v}</td><td class="r muted small">${x.target != null ? 'obj. ' + fmtKg(x.target) : ''}</td></tr>`;
        });
      });
      h += '</table></div>';
    }
    if ((w.applied || []).length) {
      h += '<div class="card"><h3>Ejercicios aplicados</h3><table class="tbl">';
      w.applied.forEach(g => g.variants.forEach(v => {
        const d = v.done.filter(Boolean).length;
        h += `<tr><td class="small"><b>${esc(v.code)}</b> ${esc(v.name)}</td><td class="r small">${d}/${v.done.length} × ${esc(v.reps)}${v.load ? ' · ' + esc(v.load) + ' kg' : ''}</td></tr>`;
      }));
      h += '</table></div>';
    }
    return h + endNotesHtml(w);
  }
  function gymShareText(w) {
    let t = '';
    (w.lifts || []).forEach(l => { const xs = l.sets.map(x => x.status === 'locked' ? (x.repsDone != null ? x.repsDone : x.reps) + '×' + x.value : x.status === 'skipped' ? x.reps + '✗' : null).filter(Boolean); if (xs.length) t += l.name + ': ' + xs.join(' | ') + ' kg\n'; });
    (w.applied || []).forEach(g => g.variants.forEach(v => { const d = v.done.filter(Boolean).length; if (d) t += v.code + ' ' + d + '×' + v.reps + (v.load ? ' (' + v.load + ' kg)' : '') + '\n'; }));
    return t;
  }

  // ---------- calculadoras ----------
  function rmFactor(r) { if (r <= 1) return 1; return r <= 10 ? ((1 + r / 30) + 36 / (37 - r)) / 2 : 1 + r / 30; }
  function est1RM(wt, r) { if (!wt || !r || r < 1 || r > 30) return null; return wt * rmFactor(r); }
  function secTxt(s) { return s < 60 ? (Math.round(s * 10) / 10).toFixed(1).replace('.', ',') + ' s' : fmtT(Math.round(s * 10) / 10).replace('.', ','); }

  function renderCalc() {
    $title.innerHTML = 'Calculadora<small>Ritmos y gimnasio</small>';
    let h = `<div class="chips"><button class="chip ${S.calcTab === 'pace' ? 'on' : ''}" data-act="ctab" data-k="pace">⏱ Ritmos</button><button class="chip ${S.calcTab === 'rm' ? 'on' : ''}" data-act="ctab" data-k="rm">🏋 Gimnasio (RM)</button></div>`;
    if (S.calcTab === 'pace') {
      h += `<div class="card">
        <div class="chips"><button class="chip ${calc.mode === 't2p' ? 'on' : ''}" data-act="cmode" data-k="t2p">Tengo el tiempo → ritmo</button><button class="chip ${calc.mode === 'p2t' ? 'on' : ''}" data-act="cmode" data-k="p2t">Tengo el ritmo → tiempo</button></div>
        <label class="small muted">Distancia (m)</label>
        <input class="field" id="c-dist" inputmode="numeric" value="${esc(calc.dist)}" placeholder="300" style="margin:4px 0 6px">
        <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:12px">${[60, 100, 200, 300, 400, 600, 800, 1000, 1500, 3000].map(d => `<button class="chip" style="padding:5px 10px;font-size:13px" data-act="cdist" data-k="${d}">${d}</button>`).join('')}</div>
        <label class="small muted">Ritmo</label>
        <select class="field" id="c-unit" style="margin:4px 0 12px"><option value="100" ${calc.unit === '100' ? 'selected' : ''}>Ritmo al 100 m</option><option value="km" ${calc.unit === 'km' ? 'selected' : ''}>Ritmo al km</option></select>
        ${calc.mode === 't2p'
          ? `<label class="small muted">Tiempo objetivo (segundos, o min,seg: 4,30 = 4:30)</label><input class="field" id="c-time" inputmode="decimal" value="${esc(calc.time)}" placeholder="45" style="margin-top:4px">`
          : `<label class="small muted">${calc.unit === '100' ? 'Segundos cada 100 m' : 'Minutos por km (3,20 = 3:20)'}</label><input class="field" id="c-pace" inputmode="decimal" value="${esc(calc.pace)}" placeholder="${calc.unit === '100' ? '15' : '3,20'}" style="margin-top:4px">`}
        </div><div id="c-res">${paceResult()}</div>`;
    } else {
      h += `<div class="card">
        <label class="small muted">Ejercicio</label>
        <input class="field" id="c-ex" list="exlist" value="${esc(calc.ex)}" placeholder="Press banca" style="margin:4px 0 10px" autocomplete="off">
        <datalist id="exlist">${rms.list.map(x => `<option value="${esc(x.name)}">`).join('')}</datalist>
        <div class="row"><div class="grow"><label class="small muted">Peso (kg)</label><input class="field" id="c-w" inputmode="decimal" value="${esc(calc.w)}" placeholder="60" style="margin-top:4px"></div>
        <div class="grow"><label class="small muted">Repeticiones</label><input class="field" id="c-r" inputmode="numeric" value="${esc(calc.r)}" placeholder="5" style="margin-top:4px"></div></div>
        </div><div id="c-res">${rmResult()}</div>`;
      h += `<div class="card"><div class="row" style="justify-content:space-between"><b>Mis RMs</b><span class="small muted">Redondeo <select id="c-round" class="field" style="width:auto;padding:4px 6px">${[0.5, 1, 1.25, 2.5].map(r => `<option value="${r}" ${+rms.round === r ? 'selected' : ''}>${String(r).replace('.', ',')} kg</option>`).join('')}</select></span></div>
        <table class="tbl" style="margin-top:8px">${rms.list.map(e => `<tr><td>${esc(e.name)}<div class="tiny muted">${e.date ? fmtDate(e.date) : 'sin RM'}</div></td><td class="r"><b>${e.rm ? fmtKg(e.rm) + ' kg' : '—'}</b></td><td class="r" style="white-space:nowrap"><button class="ib" style="display:inline-flex;width:36px;height:36px" data-act="rmedit" data-id="${e.id}">✏️</button> <button class="ib del" style="display:inline-flex;width:36px;height:36px" data-act="rmdel" data-id="${e.id}">${ICON.trash}</button></td></tr>`).join('')}</table>
        <button class="addrep" data-act="rmadd">+ Añadir ejercicio</button>
        <p class="tiny muted">Los entrenos de gimnasio usan estos RMs para calcular tu peso de cada serie según el % que pida el entrenador.</p></div>`;
    }
    $app.innerHTML = h;
  }

  function paceResult() {
    const dist = num(calc.dist); if (!dist || dist <= 0) return '';
    let total;
    if (calc.mode === 't2p') total = parseTime(calc.time, dist);
    else { const p = calc.unit === '100' ? parseTime(calc.pace, 100) : parseTime(calc.pace, 1000); total = p ? p * dist / (calc.unit === '100' ? 100 : 1000) : null; }
    if (!total) return '';
    const p100 = total / dist * 100, pkm = total / dist * 1000;
    let main, sub;
    if (calc.mode === 't2p') {
      main = calc.unit === '100' ? `<b style="font-size:34px">${secTxt(p100)}</b><div class="muted">cada 100 m para hacer ${dist} m en ${fmtT(total).replace('.', ',')}</div>` : `<b style="font-size:34px">${fmtT(Math.round(pkm)).replace(/\.\d+$/, '')} /km</b><div class="muted">para hacer ${dist} m en ${fmtT(total).replace('.', ',')}</div>`;
      sub = calc.unit === '100' ? fmtT(Math.round(pkm)) + ' /km' : secTxt(p100) + ' cada 100 m';
    } else {
      main = `<b style="font-size:34px">${fmtT(Math.round(total * 10) / 10).replace('.', ',')}</b><div class="muted">tiempo total en ${dist} m</div>`;
      sub = calc.unit === '100' ? fmtT(Math.round(pkm)) + ' /km' : secTxt(p100) + ' cada 100 m';
    }
    let h = `<div class="card" style="border-color:var(--acc);text-align:center">${main}<div class="small muted" style="margin-top:8px">${sub} · ${(dist / total * 3.6).toFixed(1).replace('.', ',')} km/h · ${(dist / total).toFixed(2).replace('.', ',')} m/s</div></div>`;
    if (dist > 100) {
      const step = dist >= 3000 ? 1000 : dist >= 1200 ? 200 : 100;
      const marks = []; for (let d = step; d < dist; d += step) marks.push(d); marks.push(dist);
      h += '<div class="card"><b>Parciales</b><table class="tbl" style="margin-top:6px">' + marks.slice(0, 40).map(d => `<tr><td>${d} m</td><td class="r"><b>${fmtT(Math.round(total * d / dist * 10) / 10).replace('.', ',')}</b></td></tr>`).join('') + '</table></div>';
    }
    return h;
  }

  function rmResult() {
    const wt = num(calc.w), r = parseInt(calc.r, 10);
    const rm = est1RM(wt, r);
    if (!rm) return '<p class="small muted" style="margin:0 4px 12px">Escribe el peso y las repeticiones que hiciste (hasta 10 reps es lo más fiable).</p>';
    const ex = (calc.ex || '').trim();
    const e = ex ? rmFor(ex) : null;
    let h = `<div class="card" style="border-color:var(--acc);text-align:center"><div class="muted small">Tu RM estimado${ex ? ' en ' + esc(ex) : ''}</div><b style="font-size:38px">${fmtKg(Math.round(rm * 10) / 10)} kg</b>
      ${e && e.rm ? `<div class="small muted">RM guardado ahora: ${fmtKg(e.rm)} kg</div>` : ''}
      ${ex ? `<button class="btn pri block" data-act="rmsave" style="margin-top:10px">Guardar como mi RM de ${esc(e ? e.name : cap(ex))}</button>` : '<div class="tiny muted" style="margin-top:6px">Escribe el ejercicio para poder guardarlo</div>'}</div>`;
    h += '<div class="card"><b>Porcentajes</b><table class="tbl" style="margin-top:6px">' + [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map(p => `<tr><td>${p}%</td><td class="r"><b>${fmtKg(roundKg(rm * p / 100))} kg</b></td><td class="r muted small">${fmtKg(Math.round(rm * p) / 100)}</td></tr>`).join('') + '</table></div>';
    h += '<div class="card"><b>Peso para X repeticiones</b><table class="tbl" style="margin-top:6px">' + [1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => `<tr><td>${n} rep${n > 1 ? 's' : ''}</td><td class="r"><b>${fmtKg(roundKg(rm / rmFactor(n)))} kg</b></td></tr>`).join('') + '</table></div>';
    return h;
  }

  function calcClick(a, el) {
    switch (a) {
      case 'ctab': S.calcTab = el.dataset.k; render(); return true;
      case 'cmode': calc.mode = el.dataset.k; save(LS_CALC, calc); render(); return true;
      case 'cdist': calc.dist = el.dataset.k; save(LS_CALC, calc); render(); return true;
      case 'rmsave': {
        const rm = est1RM(num(calc.w), parseInt(calc.r, 10)); const ex = calc.ex.trim(); if (!rm || !ex) return true;
        let e = rmFor(ex); if (!e) { e = { id: uid(), name: cap(ex), rm: null, date: null, history: [] }; rms.list.push(e); }
        const v = Math.round(rm * 10) / 10; e.rm = v; e.date = todayISO(); (e.history = e.history || []).push({ date: e.date, rm: v, w: num(calc.w), r: parseInt(calc.r, 10) });
        persistRM(); toast('Guardado: RM de ' + e.name + ' = ' + fmtKg(v) + ' kg'); render(); return true;
      }
      case 'rmedit': { const e = rms.list.find(x => x.id === el.dataset.id); if (e && askRM(e.name, e.rm)) render(); return true; }
      case 'rmdel': { const e = rms.list.find(x => x.id === el.dataset.id); if (e && confirm('¿Borrar ' + e.name + ' de tu lista?')) { rms.list = rms.list.filter(x => x !== e); persistRM(); render(); } return true; }
      case 'rmadd': { const n = prompt('Nombre del ejercicio:'); if (n && n.trim()) { if (rmFor(n)) toast('Ya existe'); else { ensureExercise(n.trim()); const e = rmFor(n); askRM(e.name); } render(); } return true; }
      case 'back-input': S.view = 'input'; render(); return true;
      case 'setkey': { const v = (document.getElementById('set-key').value || '').trim(); settings.apiKey = v; save(LS_SET, settings); toast(v ? 'Clave guardada' : 'Clave borrada'); render(); return true; }
      case 'delkey': settings.apiKey = ''; save(LS_SET, settings); toast('Clave borrada'); render(); return true;
    }
    return false;
  }
  function calcInput(a, el) {
    const map = { 'c-dist': 'dist', 'c-time': 'time', 'c-pace': 'pace', 'c-ex': 'ex', 'c-w': 'w', 'c-r': 'r' };
    const k = map[el.id]; if (!k) return false;
    calc[k] = el.value; save(LS_CALC, calc);
    const res = document.getElementById('c-res'); if (res) res.innerHTML = S.calcTab === 'pace' ? paceResult() : rmResult();
    return true;
  }
  function calcChange(el) {
    if (el.id === 'c-unit') { calc.unit = el.value; save(LS_CALC, calc); render(); }
    if (el.id === 'c-round') { rms.round = +el.value; persistRM(); render(); }
  }

  // ---------- ajustes y lectura de fotos ----------
  function renderSettings() {
    $title.innerHTML = 'Ajustes';
    $hdr.innerHTML = '<button class="hdrbtn" data-act="back-input">‹ Volver</button>';
    const k = settings.apiKey;
    $app.innerHTML = `<div class="card"><b>Leer fotos con IA (Claude)</b>
      <p class="small muted">Para pasar a texto las fotos de la pizarra o la libreta, la app usa Claude, la IA de Anthropic. Necesitas una clave de API propia: créala en <b>console.anthropic.com</b> → API Keys y pégala aquí. Cada foto cuesta unos 2-4 céntimos y se cobra en tu cuenta de Anthropic. Te recomiendo ponerle un límite de gasto mensual en la consola.</p>
      <p class="small muted">La clave se guarda solo en este móvil y únicamente se envía a Anthropic al leer una foto.</p>
      <input class="field" id="set-key" type="password" autocomplete="off" placeholder="sk-ant-..." value="${esc(k)}">
      <div class="row" style="margin-top:10px"><button class="btn pri grow" data-act="setkey">Guardar clave</button>${k ? '<button class="btn" data-act="delkey">Borrar</button>' : ''}</div>
      <p class="small" style="margin:10px 0 0">${k ? '✓ Clave configurada' : 'Sin clave configurada'}</p></div>
      <div class="card"><b>Truco gratis sin clave</b><p class="small muted" style="margin-bottom:0">El iPhone ya sabe leer texto en fotos: abre la foto en <b>Fotos</b>, mantén pulsado sobre el texto → <b>Seleccionar todo</b> → <b>Copiar</b>, y pégalo en el cuadro de Entreno.</p></div>
      <p class="tiny muted">Versión de la app: ${VERSION}</p>`;
  }

  function ocrStatusHtml() {
    const o = S.ocr; if (!o) return '';
    if (o.state === 'nokey') return `<div class="card small" style="margin-top:10px;border-color:var(--acc)">Para leer fotos automáticamente tienes que poner tu clave de Claude en <button class="addrep" style="padding:0" data-act="settings">Ajustes</button>.<br><br><b>Truco gratis:</b> abre la foto en Fotos, mantén pulsado el texto → Seleccionar todo → Copiar, y pégalo aquí.</div>`;
    if (o.state === 'busy') return `<div class="card small" style="margin-top:10px">⏳ Leyendo foto ${o.i} de ${o.n}… (unos segundos)</div>`;
    if (o.state === 'done') return `<div class="card small" style="margin-top:10px;border-color:var(--ok)">✓ Texto de ${o.n} foto${o.n > 1 ? 's' : ''} añadido. Revísalo, pega debajo las aclaraciones del entrenador y pulsa <b>Analizar</b>.</div>`;
    if (o.state === 'error') return `<div class="card small" style="margin-top:10px;border-color:var(--bad)">⚠️ ${esc(o.msg)}</div>`;
    return '';
  }
  function setOcr(o) { S.ocr = o; const el = document.getElementById('ocrstatus'); if (el) el.innerHTML = ocrStatusHtml(); }
  function photoClick() {
    if (!settings.apiKey) { setOcr({ state: 'nokey' }); return; }
    document.getElementById('photofile').click();
  }
  document.getElementById('photofile').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    for (let i = 0; i < files.length; i++) {
      setOcr({ state: 'busy', i: i + 1, n: files.length });
      try {
        const text = await readPhoto(files[i]);
        draft.raw = (draft.raw.trim() ? draft.raw.trim() + '\n\n' : '') + text;
        persistDraft();
        const ta = document.getElementById('raw'); if (ta) ta.value = draft.raw;
      } catch (err) { setOcr({ state: 'error', msg: ocrError(err) }); return; }
    }
    setOcr({ state: 'done', n: files.length });
  });
  function ocrError(err) {
    const st = err && err.status;
    if (st === 401) return 'La clave de API no es válida. Revísala en Ajustes.';
    if (st === 403) return 'Tu clave no tiene permiso para usar este modelo.';
    if (st === 429) return 'Demasiadas peticiones seguidas. Espera un poco y vuelve a intentarlo.';
    if (st === 400 && /credit|billing/i.test(err.message || '')) return 'Tu cuenta de Anthropic no tiene saldo. Añade crédito en console.anthropic.com.';
    if (st >= 500) return 'El servicio de Claude no responde ahora mismo. Inténtalo en un rato.';
    if (err && err.message === 'refusal') return 'Claude no ha podido leer esta foto. Prueba con otra o pega el texto a mano.';
    if (err && err.message === 'img') return 'No se pudo abrir la imagen.';
    if (!navigator.onLine) return 'Sin conexión a internet.';
    return 'No se pudo leer la foto (' + ((err && err.message) || 'error') + ').';
  }
  function toJpegB64(file, max) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  const OCR_PROMPT = 'Eres un transcriptor. Recibes la foto de un entrenamiento de atletismo o de gimnasio escrito por un entrenador en una pizarra, libreta, papel o captura de pantalla. Transcribe el texto exactamente como aparece, en español, conservando los saltos de línea, la numeración, los números, las series (por ejemplo 3 x 300, 12+10+8, (8+6)), los porcentajes, los símbolos (x, +, -, \', ", %, flechas) y el orden. No añadas explicaciones, títulos ni comentarios, no corrijas ni interpretes el contenido. Si una palabra o número es ilegible escribe [?]. Si hay tachones, ignóralos. Devuelve solo el texto transcrito.';
  async function readPhoto(file) {
    const b64 = await toJpegB64(file, 1600);
    const mod = await import('./vendor/anthropic-sdk-1.7.0.mjs');
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
    const resp = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: OCR_PROMPT,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: 'Transcribe el entrenamiento de esta imagen.' }
      ] }]
    });
    if (resp.stop_reason === 'refusal') throw new Error('refusal');
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) throw new Error('sin texto');
    return text;
  }

  // ---------- ciclos (carga / descarga) ----------
  const TAGS = { C1: 'Carga 1', C2: 'Carga 2', C3: 'Carga 3', C4: 'Carga 4', D: 'Descarga' };
  const NEXT_TAG = { C1: 'C2', C2: 'C3', C3: 'D', C4: 'D', D: 'C1' };
  function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
  function weekTagInfo(k, depth) {
    if (weekTags[k]) return { tag: weekTags[k], auto: false };
    if ((depth || 0) > 8) return null;
    const prev = weekTagInfo(addDays(k, -7), (depth || 0) + 1);
    return prev ? { tag: NEXT_TAG[prev.tag], auto: true } : null;
  }
  function weekLabel(k) { const s = parseISO(k), e = parseISO(addDays(k, 6)); return s.getDate() + ' ' + MONTHS[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS[e.getMonth()]; }
  function isGymW(w) { return w.type === 'gym' || w.kind === 'gym'; }

  // Riegel: convierte una serie a "tiempo equivalente en 800 m" para comparar distancias distintas
  function eq800(sec, dist) { return sec * Math.pow(800 / dist, 1.06); }
  function sessionEq(w) {
    let sw = 0, sv = 0;
    doneReps(w).forEach(r => {
      if (r.unit === 'm' || !r.dist || r.dist < 100 || r.dist > 2000 || r.load !== undefined) return;
      const s = repSec(r); if (!s) return;
      const wt = r.dist >= 200 && r.dist <= 1000 ? 1 : 0.5;
      sw += wt; sv += wt * eq800(s, r.dist);
    });
    return sw ? sv / sw : null;
  }
  function weekStats(k) {
    const ws = workouts.filter(w => weekStart(w.date) === k);
    const run = ws.filter(w => !isGymW(w));
    const eqs = run.map(sessionEq).filter(v => v != null);
    const rpes = ws.map(w => w.rpe).filter(Boolean);
    const by = {};
    run.forEach(w => doneReps(w).forEach(r => { if (r.unit !== 'm' && r.load === undefined) { const key = r.label.replace(/\s.*$/, ''); (by[key] = by[key] || []).push(r); } }));
    return {
      n: ws.length, gym: ws.filter(isGymW).length, meters: run.reduce((a, w) => a + meters(w), 0),
      reps: run.reduce((a, w) => a + doneReps(w).length, 0),
      rpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
      eq: eqs.length ? eqs.reduce((a, b) => a + b, 0) / eqs.length : null, by
    };
  }
  function cyclesList() {
    const keys = new Set(Object.keys(weekTags)); workouts.forEach(w => keys.add(weekStart(w.date)));
    const now = weekStart(todayISO()); keys.add(now);
    const sorted = [...keys].sort(); const out = []; let cur = null; let k = sorted[0]; let guard = 0;
    while (k <= now && guard++ < 260) {
      const info = weekTagInfo(k);
      if (info) {
        if (info.tag === 'C1' || !cur) { cur = { weeks: [] }; out.push(cur); }
        cur.weeks.push({ k, tag: info.tag, auto: info.auto, st: weekStats(k) });
      }
      k = addDays(k, 7);
    }
    return out.reverse();
  }
  function cyclesHtml() {
    const cs = cyclesList();
    if (!cs.length) return '';
    let h = '<h2 style="margin-top:22px">Ciclos</h2>';
    cs.slice(0, 6).forEach((c, ci) => {
      const prev = cs[ci + 1];
      h += `<div class="card"><div class="row" style="justify-content:space-between"><b>${ci === 0 ? 'Ciclo actual' : 'Ciclo'} · desde ${weekLabel(c.weeks[0].k).split(' – ')[0]}</b><span class="small muted">${c.weeks.length} semana${c.weeks.length > 1 ? 's' : ''}</span></div>
        <table class="tbl" style="margin-top:8px;font-size:13px"><tr class="muted tiny"><td>Semana</td><td class="r">Series</td><td class="r">km</td><td class="r">Gym</td><td class="r">RPE</td><td class="r">Eq. 800</td></tr>`;
      c.weeks.forEach(wk => {
        const st = wk.st;
        h += `<tr><td><button class="pill ${wk.tag === 'D' ? '' : 'acc'}" data-act="wtag" data-k="${wk.k}" style="${wk.auto ? 'border-style:dashed;opacity:.75' : ''}">${TAGS[wk.tag]}${wk.auto ? ' ?' : ''}</button><div class="tiny muted">${weekLabel(wk.k)}</div></td>
          <td class="r">${st.reps || '—'}</td><td class="r">${st.meters ? (st.meters / 1000).toFixed(1).replace('.', ',') : '—'}</td><td class="r">${st.gym || '—'}</td><td class="r">${st.rpe ? st.rpe.toFixed(1).replace('.', ',') : '—'}</td><td class="r"><b>${st.eq ? fmtT(Math.round(st.eq * 10) / 10).replace('.', ',') : '—'}</b></td></tr>`;
        const ds = Object.keys(st.by).sort((a, b) => +a - +b).map(d => st.by[d].length + '×' + d);
        if (ds.length) h += `<tr><td colspan="6" class="tiny muted" style="border-bottom:1px solid var(--line);padding-top:0">${esc(ds.join(' · '))}</td></tr>`;
        if (S.tagWeek === wk.k) h += `<tr><td colspan="6">${tagPicker(wk.k)}</td></tr>`;
      });
      h += '</table>';
      // progresión dentro del ciclo: misma distancia en varias semanas
      const dists = {};
      c.weeks.forEach(wk => Object.keys(wk.st.by).forEach(d => { (dists[d] = dists[d] || []).push({ n: wk.st.by[d].length, secs: wk.st.by[d].map(repSec).filter(Boolean) }); }));
      const lines = Object.keys(dists).filter(d => dists[d].length > 1 && +d >= 60).map(d => {
        const arr = dists[d];
        const p = arr.map(a => a.secs.length ? per100(a.secs.reduce((x, y) => x + y, 0) / a.secs.length, +d).replace('/100m', '') : '—');
        return `<div class="small"><b>${d} m:</b> ${arr.map(a => a.n).join(' → ')} series · ${p.join(' → ')} /100m</div>`;
      });
      if (lines.length) h += `<div style="margin-top:10px"><div class="tiny muted" style="margin-bottom:4px">Mismas series a lo largo del ciclo (volumen → ritmo medio)</div>${lines.join('')}</div>`;
      if (prev) {
        const avg = (cy, f) => { const v = cy.weeks.map(x => x.st[f]).filter(x => x); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        const e1 = avg(c, 'eq'), e0 = avg(prev, 'eq'), m1 = avg(c, 'meters'), m0 = avg(prev, 'meters');
        const bits = [];
        if (e1 && e0) { const ch = (e0 - e1) / e0 * 100; bits.push(`ritmo eq. 800 ${Math.abs(ch).toFixed(1).replace('.', ',')}% ${ch >= 0 ? 'más rápido' : 'más lento'}`); }
        if (m1 && m0) { const ch = (m1 - m0) / m0 * 100; bits.push(`volumen semanal ${ch >= 0 ? '+' : ''}${ch.toFixed(0)}%`); }
        if (bits.length) h += `<div class="small" style="margin-top:10px;color:var(--info)">Frente al ciclo anterior: ${bits.join(' · ')}</div>`;
      }
      h += '</div>';
    });
    h += `<p class="tiny muted">"Eq. 800" convierte cada serie de 100 a 2000 m en el tiempo equivalente de un 800 (fórmula de Riegel), para poder comparar ciclos con series distintas. No es una predicción de carrera: sirve para ver la tendencia. Las semanas con "?" las he deducido yo; tócalas para marcarlas.</p>`;
    return h;
  }
  function tagPicker(k) {
    return `<div class="row" style="flex-wrap:wrap;gap:6px;margin:6px 0">${Object.keys(TAGS).map(t => `<button class="chip ${weekTags[k] === t ? 'on' : ''}" style="padding:6px 10px;font-size:13px" data-act="setwtag" data-k="${k}" data-t="${t}">${TAGS[t]}</button>`).join('')}<button class="chip" style="padding:6px 10px;font-size:13px" data-act="setwtag" data-k="${k}" data-t="">Sin marcar</button></div>`;
  }

  // ---------- estado de forma ----------
  function clamp(x) { return Math.max(0, Math.min(100, x)); }
  function formState(refISO) {
    const ref = parseISO(refISO);
    const daysAgo = w => Math.round((ref - parseISO(w.date)) / 864e5);
    const inWin = (w, a, b) => { const d = daysAgo(w); return d >= a && d <= b; };
    const run = workouts.filter(w => !isGymW(w));
    const recent = run.filter(w => inWin(w, 0, 20)), base = run.filter(w => inWin(w, 21, 62));
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const eqR = mean(recent.map(sessionEq).filter(v => v != null)), eqB = mean(base.map(sessionEq).filter(v => v != null));
    const parts = [];
    let ch = null;
    if (eqR && eqB) {
      ch = (eqB - eqR) / eqB * 100;
      parts.push({ name: 'Ritmo', w: 50, score: clamp(50 + ch * 10), txt: `Tus series (pasadas a equivalente de 800) van un ${Math.abs(ch).toFixed(1).replace('.', ',')}% ${ch >= 0 ? 'más rápidas' : 'más lentas'} que en las 6 semanas anteriores.` });
    } else parts.push({ name: 'Ritmo', w: 50, score: 50, txt: 'Aún no hay tiempos suficientes para comparar (hacen falta series de 100-2000 m en las últimas 3 semanas y en las 6 anteriores).', nodata: true });
    const rR = mean(workouts.filter(w => inWin(w, 0, 20) && w.rpe).map(w => w.rpe)), rB = mean(workouts.filter(w => inWin(w, 21, 62) && w.rpe).map(w => w.rpe));
    if (rR && rB) {
      const d = rB - rR;
      parts.push({ name: 'Esfuerzo', w: 20, score: clamp(50 + d * 12 + (ch || 0) * 4), txt: `RPE medio ${rR.toFixed(1).replace('.', ',')} frente a ${rB.toFixed(1).replace('.', ',')} antes${ch != null ? (d >= 0 && ch >= 0 ? ': más rápido con menos o igual esfuerzo 👌' : d < 0 && ch > 0 ? ': más rápido pero costando más' : '') : ''}.` });
    } else parts.push({ name: 'Esfuerzo', w: 20, score: 50, txt: 'Apunta el RPE al guardar para que cuente.', nodata: true });
    let tot = 0, done = 0;
    workouts.filter(w => inWin(w, 0, 27)).forEach(w => {
      w.parts.forEach(p => p.blocks.forEach(b => b.reps.forEach(r => { if (b.optional || r.optional) return; tot++; if (r.status === 'locked') done++; })));
      (w.lifts || []).forEach(l => l.sets.forEach(x => { tot++; if (x.status === 'locked') done++; }));
      (w.applied || []).forEach(g => g.variants.forEach(v => v.done.forEach(d => { tot++; if (d) done++; })));
    });
    const sess = workouts.filter(w => inWin(w, 0, 27)).length;
    const cov = Math.min(1, sess / 8), ratio = tot ? done / tot : (sess ? 1 : 0);
    parts.push({ name: 'Constancia', w: 20, score: clamp(100 * (0.6 * ratio + 0.4 * cov)), txt: `${sess} entrenos en 4 semanas · ${tot ? Math.round(ratio * 100) + '% de las series hechas' : 'sin series registradas'}.` });
    const chs = [];
    rms.list.forEach(e => {
      const hs = (e.history || []).filter(x => x.rm); if (hs.length < 2) return;
      const last = hs[hs.length - 1]; if (Math.round((ref - parseISO(last.date)) / 864e5) > 62) return;
      const prevH = hs[hs.length - 2]; chs.push((last.rm - prevH.rm) / prevH.rm * 100);
    });
    if (chs.length) { const a = mean(chs); parts.push({ name: 'Fuerza', w: 10, score: clamp(50 + a * 5), txt: `Tus RMs han ${a >= 0 ? 'subido' : 'bajado'} de media un ${Math.abs(a).toFixed(1).replace('.', ',')}%.` }); }
    else parts.push({ name: 'Fuerza', w: 10, score: 50, txt: 'Sin cambios de RM recientes. Cuando hagas retest, guárdalo en la Calculadora.', nodata: true });
    const total = Math.round(parts.reduce((a, p) => a + p.score * p.w, 0) / 100);
    return { total, parts, ch, enough: run.length >= 3 };
  }
  function formHtml() {
    const f = formState(todayISO());
    if (!f.enough) return `<div class="card"><b>Estado de forma</b><p class="small muted" style="margin-bottom:0">Cuando tengas al menos 3 entrenos de carrera con tiempos te enseño aquí una nota de forma (0-100) y si vas mejorando.</p></div>`;
    const old = formState(addDays(todayISO(), -21));
    const diff = f.total - old.total;
    const arrow = diff > 3 ? ['↑', 'var(--ok)', 'mejorando'] : diff < -3 ? ['↓', 'var(--bad)', 'bajando'] : ['→', 'var(--acc2)', 'estable'];
    let h = `<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><b>Estado de forma</b><div class="small muted">Últimas 3 semanas frente a las 6 anteriores</div></div>
      <div style="text-align:right"><span style="font-size:40px;font-weight:800">${f.total}</span><span style="font-size:28px;color:${arrow[1]};font-weight:800"> ${arrow[0]}</span><div class="tiny" style="color:${arrow[1]}">${arrow[2]}${old.enough ? ' (' + (diff >= 0 ? '+' : '') + diff + ' en 3 sem.)' : ''}</div></div></div>`;
    f.parts.forEach(p => {
      h += `<div style="margin-top:10px"><div class="row small" style="justify-content:space-between"><b>${p.name} <span class="tiny muted">${p.w}%</span></b><span>${p.nodata ? '—' : Math.round(p.score)}</span></div>
        <div class="bar" style="margin:4px 0"><i style="width:${p.score}%;${p.nodata ? 'opacity:.3' : ''}"></i></div><div class="tiny muted">${esc(p.txt)}</div></div>`;
    });
    h += `<details style="margin-top:10px"><summary>¿Cómo se calcula?</summary><div class="tiny muted">50 = igual que antes. Ritmo (50%): cada 1% más rápido suma 10 puntos; cuentan el doble las series de 200 a 1000 m (lo más cercano a tu 400/800). Esfuerzo (20%): bajar el RPE con el mismo ritmo suma. Constancia (20%): series hechas y entrenos en las últimas 4 semanas (8 = completo). Fuerza (10%): cambios de tus RMs. Las descargas no restan por hacer menos volumen.</div></details></div>`;
    return h;
  }

  // ---------- entreno libre (sin mensaje) ----------
  function quickWorkout(text, rpe) {
    const t = TrainParser.norm(text);
    const toks = TrainParser.findTokens(t);
    const reps = [];
    toks.forEach((k, idx) => {
      const seg = t.slice(k.e, idx + 1 < toks.length ? toks[idx + 1].i : t.length);
      const tm = seg.match(/^\s*(?:a|en|de|=|:)?\s*(\d+(?:[.,:']\d+){0,2})\s*(?:s\b|seg|"|segundos|min)?/i);
      const n = Math.max(k.countMax, 1);
      for (let c = 0; c < n; c++) k.dists.forEach(d => reps.push({ dist: d, label: String(d), unit: 'time', rest: '', value: tm ? tm[1] : '', status: 'locked', optional: false }));
    });
    const gym = GymParser.isGym(t) || /\bgym\b|gimnasio|pesas|fuerza|sentadilla|press/i.test(t);
    return { type: 'free', kind: gym ? 'gym' : 'run', id: null, date: draft.date, group: gym ? 'Gimnasio (sin mensaje)' : 'Entreno sin mensaje', raw: text, notes: [text], parts: reps.length ? [{ title: 'Series', text: '', blocks: [{ optional: false, restAfter: '', reps }] }] : [], comment: '', rpe: rpe || null };
  }

  // ---------- acciones ----------
  function getRep(el) { const p = +el.dataset.p, b = +el.dataset.b, r = +el.dataset.r; return { p, b, r, rep: draft.workout.parts[p].blocks[b].reps[r] }; }
  function focusNext(p, b, r) {
    const all = [...document.querySelectorAll('input.t:not([disabled])')];
    const cur = `in-${p}-${b}-${r}`;
    const ids = [...document.querySelectorAll('input.t')].map(x => x.id);
    const idx = ids.indexOf(cur);
    const next = all.find(x => ids.indexOf(x.id) > idx && !x.value);
    if (next) { next.focus(); next.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else document.activeElement && document.activeElement.blur();
  }
  function lockRep(el) {
    const { p, b, r, rep } = getRep(el);
    if (rep.status === 'locked') { rep.status = 'pending'; persistDraft(); render(); setTimeout(() => { const i = document.getElementById(`in-${p}-${b}-${r}`); i && i.focus(); }, 30); return; }
    if (!rep.value.trim()) { toast('Escribe primero el ' + (rep.unit === 'm' ? 'resultado' : 'tiempo')); document.getElementById(`in-${p}-${b}-${r}`).focus(); return; }
    if (rep.unit !== 'm' && repSec(rep) == null) { toast('No entiendo ese tiempo. Ej: 52,4 · 1,02,5 · 2:45'); return; }
    rep.status = 'locked'; persistDraft(); render(); focusNext(p, b, r);
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    const W = draft.workout;
    switch (a) {
      case 'paste':
        if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(t => { draft.raw = t; persistDraft(); render(); }).catch(() => toast('Mantén pulsado el cuadro y elige Pegar'));
        else toast('Mantén pulsado el cuadro y elige Pegar');
        break;
      case 'analyze': {
        draft.raw = document.getElementById('raw').value;
        if (!draft.raw.trim()) { toast('Pega primero el entreno'); return; }
        if (GymParser.isGym(draft.raw)) {
          draft.parsed = { gym: GymParser.parseGym(draft.raw) };
          draft.workout = buildGymWorkout(draft.parsed.gym); draft.stage = 'form'; S.edit = false;
          persistDraft(); render(); window.scrollTo(0, 0); break;
        }
        draft.parsed = TrainParser.parseWorkout(draft.raw);
        const ps = draft.parsed.sections;
        if (ps.length === 1 && !(ps[0].variants || []).length && !(draft.parsed.common && (draft.parsed.common.parts.length || draft.parsed.common.notes.length))) { draft.workout = buildWorkout(0); draft.stage = 'form'; }
        else draft.stage = 'choose';
        persistDraft(); render(); window.scrollTo(0, 0); break;
      }
      case 'back-paste': draft.stage = 'paste'; persistDraft(); render(); break;
      case 'choose': draft.workout = buildWorkout(+el.dataset.i, el.dataset.v === '' ? null : +el.dataset.v); draft.stage = 'form'; S.edit = false; persistDraft(); render(); window.scrollTo(0, 0); break;
      case 'expand': el.classList.toggle('clamp'); break;
      case 'toggle-edit': S.edit = !S.edit; render(); if (S.edit) toast('Modo edición activado'); break;
      case 'settings': S.view = 'settings'; render(); window.scrollTo(0, 0); break;
      case 'wtag': S.tagWeek = S.tagWeek === el.dataset.k ? null : el.dataset.k; render(); break;
      case 'setwtag': { const k = el.dataset.k; if (el.dataset.t) weekTags[k] = el.dataset.t; else delete weekTags[k]; save(LS_WK, weekTags); S.tagWeek = null; render(); break; }
      case 'quickrpe': draft.quickRpe = draft.quickRpe === +el.dataset.v ? null : +el.dataset.v; persistDraft(); render(); break;
      case 'quicksave': {
        const txt = (document.getElementById('quick').value || '').trim();
        if (!txt) { toast('Escribe qué hiciste'); break; }
        if (!draft.quickRpe) { toast('Elige el esfuerzo (RPE) del 1 al 10'); const el = document.querySelector('[data-act=quickrpe]'); if (el) el.parentNode.classList.add('need'); break; }
        const w = quickWorkout(txt, draft.quickRpe); w.id = uid(); w.savedAt = Date.now();
        workouts.push(w); persistW(); draft.quick = ''; draft.quickRpe = null; persistDraft();
        S.view = 'detail'; S.detailId = w.id; render(); window.scrollTo(0, 0); toast('Apuntado ✓ (puedes editarlo)'); break;
      }
      case 'editdist': {
        const { p, rep } = getRep(el); const old = rep.label;
        const v = prompt('Distancia de esta serie (metros):', String(rep.dist || parseFloat(old) || ''));
        if (v == null) break;
        const n = parseFloat(String(v).replace(',', '.'));
        if (isNaN(n) || n <= 0) { toast('Escribe un número de metros'); break; }
        const apply = x => { x.label = x.label.replace(/^[\d.,]+/, '') === x.label ? String(n) : x.label.replace(/^[\d.,]+/, String(n)); if (x.unit !== 'm') x.dist = n; };
        const same = []; W.parts[p].blocks.forEach(bl => bl.reps.forEach(x => { if (x !== rep && x.label === old) same.push(x); }));
        apply(rep);
        if (same.length && confirm('¿Cambiar también las otras ' + same.length + ' series de ' + old + ' de "' + W.parts[p].title + '" a ' + n + ' m?')) same.forEach(apply);
        persistDraft(); render(); break;
      }
      case 'editrest': {
        const { rep } = getRep(el);
        const v = prompt("Descanso después de esta serie (ej. 2', 1'30\", andando). Déjalo vacío para quitarlo:", rep.rest || '');
        if (v == null) break; rep.rest = v.trim(); persistDraft(); render(); break;
      }
      case 'photo': photoClick(); break;
      case 'choose-gym': draft.workout = buildGymWorkout(draft.parsed.gym); draft.stage = 'form'; S.edit = false; persistDraft(); render(); window.scrollTo(0, 0); break;
      case 'as-run': draft.parsed = TrainParser.parseWorkout(draft.raw); draft.stage = 'choose'; persistDraft(); render(); break;
      case 'as-gym': draft.parsed = { gym: GymParser.parseGym(draft.raw) }; persistDraft(); render(); break;
      default: if (gymClick(a, el) || calcClick(a, el)) break;
      case 'lock': lockRep(el); break;
      case 'skip': {
        const { rep } = getRep(el);
        rep.status = rep.status === 'skipped' ? 'pending' : 'skipped'; persistDraft(); render(); break;
      }
      case 'delrep': { const { p, b, r } = getRep(el); W.parts[p].blocks[b].reps.splice(r, 1); persistDraft(); render(); break; }
      case 'addrep': {
        const bl = W.parts[+el.dataset.p].blocks[+el.dataset.b];
        const last = bl.reps[bl.reps.length - 1];
        if (last && !last.rest && bl.reps.length > 1) last.rest = bl.reps[bl.reps.length - 2].rest;
        bl.reps.push(last ? Object.assign({}, last, { value: '', status: 'pending', optional: false, rest: '' }) : { dist: 100, label: '100', unit: 'time', rest: '', value: '', status: 'pending', optional: false });
        persistDraft(); render(); break;
      }
      case 'dupblk': {
        const part = W.parts[+el.dataset.p]; const bl = part.blocks[+el.dataset.b];
        const copy = JSON.parse(JSON.stringify(bl)); copy.reps.forEach(r => { r.value = ''; r.status = 'pending'; });
        part.blocks.splice(+el.dataset.b + 1, 0, copy); persistDraft(); render(); break;
      }
      case 'delblk': { W.parts[+el.dataset.p].blocks.splice(+el.dataset.b, 1); persistDraft(); render(); break; }
      case 'addblk': {
        const part = W.parts[+el.dataset.p]; const last = part.blocks[part.blocks.length - 1];
        const nb = last ? JSON.parse(JSON.stringify(last)) : { optional: false, restAfter: '', reps: [] };
        nb.optional = false; nb.reps.forEach(r => { r.value = ''; r.status = 'pending'; });
        part.blocks.push(nb); persistDraft(); render(); break;
      }
      case 'delpart': if (confirm('¿Quitar ' + W.parts[+el.dataset.p].title + '?')) { W.parts.splice(+el.dataset.p, 1); persistDraft(); render(); } break;
      case 'addpart': W.parts.push({ title: 'Dinámica ' + (W.parts.length + 1), text: '', blocks: [{ optional: false, restAfter: '', reps: [{ dist: 100, label: '100', unit: 'time', rest: '', value: '', status: 'pending', optional: false }] }] }); persistDraft(); render(); break;
      case 'rpe': W.rpe = W.rpe === +el.dataset.v ? null : +el.dataset.v; persistDraft(); render(); break;
      case 'savew': saveWorkout(); break;
      case 'discard': if (confirm('¿Descartar este entreno?')) { draft = newDraft(); S.edit = false; persistDraft(); render(); } break;
      case 'open': S.detailId = el.dataset.id; S.view = 'detail'; render(); window.scrollTo(0, 0); break;
      case 'back-hist': S.view = 'history'; render(); break;
      case 'delw': if (confirm('¿Borrar este entreno del historial?')) { workouts = workouts.filter(x => x.id !== S.detailId); persistW(); S.view = 'history'; render(); } break;
      case 'editw': {
        const w = workouts.find(x => x.id === S.detailId);
        if (draft.stage === 'form' && !draft.editingId && !confirm('Tienes un entreno sin guardar. ¿Reemplazarlo?')) return;
        draft = { stage: 'form', raw: w.raw, date: w.date, parsed: null, includeCommon: true, workout: JSON.parse(JSON.stringify(w)), editingId: w.id };
        persistDraft(); S.view = 'input'; render(); window.scrollTo(0, 0); break;
      }
      case 'share': {
        const w = workouts.find(x => x.id === S.detailId); const t = shareText(w);
        if (navigator.share) navigator.share({ text: t }).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Copiado: pégalo en WhatsApp'));
        break;
      }
      case 'prog': S.prog = el.dataset.k; render(); break;
      case 'export': exportData(); break;
      case 'import': document.getElementById('importfile').click(); break;
    }
  }
  $app.addEventListener('click', onClick);
  $hdr.addEventListener('click', onClick);

  $app.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'raw') { draft.raw = el.value; persistDraft(); return; }
    if (el.id === 'quick') { draft.quick = el.value; persistDraft(); return; }
    if (el.id === 'comment') { draft.workout.comment = el.value; persistDraft(); return; }
    const a = el.dataset.act;
    if (gymInput(a, el) || calcInput(a, el)) return;
    if (a === 'load') { const { rep } = getRep(el); rep.load = el.value; persistDraft(); return; }
    if (a === 'val') {
      const { p, b, r, rep } = getRep(el); rep.value = el.value;
      const pc = document.getElementById(`pc-${p}-${b}-${r}`); if (pc) pc.textContent = hint(rep);
      persistDraft();
    } else if (a === 'editlab') {
      const { rep } = getRep(el); rep.label = el.value;
      const n = parseFloat(el.value); if (rep.unit !== 'm') rep.dist = isNaN(n) ? null : n;
      persistDraft();
    } else if (a === 'edittitle') { draft.workout.parts[+el.dataset.p].title = el.value; persistDraft();
    } else if (a === 'editrest') { const { rep } = getRep(el); rep.rest = el.value; persistDraft(); }
  });
  $app.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'date') { draft.date = el.value || todayISO(); persistDraft(); render(); }
    if (el.id === 'fdate') { draft.workout.date = el.value || draft.workout.date; draft.date = draft.workout.date; persistDraft(); render(); }
    if (el.id === 'inclCommon') { draft.includeCommon = el.checked; persistDraft(); }
    gymChange(el); calcChange(el);
  });
  $app.addEventListener('keydown', e => {
    const el = e.target;
    if (el.dataset && el.dataset.act === 'gval' && e.key === 'Enter') { e.preventDefault(); gymLock(el); return; }
    if (el.dataset && el.dataset.act === 'val' && e.key === 'Enter') { e.preventDefault(); if (el.value.trim()) lockRep(el); else { const { p, b, r } = getRep(el); focusNext(p, b, r); } }
  });

  function saveWorkout() {
    const w = draft.workout;
    if (!w.rpe) { toast('Pon el esfuerzo (RPE) antes de guardar'); const el = document.querySelector('.rpe'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('need'); } return; }
    // bloquear automáticamente lo que tenga valor válido
    let missing = 0;
    (w.lifts || []).forEach(l => l.sets.forEach(x => {
      if (x.status === 'pending' && String(x.value).trim()) x.status = 'locked';
      if (x.status === 'locked') { x.target = liftTarget(w, l); if ((x.value === '' || x.value == null) && x.target != null) x.value = fmtKg(x.target); }
      if (x.status === 'pending') missing++;
    }));
    w.parts.forEach(p => p.blocks.forEach(b => b.reps.forEach(r => {
      if (r.status === 'pending' && r.value.trim() && (r.unit === 'm' ? repNum(r) != null : repSec(r) != null)) r.status = 'locked';
      if (r.status === 'pending' && !(b.optional || r.optional)) missing++;
    })));
    if (missing && !confirm(`Hay ${missing} serie${missing > 1 ? 's' : ''} sin tiempo. ¿Guardar igualmente?`)) { persistDraft(); render(); return; }
    // limpiar opcionales sin hacer
    w.parts.forEach(p => {
      p.blocks.forEach(b => { b.reps = b.reps.filter(r => !(r.optional && r.status === 'pending' && !r.value)); });
      p.blocks = p.blocks.filter(b => !(b.optional && b.reps.every(r => r.status === 'pending' && !r.value)));
      if (p.optional && p.blocks.every(b => b.reps.every(r => r.status === 'pending' && !r.value))) p.blocks = [];
    });
    w.parts = w.parts.filter(p => p.blocks.some(b => b.reps.length));
    w.savedAt = Date.now();
    if (draft.editingId) { w.id = draft.editingId; workouts = workouts.map(x => x.id === w.id ? w : x); }
    else { w.id = uid(); workouts.push(w); }
    persistW();
    draft = newDraft(); S.edit = false; persistDraft();
    S.view = 'detail'; S.detailId = w.id; render(); window.scrollTo(0, 0);
    toast('Entreno guardado ✓');
  }

  function exportData() {
    const data = JSON.stringify({ app: 'entrenos', version: 2, exportedAt: new Date().toISOString(), workouts, rms }, null, 1);
    const name = 'entrenos-' + todayISO() + '.json';
    const file = typeof File !== 'undefined' ? new File([data], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; a.click();
  }
  document.getElementById('importfile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      const d = JSON.parse(t); const list = Array.isArray(d) ? d : d.workouts;
      if (!Array.isArray(list)) throw new Error();
      const ids = new Set(workouts.map(w => w.id)); let n = 0;
      list.forEach(w => { if (w && w.id && w.parts && !ids.has(w.id)) { workouts.push(w); n++; } });
      if (d.rms && d.rms.list) { d.rms.list.forEach(e => { const cur = rmFor(e.name); if (!cur) rms.list.push(e); else if (e.rm && (!cur.rm || (e.date || '') > (cur.date || ''))) Object.assign(cur, e); }); persistRM(); }
      persistW(); toast(n + ' entrenos importados'); render();
    }).catch(() => toast('Archivo no válido'));
    e.target.value = '';
  });

  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.nav; S.edit = false; render(); window.scrollTo(0, 0); }));

  if ('serviceWorker' in navigator) {
    const hadCtrl = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtrl && !reloaded) { reloaded = true; location.reload(); } });
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  render();
})();
