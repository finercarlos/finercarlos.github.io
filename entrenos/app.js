/* Entrenos — app de registro de entrenamientos (PWA, datos en el propio móvil) */
(function () {
  'use strict';
  const LS_W = 'entrenos.workouts.v1', LS_D = 'entrenos.draft.v1';
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
  const S = { view: 'input', detailId: null, edit: false, prog: null };

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
  function paceStr(sec, dist) {
    if (!sec || !dist) return '';
    if (dist >= 200) { const p = sec / dist * 1000; return fmtT(Math.round(p)).replace(/\.\d+$/, '') + '/km'; }
    return (dist / sec).toFixed(2) + ' m/s';
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
  function buildWorkout(secIdx) {
    const p = draft.parsed; const sec = p.sections[secIdx];
    const parts = [];
    let notes = sec.notes.slice();
    if (p.common && draft.includeCommon && p.common.parts.length) parts.push(...JSON.parse(JSON.stringify(p.common.parts)));
    parts.push(...JSON.parse(JSON.stringify(sec.parts)));
    if (!parts.some(x => x.blocks.length)) parts.push({ title: 'Series', text: '', blocks: [{ optional: false, restAfter: '', reps: [] }] });
    return { id: null, date: draft.date, group: sec.title, raw: draft.raw, notes, parts, comment: '', rpe: null };
  }

  // ---------- vistas ----------
  function render() {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.nav === (S.view === 'detail' ? 'history' : S.view)));
    $hdr.innerHTML = '';
    if (S.view === 'input') renderInput();
    else if (S.view === 'history') renderHistory();
    else if (S.view === 'detail') renderDetail();
    else if (S.view === 'progress') renderProgress();
  }

  function renderInput() {
    if (draft.stage === 'paste') {
      $title.innerHTML = 'Nuevo entreno<small>Pega el mensaje del entrenador</small>';
      $app.innerHTML = `
        <div class="datebox"><input type="date" id="date" value="${esc(draft.date)}"> ${dayInfo(draft.date)}</div>
        <textarea id="raw" placeholder="Pega aquí el entrenamiento tal cual te lo manda tu entrenador…">${esc(draft.raw)}</textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="paste">Pegar</button>
          <button class="btn pri grow" data-act="analyze">Analizar entreno</button>
        </div>
        <p class="muted small" style="margin-top:14px">Consejo: copia el mensaje entero de WhatsApp. Las secciones en mayúsculas (<b>_*VELOCIDAD-VALLAS*_</b>) se convierten en opciones y cada <b>*Dinámica*</b> en bloques para rellenar.</p>`;
      return;
    }
    if (draft.stage === 'choose') {
      $title.innerHTML = '¿Qué grupo haces hoy?<small>' + fmtDate(draft.date) + '</small>';
      $hdr.innerHTML = '<button class="hdrbtn" data-act="back-paste">Texto</button>';
      const p = draft.parsed;
      let h = '';
      if (p.common && (p.common.parts.length || p.common.notes.length)) {
        h += `<label class="check"><input type="checkbox" id="inclCommon" ${draft.includeCommon ? 'checked' : ''}>
          <span><b>Incluir parte común</b><br><span class="small muted">${esc(p.common.parts.map(x => x.title).concat(p.common.notes.map(n => n.split(/[.(]/)[0])).slice(0, 4).join(' · '))}</span></span></label>`;
      }
      p.sections.forEach((s, i) => {
        const nReps = s.parts.reduce((a, x) => a + x.blocks.reduce((b, bl) => b + bl.reps.filter(r => !r.optional && !bl.optional).length, 0), 0);
        const desc = s.parts.map(x => x.title + (x.blocks.length ? ': ' + summarizeStructure(x) : '')).join(' · ');
        h += `<button class="opt" data-act="choose" data-i="${i}"><b>${esc(prettyTitle(s.title))}</b><span class="small muted">${esc(desc || 'Sin series detectadas — podrás añadirlas a mano')}</span><br><span class="pill" style="margin-top:8px">${nReps} series</span></button>`;
      });
      $app.innerHTML = h;
      return;
    }
    renderForm();
  }

  function summarizeStructure(part) {
    const bl = part.blocks.filter(b => !b.optional);
    const optB = part.blocks.length - bl.length;
    if (!bl.length) return '';
    const inner = bl[0].reps.filter(r => !r.optional);
    const optR = bl[0].reps.length - inner.length;
    const labs = inner.map(r => r.label);
    let s;
    if (labs.length && labs.every(l => l === labs[0])) s = labs.length + '×' + labs[0] + (optR ? '(+' + optR + ')' : '');
    else s = labs.join('-');
    if (bl.length > 1 || optB) s = bl.length + (optB ? '-' + (bl.length + optB) : '') + '×(' + s + ')';
    return s;
  }

  function repRow(r, p, b, i) {
    const cls = ['rep', r.status === 'locked' ? 'locked' : '', r.status === 'skipped' ? 'skipped' : '', r.optional ? 'opt-rep' : ''].join(' ');
    const dis = r.status !== 'pending' ? 'disabled' : '';
    const unitLab = r.unit === 'm' ? 'metros' : (r.dist ? 'm' : '');
    const ph = r.status === 'skipped' ? (r.value ? 'Incompleta' : 'No hecha') : (r.unit === 'm' ? 'distancia (m)' : (r.dist >= 400 ? 'tiempo · ej 2,45' : r.dist <= 150 ? 'tiempo · ej 6,85' : 'tiempo · ej 52,4'));
    const lab = S.edit
      ? `<input class="editlab" inputmode="numeric" data-act="editlab" data-p="${p}" data-b="${b}" data-r="${i}" value="${esc(r.label)}">`
      : `<div class="lab">${esc(r.dist ? r.dist : r.label.split(' ')[0])}<small>${esc(r.dist ? unitLab : r.label.split(' ').slice(1).join(' '))}${r.optional ? ' · opc.' : ''}</small></div>`;
    const btns = S.edit
      ? `<button class="ib del" data-act="delrep" data-p="${p}" data-b="${b}" data-r="${i}" aria-label="Borrar serie">${ICON.trash}</button>`
      : `<button class="ib lock" data-act="lock" data-p="${p}" data-b="${b}" data-r="${i}" aria-label="${r.status === 'locked' ? 'Desbloquear' : 'Bloquear'}">${r.status === 'locked' ? ICON.unlock : ICON.lock}</button>
         <button class="ib skip ${r.status === 'skipped' ? 'on' : ''}" data-act="skip" data-p="${p}" data-b="${b}" data-r="${i}" aria-label="No hecha">${ICON.x}</button>`;
    return `<div class="${cls}">${lab}
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
    w.parts.forEach(p => p.blocks.forEach(b => b.reps.forEach(r => {
      if (!(b.optional || r.optional)) tot++;
      if (r.status !== 'pending' && !(b.optional || r.optional)) done++;
    })));
    return { tot, done };
  }

  function renderForm() {
    const w = draft.workout;
    $title.innerHTML = esc(prettyTitle(w.group)) + '<small>' + fmtDate(w.date) + (draft.editingId ? ' · editando' : '') + '</small>';
    $hdr.innerHTML = `<button class="hdrbtn" data-act="toggle-edit">${S.edit ? 'Hecho' : 'Editar'}</button>`;
    const pr = progress(w);
    let h = `<div class="sumbar"><span>${pr.done}/${pr.tot}</span><div class="bar"><i style="width:${pr.tot ? pr.done / pr.tot * 100 : 0}%"></i></div>
      <input type="date" id="fdate" value="${esc(w.date)}" style="background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:5px 6px;font-size:13px"></div>`;
    if (w.notes && w.notes.length) h += '<ul class="notes">' + w.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>';
    w.parts.forEach((part, p) => {
      h += `<div class="part"><h3>${esc(part.title)}</h3>`;
      if (part.text) h += `<div class="parttxt clamp" data-act="expand">${esc(part.text)}</div>`;
      const multi = part.blocks.length > 1;
      part.blocks.forEach((bl, b) => {
        h += `<div class="blk ${bl.optional ? 'optional' : ''}">`;
        if (multi || bl.optional || S.edit) {
          h += `<div class="blkh"><span>Bloque ${b + 1}${bl.optional ? ' <span class="pill">opcional</span>' : ''}</span>`;
          if (S.edit) h += `<span class="row" style="gap:6px"><button class="ib" data-act="dupblk" data-p="${p}" data-b="${b}" aria-label="Duplicar">⧉</button><button class="ib del" data-act="delblk" data-p="${p}" data-b="${b}" aria-label="Borrar bloque">${ICON.trash}</button></span>`;
          h += `</div>`;
        }
        bl.reps.forEach((r, i) => {
          h += repRow(r, p, b, i);
          if (i < bl.reps.length - 1) {
            h += S.edit ? `<div class="rest"><input class="field" style="padding:4px 8px;font-size:12px;width:120px" data-act="editrest" data-p="${p}" data-b="${b}" data-r="${i}" value="${esc(r.rest)}" placeholder="descanso"></div>`
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
    if (S.edit) h += `<button class="btn block" data-act="addpart" style="margin-bottom:16px">+ Añadir dinámica</button>`;
    h += `<div class="card"><div class="small muted" style="margin-bottom:6px">Esfuerzo percibido (RPE)</div><div class="rpe">${[...Array(10)].map((_, i) => `<button data-act="rpe" data-v="${i + 1}" class="${w.rpe === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
      <div class="small muted" style="margin:12px 0 6px">Sensaciones / notas</div><textarea class="field" id="comment" style="min-height:70px" placeholder="Clavos, viento, molestias, ritmos que te dio el entrenador…">${esc(w.comment)}</textarea></div>
      <button class="btn pri block" data-act="savew">Guardar entrenamiento</button>
      <button class="btn ghost block" data-act="discard" style="margin-top:8px;color:var(--mut)">Descartar</button>`;
    $app.innerHTML = h;
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
        <div class="small muted" style="margin:-4px 2px 8px">${items.length} sesión${items.length > 1 ? 'es' : ''}${km ? ' · ' + (km / 1000).toFixed(2).replace('.', ',') + ' km de series' : ''}</div>`;
      items.forEach(w => {
        const sums = w.parts.map(p => { const s = partSummary(p); return s ? '<div>' + esc(p.title) + ': ' + esc(s) + '</div>' : ''; }).join('');
        h += `<button class="wo" data-act="open" data-id="${w.id}"><div class="d">${fmtDate(w.date)}${w.rpe ? ' · RPE ' + w.rpe : ''}</div><div class="g">${esc(prettyTitle(w.group))}</div><div class="s">${sums || 'Sin tiempos'}</div></button>`;
      });
      h += '</div>';
    });
    $app.innerHTML = h + backupHtml();
  }
  function backupHtml() {
    return `<div class="card" style="margin-top:24px"><b>Copia de seguridad</b><p class="small muted" style="margin:4px 0 10px">Los datos viven solo en este móvil. Exporta de vez en cuando.</p>
      <div class="row"><button class="btn grow" data-act="export">Exportar</button><button class="btn grow" data-act="import">Importar</button></div></div>`;
  }

  function renderDetail() {
    const w = workouts.find(x => x.id === S.detailId);
    if (!w) { S.view = 'history'; return render(); }
    $title.innerHTML = esc(prettyTitle(w.group)) + '<small>' + fmtDate(w.date, true) + '</small>';
    $hdr.innerHTML = '<button class="hdrbtn" data-act="back-hist">‹ Volver</button>';
    let h = '';
    const reps = doneReps(w);
    h += `<div class="stat"><div><b>${reps.length}</b><span>series hechas</span></div><div><b>${(meters(w) / 1000).toFixed(2).replace('.', ',')} km</b><span>volumen</span></div><div><b>${w.rpe || '—'}</b><span>RPE</span></div></div>`;
    if (w.comment) h += `<ul class="notes"><li>${esc(w.comment)}</li></ul>`;
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
          h += `<tr><td>${esc(r.label)}</td><td class="r">${v}</td><td class="r muted small">${extra}</td></tr>`;
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
    $title.innerHTML = 'Progresión<small>Compara tus marcas por distancia</small>';
    const series = {}; // label -> [{date, vals}]
    workouts.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(w => {
      const per = {};
      doneReps(w).forEach(r => {
        const v = r.unit === 'm' ? repNum(r) : repSec(r); if (v == null) return;
        const key = r.unit === 'm' ? r.label : r.label + ' m';
        (per[key] = per[key] || { unit: r.unit, vals: [], dist: r.dist }).vals.push(v);
      });
      Object.keys(per).forEach(k => (series[k] = series[k] || []).push({ date: w.date, id: w.id, group: w.group, unit: per[k].unit, dist: per[k].dist, vals: per[k].vals }));
    });
    const keys = Object.keys(series).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    if (!keys.length) { $app.innerHTML = '<div class="empty">Cuando guardes entrenos con tiempos verás aquí tu evolución por distancia.</div>'; return; }
    if (!S.prog || !series[S.prog]) S.prog = keys[0];
    let h = '<div class="chips">' + keys.map(k => `<button class="chip ${k === S.prog ? 'on' : ''}" data-act="prog" data-k="${esc(k)}">${esc(k)}</button>`).join('') + '</div>';
    const rows = series[S.prog]; const isM = rows[0].unit === 'm';
    const pts = rows.map(r => ({ d: r.date, best: isM ? Math.max(...r.vals) : Math.min(...r.vals), avg: r.vals.reduce((a, b) => a + b, 0) / r.vals.length, n: r.vals.length, id: r.id, dist: r.dist }));
    const allBest = isM ? Math.max(...pts.map(p => p.best)) : Math.min(...pts.map(p => p.best));
    h += `<div class="card"><div class="stat"><div><b>${isM ? allBest.toFixed(2) + ' m' : fmtT(allBest)}</b><span>mejor marca</span></div><div><b>${pts.length}</b><span>sesiones</span></div><div><b>${pts.reduce((a, p) => a + p.n, 0)}</b><span>repeticiones</span></div></div>`;
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

  $app.addEventListener('click', e => {
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
        draft.parsed = TrainParser.parseWorkout(draft.raw);
        if (draft.parsed.sections.length === 1 && !(draft.parsed.common && draft.parsed.common.parts.length)) { draft.workout = buildWorkout(0); draft.stage = 'form'; }
        else draft.stage = 'choose';
        persistDraft(); render(); window.scrollTo(0, 0); break;
      }
      case 'back-paste': draft.stage = 'paste'; persistDraft(); render(); break;
      case 'choose': draft.workout = buildWorkout(+el.dataset.i); draft.stage = 'form'; S.edit = false; persistDraft(); render(); window.scrollTo(0, 0); break;
      case 'expand': el.classList.toggle('clamp'); break;
      case 'toggle-edit': S.edit = !S.edit; render(); break;
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
  });

  $app.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'raw') { draft.raw = el.value; persistDraft(); return; }
    if (el.id === 'comment') { draft.workout.comment = el.value; persistDraft(); return; }
    const a = el.dataset.act;
    if (a === 'val') {
      const { p, b, r, rep } = getRep(el); rep.value = el.value;
      const pc = document.getElementById(`pc-${p}-${b}-${r}`); if (pc) pc.textContent = hint(rep);
      persistDraft();
    } else if (a === 'editlab') {
      const { rep } = getRep(el); rep.label = el.value;
      const n = parseFloat(el.value); if (rep.unit !== 'm') rep.dist = isNaN(n) ? null : n;
      persistDraft();
    } else if (a === 'editrest') { const { rep } = getRep(el); rep.rest = el.value; persistDraft(); }
  });
  $app.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'date') { draft.date = el.value || todayISO(); persistDraft(); render(); }
    if (el.id === 'fdate') { draft.workout.date = el.value || draft.workout.date; draft.date = draft.workout.date; persistDraft(); render(); }
    if (el.id === 'inclCommon') { draft.includeCommon = el.checked; persistDraft(); }
  });
  $app.addEventListener('keydown', e => {
    const el = e.target;
    if (el.dataset && el.dataset.act === 'val' && e.key === 'Enter') { e.preventDefault(); if (el.value.trim()) lockRep(el); else { const { p, b, r } = getRep(el); focusNext(p, b, r); } }
  });

  function saveWorkout() {
    const w = draft.workout;
    // bloquear automáticamente lo que tenga valor válido
    let missing = 0;
    w.parts.forEach(p => p.blocks.forEach(b => b.reps.forEach(r => {
      if (r.status === 'pending' && r.value.trim() && (r.unit === 'm' ? repNum(r) != null : repSec(r) != null)) r.status = 'locked';
      if (r.status === 'pending' && !(b.optional || r.optional)) missing++;
    })));
    if (missing && !confirm(`Hay ${missing} serie${missing > 1 ? 's' : ''} sin tiempo. ¿Guardar igualmente?`)) { persistDraft(); render(); return; }
    // limpiar opcionales sin hacer
    w.parts.forEach(p => {
      p.blocks.forEach(b => { b.reps = b.reps.filter(r => !(r.optional && r.status === 'pending' && !r.value)); });
      p.blocks = p.blocks.filter(b => !(b.optional && b.reps.every(r => r.status === 'pending' && !r.value)));
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
    const data = JSON.stringify({ app: 'entrenos', version: 1, exportedAt: new Date().toISOString(), workouts }, null, 1);
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
      persistW(); toast(n + ' entrenos importados'); render();
    }).catch(() => toast('Archivo no válido'));
    e.target.value = '';
  });

  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.nav; S.edit = false; render(); window.scrollTo(0, 0); }));

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  render();
})();
