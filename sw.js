// Entrega ao <video> os pedaços do filme guardados pelo cofre (cofre.js). Nada além de /__filme/ passa por aqui.
import { faixaPedida } from "./sync.js";

const CAIXA = "matine-cofre";
const base = new URL(".", location.href).pathname;
const MAX_RESPOSTA = 8 * 1024 * 1024;
const ESPERA_BLOCO = 20000;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin === location.origin && u.pathname.startsWith(`${base}__filme/`)) e.respondWith(servir(e.request, u));
});

/** Onde a última resposta de cada filme terminou: pedido que começa ali é o <video> só continuando a leitura. */
const continuacoes = new Map();
function lembrarFim(id, pos) {
  const l = continuacoes.get(id) || [];
  continuacoes.set(id, [pos, ...l].slice(0, 8));
}

/** Espera o baixador da página trazer o bloco. Só um pedido de ponto novo (um pulo) faz a conexão ir até lá. */
async function esperarBloco(req, cache, id, k, chave, pulo) {
  if (pulo) for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ cofre: id, k });
  const fim = Date.now() + ESPERA_BLOCO;
  while (Date.now() < fim && !req.signal?.aborted) {
    const b = await cache.match(chave);
    if (b) return b;
    await dormir(100);
  }
  return null;
}

/** Sem a página baixando (ou com o limite do Drive): pede só este bloco, e o erro do Drive chega ao <video> como veio. */
async function buscarBloco(real, cache, chave, k, meta) {
  const ini = k * meta.bloco;
  const r = await fetch(real, { headers: { Range: `bytes=${ini}-${Math.min(ini + meta.bloco, meta.total) - 1}` } });
  if (r.status === 206) await cache.put(chave, r.clone()).catch(() => {});
  return r;
}

async function servir(req, u) {
  const id = u.pathname.slice(`${base}__filme/`.length);
  const real = u.searchParams.get("u");
  const range = req.headers.get("range");
  const cache = await caches.open(CAIXA);
  const metaR = await cache.match(`${base}__cofre/${id}/meta`);
  if (!metaR) return fetch(real, { headers: range ? { Range: range } : {} });
  const meta = await metaR.json();
  const f = faixaPedida(range, meta.total, MAX_RESPOSTA);
  if (!f) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${meta.total}` } });

  const pulo = !continuacoes.get(id)?.includes(f.ini);
  const partes = [];
  let pos = f.ini;
  while (pos <= f.fim) {
    const k = Math.floor(pos / meta.bloco);
    const chave = `${base}__cofre/${id}/${k}`;
    let b = await cache.match(chave);
    if (!b && !partes.length) {
      if (!meta.parado) b = await esperarBloco(req, cache, id, k, chave, pulo);
      if (!b) {
        b = await buscarBloco(real, cache, chave, k, meta);
        if (b.status !== 206) return b;
      }
    }
    if (!b) break; // entrega o que já tem; o <video> pede o resto depois
    const dados = await b.arrayBuffer();
    const de = pos - k * meta.bloco;
    const ate = Math.min(dados.byteLength, f.fim - k * meta.bloco + 1);
    partes.push(dados.slice(de, ate));
    pos = k * meta.bloco + ate;
  }
  const fim = pos - 1;
  lembrarFim(id, pos);
  return new Response(new Blob(partes), { status: 206, headers: {
    "Content-Type": meta.tipo, "Accept-Ranges": "bytes", "Content-Length": String(fim - f.ini + 1), "Content-Range": `bytes ${f.ini}-${fim}/${meta.total}`,
  } });
}
