// Минимальное чтение .xlsx в браузере без библиотек: ZIP (через DecompressionStream) + XML листа.
// Читаются вычисленные значения формул (кэш <v>) и текст формулы (<f>).
(function (HD) {
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не поддерживает распаковку (нужен Chrome 80+, Safari 16.4+, Firefox 113+)');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function readZipIndex(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Это не xlsx-файл');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const entries = new Map();
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const compSize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = dec.decode(new Uint8Array(buf, off + 46, nameLen));
      entries.set(name, { method, compSize, local });
      off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function readEntry(buf, entry) {
    const dv = new DataView(buf);
    const nameLen = dv.getUint16(entry.local + 26, true);
    const extraLen = dv.getUint16(entry.local + 28, true);
    const start = entry.local + 30 + nameLen + extraLen;
    const raw = new Uint8Array(buf, start, entry.compSize);
    const bytes = entry.method === 0 ? raw : await inflateRaw(raw);
    return new TextDecoder().decode(bytes);
  }

  function xml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function byTag(node, tag) {
    // Пространства имён в xlsx мешают querySelector, поэтому ищем по localName
    return Array.from(node.getElementsByTagName('*')).filter((n) => n.localName === tag);
  }

  function colToNum(col) {
    let n = 0;
    for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }

  async function open(arrayBuffer) {
    const entries = readZipIndex(arrayBuffer);
    const get = async (name) => {
      const e = entries.get(name);
      return e ? readEntry(arrayBuffer, e) : null;
    };
    const wb = xml(await get('xl/workbook.xml'));
    const pr = byTag(wb, 'workbookPr')[0];
    const date1904 = pr && (pr.getAttribute('date1904') === '1' || pr.getAttribute('date1904') === 'true');
    const rels = xml(await get('xl/_rels/workbook.xml.rels'));
    const relMap = new Map(byTag(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
    const sheets = byTag(wb, 'sheet').map((s) => {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap.get(rid) || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      return { name: s.getAttribute('name'), path: target };
    });
    let shared = [];
    const ssText = await get('xl/sharedStrings.xml');
    if (ssText) shared = byTag(xml(ssText), 'si').map((si) => byTag(si, 't').map((t) => t.textContent).join(''));

    // Ячейки листа только в диапазоне строк [rowFrom, rowTo]
    async function readSheet(name, rowFrom, rowTo) {
      const sh = sheets.find((s) => s.name === name);
      if (!sh) throw new Error(`В файле нет листа «${name}»`);
      const doc = xml(await get(sh.path));
      const cells = new Map();
      for (const row of byTag(doc, 'row')) {
        const r = Number(row.getAttribute('r'));
        if (rowFrom && (r < rowFrom || r > rowTo)) continue;
        for (const c of Array.from(row.children).filter((n) => n.localName === 'c')) {
          const ref = c.getAttribute('r');
          const t = c.getAttribute('t');
          const vNode = Array.from(c.children).find((n) => n.localName === 'v');
          const fNode = Array.from(c.children).find((n) => n.localName === 'f');
          let v = vNode ? vNode.textContent : null;
          if (t === 's') v = shared[Number(v)];
          else if (t === 'b') v = v === '1';
          else if (t === 'inlineStr') v = byTag(c, 't').map((x) => x.textContent).join('');
          else if (t === 'str' || t === 'e') v = v;
          else if (v != null && v !== '') v = Number(v);
          const m = ref.match(/^([A-Z]+)(\d+)$/);
          cells.set(ref, { v, t: t || 'n', f: fNode ? fNode.textContent : null, col: colToNum(m[1]), row: Number(m[2]) });
        }
      }
      return cells;
    }

    return { sheets: sheets.map((s) => s.name), date1904, readSheet };
  }

  HD.xlsx = { open, colToNum };
})(window.HD);
