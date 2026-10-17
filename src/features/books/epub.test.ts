// @vitest-environment happy-dom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractBlocks, parseEpub, resolvePath } from './epub';

const CONTAINER = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const xhtml = (body: string) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{color:red}</style></head><body>${body}</body></html>`;

async function makeEpub(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return zip.generateAsync({ type: 'uint8array' });
}

const opf3 = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Mary and Friends</dc:title><dc:creator>Ana Pérez</dc:creator></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch%201.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="c2b" href="ch2b.xhtml" media-type="application/xhtml+xml"/><item id="cov" href="cover.png" media-type="image/png" properties="cover-image"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c2b"/></spine></package>`;

describe('EPUB 3', () => {
  it('lee título, autor, índice, capítulos partidos y portada', async () => {
    const data = await makeEpub({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf3,
      'OEBPS/nav.xhtml': xhtml(`<nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol><li><a href="ch%201.xhtml">Chapter One</a></li><li><a href="ch2.xhtml#start">Chapter Two</a></li></ol></nav>`),
      'OEBPS/ch 1.xhtml': xhtml(`<h1>The start</h1><p>Mary is a <i>housewife</i>; she enjoys her day.</p><p>Nowadays she is alone.</p>`),
      'OEBPS/ch2.xhtml': xhtml(`<div><h2>Second</h2><p>First paragraph.</p></div>`),
      'OEBPS/ch2b.xhtml': xhtml(`<p>Continues here.</p>`),
      'OEBPS/cover.png': new Uint8Array([137, 80, 78, 71]),
    });
    const b = await parseEpub(data);
    expect(b).toMatchObject({ title: 'Mary and Friends', author: 'Ana Pérez' });
    expect(b.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two']);
    expect(b.chapters[0].blocks).toEqual([
      { t: 'h', text: 'The start' },
      { t: 'p', text: 'Mary is a housewife; she enjoys her day.' },
      { t: 'p', text: 'Nowadays she is alone.' },
    ]);
    // ch2b no tiene título ni encabezado: continúa el capítulo anterior
    expect(b.chapters[1].blocks.map((x) => x.text)).toEqual(['Second', 'First paragraph.', 'Continues here.']);
    expect(b.cover?.type).toBe('image/png');
  });
});

describe('EPUB 2 (toc.ncx)', () => {
  it('toma los títulos del índice NCX', async () => {
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Old Book</dc:title></metadata>
<manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="a" href="a.html" media-type="application/xhtml+xml"/><item id="b" href="b.html" media-type="application/xhtml+xml"/></manifest>
<spine toc="ncx"><itemref idref="a"/><itemref idref="b"/></spine></package>`;
    const ncx = `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="1"><navLabel><text>Uno</text></navLabel><content src="a.html"/></navPoint><navPoint id="2"><navLabel><text>Dos</text></navLabel><content src="b.html#x"/></navPoint></navMap></ncx>`;
    const b = await parseEpub(
      await makeEpub({ 'META-INF/container.xml': CONTAINER, 'OEBPS/content.opf': opf, 'OEBPS/toc.ncx': ncx, 'OEBPS/a.html': xhtml('<p>Hola</p>'), 'OEBPS/b.html': xhtml('<p>Adiós</p>') }),
    );
    expect(b.title).toBe('Old Book');
    expect(b.author).toBe('');
    expect(b.chapters.map((c) => c.title)).toEqual(['Uno', 'Dos']);
  });
});

describe('errores', () => {
  it('un archivo que no es EPUB da un mensaje claro', async () => {
    await expect(parseEpub(new Uint8Array([1, 2, 3]))).rejects.toThrow(/no es un EPUB válido/);
    await expect(parseEpub(await makeEpub({ 'hola.txt': 'x' }))).rejects.toThrow(/container\.xml/);
  });
  it('un libro con DRM se rechaza, pero las fuentes ofuscadas no cuentan como DRM', async () => {
    const enc = (algo: string) => `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="${algo}"/></EncryptedData></encryption>`;
    const base = { 'META-INF/container.xml': CONTAINER, 'OEBPS/content.opf': opf3, 'OEBPS/ch 1.xhtml': xhtml('<p>Hi</p>'), 'OEBPS/ch2.xhtml': xhtml('<p>Yo</p>') };
    await expect(parseEpub(await makeEpub({ ...base, 'META-INF/encryption.xml': enc('http://www.w3.org/2001/04/xmlenc#aes128-cbc') }))).rejects.toThrow(/DRM/);
    const ok = await parseEpub(await makeEpub({ ...base, 'META-INF/encryption.xml': enc('http://www.idpf.org/2008/embedding') }));
    expect(ok.chapters.length).toBeGreaterThan(0);
  });
});

describe('extractBlocks', () => {
  it('separa párrafos, títulos, listas y citas; ignora scripts e imágenes', () => {
    const b = extractBlocks(xhtml(`<h3>Title</h3><script>x()</script><p>One<br/>two <img src="a.png"/></p><ul><li>item a</li><li>item b</li></ul><blockquote><p>quoted</p></blockquote>Loose text<div>in div</div>`));
    expect(b).toEqual([
      { t: 'h', text: 'Title' },
      { t: 'p', text: 'One\ntwo' },
      { t: 'p', text: 'item a' },
      { t: 'p', text: 'item b' },
      { t: 'p', text: 'quoted' },
      { t: 'p', text: 'Loose text' },
      { t: 'p', text: 'in div' },
    ]);
  });
  it('si el XHTML está mal formado igual saca el texto', () => {
    expect(extractBlocks('<html><body><p>Uno<p>Dos &nbsp;tres</body></html>').map((x) => x.text)).toEqual(['Uno', 'Dos tres']);
  });
});

describe('resolvePath', () => {
  it('resuelve rutas relativas, ../ y %20', () => {
    expect(resolvePath('OEBPS/content.opf', 'text/ch%201.xhtml#a')).toBe('OEBPS/text/ch 1.xhtml');
    expect(resolvePath('OEBPS/text/nav.xhtml', '../ch2.xhtml')).toBe('OEBPS/ch2.xhtml');
    expect(resolvePath('a/b.opf', '/x.html')).toBe('x.html');
  });
});
