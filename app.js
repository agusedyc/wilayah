const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);

const NEXT_LEVEL = {
  2: ['api/regencies/', '#col-kab'],
  4: ['api/districts/', '#col-kec'],
  6: ['api/villages/', '#col-desa'],
};

export function itemFor(entry) {
  const next = NEXT_LEVEL[String(entry.code).length];
  const label = `<span class="code">${entry.code}</span><span class="name">${esc(entry.name)}</span>`;
  if (!next) return `<button type="button" class="item leaf" data-code="${entry.code}">${label}</button>`;
  return `<button type="button" class="item" data-code="${entry.code}" hx-get="${next[0]}${entry.code}.json" hx-target="${next[1]}" hx-swap="innerHTML">${label}</button>`;
}

export function renderList(data) {
  return (data || []).map(itemFor).join('');
}

export function parseIndex(tsv) {
  const rows = [];
  for (const line of String(tsv).split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const code = Number(line.slice(0, tab));
    if (!code) continue;
    rows.push({ code, name: line.slice(tab + 1).trim() });
  }
  return rows;
}

export function ancestorsOf(code) {
  const s = String(code);
  return {
    prov: Number(s.slice(0, 2)),
    kab: s.length >= 4 ? Number(s.slice(0, 4)) : null,
    kec: s.length >= 6 ? Number(s.slice(0, 6)) : null,
    desa: s.length === 10,
  };
}

export function createSearch(rows) {
  const names = new Map(rows.map((r) => [r.code, r.name]));
  const prepared = rows
    .map((r) => ({ code: r.code, name: r.name, lower: r.name.toLowerCase(), len: String(r.code).length }))
    .sort((a, b) => a.len - b.len || a.code - b.code);

  return (q, limit = 50) => {
    const needle = String(q).trim().toLowerCase();
    if (!needle) return [];
    const hits = [];
    for (const r of prepared) {
      if (!String(r.code).startsWith(needle) && !r.lower.includes(needle)) continue;
      const a = ancestorsOf(r.code);
      const path = [a.prov, a.kab, a.kec]
        .filter(Boolean)
        .map((c) => names.get(c) || '')
        .filter(Boolean)
        .join(' / ');
      hits.push({ code: r.code, name: r.name, path });
      if (hits.length === limit) break;
    }
    return hits;
  };
}

// ---- wiring browser ----

const COLUMNS = ['col-prov', 'col-kab', 'col-kec', 'col-desa'];
const EMPTY = [
  'Pilih provinsi untuk mulai',
  'Pilih provinsi dahulu',
  'Pilih kab/kota dahulu',
  'Pilih kecamatan dahulu',
];

function placeholder(text) {
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;
  return p;
}

function resetColumns(from) {
  for (let i = from; i < COLUMNS.length; i++) {
    document.getElementById(COLUMNS[i]).replaceChildren(placeholder(EMPTY[i]));
  }
}

function showDetail(btn) {
  const levels = ['prov', 'kab', 'kec', 'desa'];
  const upto = levels.indexOf(btn.closest('section').dataset.level);
  const path = levels
    .slice(0, upto + 1)
    .map((lv) => document.querySelector(`.explorer section[data-level="${lv}"] .item[aria-current="true"] .name`)?.textContent)
    .filter(Boolean);

  const box = document.getElementById('detail');
  const title = document.createElement('h2');
  title.textContent = btn.querySelector('.name').textContent;
  const code = document.createElement('p');
  code.className = 'muted';
  code.textContent = `Kode ${btn.dataset.code}`;
  const crumb = document.createElement('p');
  crumb.textContent = path.join(' / ');
  box.replaceChildren(title, crumb, code);
  box.hidden = false;
}

function showError(target, action) {
  const box = document.createElement('p');
  box.className = 'error';
  box.textContent = 'Data wilayah tidak tersedia. ';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'retry';
  retry.textContent = 'Coba lagi';
  retry.addEventListener('click', () => htmx.ajax('GET', action, { target, swap: 'innerHTML' }));
  box.append(retry);
  target.replaceChildren(box);
}

let indexPromise;
function loadIndex() {
  indexPromise ||= fetch('api/search.txt')
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`index ${r.status}`))))
    .then((text) => createSearch(parseIndex(text)))
    .catch((err) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

async function fillCascade(code) {
  const a = ancestorsOf(code);
  const steps = [
    ['col-prov', 'api/provinces.json', a.prov],
    ['col-kab', `api/regencies/${a.prov}.json`, a.kab],
    ['col-kec', `api/districts/${a.kab}.json`, a.kec],
    ['col-desa', `api/villages/${a.kec}.json`, a.desa ? code : null],
  ];
  const lastFilled = steps.filter(([, , active]) => active).length - 1;
  resetColumns(lastFilled + 1);
  for (const el of document.querySelectorAll('.explorer .item[aria-current="true"]')) {
    el.removeAttribute('aria-current');
  }
  for (const [col, url, active] of steps) {
    if (!active) continue;
    await htmx.ajax('GET', url, { target: `#${col}`, swap: 'innerHTML' });
    const btn = document.querySelector(`#${col} .item[data-code="${active}"]`);
    if (!btn) continue;
    btn.setAttribute('aria-current', 'true');
    btn.scrollIntoView({ block: 'nearest' });
    if (btn.classList.contains('leaf')) showDetail(btn);
  }
}

function initSearch() {
  const input = document.getElementById('q');
  const box = document.getElementById('results');
  let rows = null;
  let timer;

  const ensure = () => (rows ? Promise.resolve(rows) : loadIndex().then((r) => (rows = r)));

  input.addEventListener('focus', () => {
    ensure().catch(() => {});
  });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        box.hidden = true;
        box.replaceChildren();
        return;
      }
      let hits;
      try {
        hits = (await ensure())(q);
      } catch {
        box.hidden = false;
        box.replaceChildren(placeholder('Indeks pencarian gagal dimuat.'));
        return;
      }
      box.replaceChildren();
      if (!hits.length) {
        box.append(placeholder('Tidak ada hasil.'));
      }
      for (const hit of hits) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'result';
        btn.dataset.code = hit.code;
        const name = document.createElement('span');
        name.textContent = hit.name;
        btn.append(name);
        if (hit.path) {
          const path = document.createElement('span');
          path.className = 'path';
          path.textContent = `${hit.path} · ${hit.code}`;
          btn.append(path);
        } else {
          const meta = document.createElement('span');
          meta.className = 'path';
          meta.textContent = String(hit.code);
          btn.append(meta);
        }
        btn.addEventListener('click', () => {
          box.hidden = true;
          fillCascade(hit.code).catch(() => showError(document.getElementById('col-prov'), 'api/provinces.json'));
        });
        box.append(btn);
      }
      box.hidden = false;
    }, 150);
  });
}

function boot() {
  htmx.registerExtension('json-html', {
    htmx_after_request(elt, detail) {
      const type = detail.ctx.response.headers.get('content-type') || '';
      if (!type.includes('json')) return;
      try {
        detail.ctx.text = renderList(JSON.parse(detail.ctx.text).data);
      } catch {
        detail.ctx.text = '<p class="error">Data tidak dikenali.</p>';
      }
    },
  });

  const onFail = (evt) => {
    const ctx = evt.detail?.ctx;
    if (ctx?.target) showError(ctx.target, ctx.request.action);
  };
  htmx.on('htmx:error', onFail);
  htmx.on('htmx:response:error', onFail);

  document.querySelector('.explorer').addEventListener('click', (evt) => {
    const btn = evt.target.closest('.item');
    if (!btn) return;
    const levels = ['prov', 'kab', 'kec', 'desa'];
    const index = levels.indexOf(btn.closest('section').dataset.level);
    for (const el of document.querySelectorAll('.explorer .item[aria-current="true"]')) {
      if (levels.indexOf(el.closest('section').dataset.level) >= index) el.removeAttribute('aria-current');
    }
    btn.setAttribute('aria-current', 'true');
    document.getElementById('detail').hidden = true;
    resetColumns(index + 1);
    if (!btn.hasAttribute('hx-get')) showDetail(btn);
  });

  initSearch();

  fetch('api/version.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      const ver = document.getElementById('ver');
      if (v && ver) ver.textContent = `Data per ${v.data_version}.`;
    })
    .catch(() => {});
}

if (typeof document !== 'undefined' && globalThis.htmx) boot();

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
