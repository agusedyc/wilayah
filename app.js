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

export function searchRows(rows, q, limit = 50) {
  const needle = String(q).trim().toLowerCase();
  if (!needle) return [];
  const names = new Map(rows.map((r) => [r.code, r.name]));
  const levelKeys = [...new Set(rows.map((r) => String(r.code).length))].sort((a, b) => a - b);
  const ordered = levelKeys.flatMap((len) => rows.filter((r) => String(r.code).length === len));
  const hits = ordered.filter(
    (r) => String(r.code).startsWith(needle) || r.name.toLowerCase().includes(needle),
  );
  return hits.slice(0, limit).map((r) => {
    const a = ancestorsOf(r.code);
    const path = [a.prov, a.kab, a.kec].filter(Boolean).map((c) => names.get(c) || '').filter(Boolean).join(' / ');
    return { ...r, path };
  });
}
