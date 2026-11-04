// Cofre: cada aparelho baixa cada pedaço do filme do Drive uma vez só, numa única conexão, e guarda no próprio aparelho.
// O <video> passa a ler daqui (sw.js), então pular para um trecho já guardado não faz nenhum pedido ao Drive.
// O limite do Google continua existindo; o cofre só faz o Drive ser chamado o mínimo possível.
import { dadosDoArquivo } from "./drive.js";
import { proximoBloco } from "./sync.js";

const CAIXA = "matine-cofre";
const BLOCO = 2 * 1024 * 1024; // pequeno para o vídeo começar rápido depois de um pulo
const OUTROS_FILMES = 2; // filmes antigos que continuam guardados
const base = new URL(".", location.href).pathname;
const chaveBloco = (id, k) => `${base}__cofre/${id}/${k}`;
const chaveMeta = (id) => `${base}__cofre/${id}/meta`;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function iniciarServiceWorker() {
  navigator.serviceWorker?.register("sw.js", { type: "module", updateViaCache: "none" }).catch((e) => console.warn("Matinê: service worker", e));
}

/** Espera o service worker assumir a página (na primeira visita leva um instante). */
async function comControle() {
  const sw = navigator.serviceWorker;
  if (!sw || !globalThis.caches) return false;
  if (sw.controller) return true;
  await Promise.race([new Promise((ok) => sw.addEventListener("controllerchange", ok, { once: true })), dormir(4000)]);
  return !!sw.controller;
}

async function apagarFilme(cache, id) {
  const prefixo = `${base}__cofre/${id}/`;
  await Promise.all((await cache.keys()).filter((q) => new URL(q.url).pathname.startsWith(prefixo)).map((q) => cache.delete(q)));
}

/** Abre espaço: mantém poucos filmes antigos e apaga os mais velhos até caber o que falta. */
async function abrirEspaco(cache, id, falta) {
  const chaves = await cache.keys();
  const metas = [];
  for (const q of chaves) {
    const m = /__cofre\/([^/]+)\/meta$/.exec(new URL(q.url).pathname);
    if (m && m[1] !== id) metas.push({ id: m[1], usado: (await (await cache.match(q)).json()).usado || 0 });
  }
  metas.sort((a, b) => a.usado - b.usado);
  const livre = async () => { const e = await navigator.storage?.estimate?.(); return e?.quota ? e.quota - e.usage : Infinity; };
  while (metas.length && (metas.length > OUTROS_FILMES || (await livre()) < falta)) await apagarFilme(cache, metas.shift().id);
  return (await livre()) >= falta;
}

/**
 * Prepara o filme `id` do Drive. Devolve { src, fechar(), info() }, ou null quando o cofre não dá
 * (navegador sem suporte, sem espaço, erro do Drive): aí o vídeo toca direto do link, como antes.
 */
export async function abrirCofre(id, url, chave) {
  try {
    if (!(await comControle())) return null;
    const dados = await dadosDoArquivo(id, chave);
    if (!dados.ok || !dados.total) return null;
    const cache = await caches.open(CAIXA);
    const velha = await cache.match(chaveMeta(id)).then((r) => r?.json());
    if (velha && velha.versao !== dados.versao) await apagarFilme(cache, id); // o arquivo mudou no Drive

    const prefixo = `${base}__cofre/${id}/`;
    const tem = new Set();
    for (const q of await cache.keys()) {
      const p = new URL(q.url).pathname;
      if (p.startsWith(prefixo) && !p.endsWith("/meta")) tem.add(Number(p.slice(prefixo.length)));
    }
    const nBlocos = Math.ceil(dados.total / BLOCO);
    if (!(await abrirEspaco(cache, id, dados.total - tem.size * BLOCO))) return null;
    navigator.storage?.persist?.().catch(() => {});

    const meta = { total: dados.total, tipo: dados.tipo, versao: dados.versao, bloco: BLOCO, usado: Date.now() };
    const salvarMeta = () => cache.put(chaveMeta(id), new Response(JSON.stringify(meta)));
    await salvarMeta();

    let fechado = false, cursor = 0, emCurso = -1, conexao = null, pedidos = 0, erro = "";
    const tam = (k) => (k === nBlocos - 1 ? dados.total - k * BLOCO : BLOCO);

    /** Lê a conexão aberta guardando bloco a bloco; só para quando chega num trecho que já tem. */
    async function ler(resp, k, ctl) {
      const leitor = resp.body.getReader();
      let buf = new Uint8Array(tam(k)), n = 0;
      emCurso = k;
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) { if (k < nBlocos) throw new Error("conexão terminou antes da hora"); return; }
        for (let o = 0; o < value.length;) {
          const parte = Math.min(buf.length - n, value.length - o);
          buf.set(value.subarray(o, o + parte), n);
          n += parte; o += parte;
          if (n < buf.length) continue;
          await cache.put(chaveBloco(id, k), new Response(buf));
          tem.add(k);
          if (ctl.signal.aborted) return; // pediram outro trecho enquanto este era guardado
          k++; cursor = k; emCurso = k;
          if (k >= nBlocos || tem.has(k)) { ctl.abort(); return; }
          buf = new Uint8Array(tam(k)); n = 0;
        }
      }
    }

    async function rodar() {
      let espera = 1000;
      while (!fechado) {
        const k = proximoBloco(tem, Math.min(cursor, nBlocos - 1), nBlocos);
        if (k === null) return;
        cursor = k;
        const ctl = conexao = new AbortController();
        try {
          pedidos++;
          const r = await fetch(url, { headers: { Range: `bytes=${k * BLOCO}-` }, signal: ctl.signal });
          if (r.status !== 206) {
            if (r.status === 429 || r.status >= 500) throw new Error(`temporário ${r.status}`);
            const j = await r.json().catch(() => null);
            const motivo = j?.error?.errors?.[0]?.reason || "";
            if (/rateLimit/i.test(motivo)) throw new Error(motivo);
            erro = motivo || `erro ${r.status}`;
            r.body?.cancel().catch(() => {});
            meta.parado = true; await salvarMeta(); // o service worker vai direto ao Drive e o <video> mostra o erro certo
            return;
          }
          await ler(r, k, ctl);
          espera = 1000;
        } catch (e) {
          if (fechado) return;
          if (ctl.signal.aborted) { espera = 1000; continue; } // pulo pedido ou trecho já guardado
          if (e.name === "QuotaExceededError") { erro = "sem espaço neste aparelho"; meta.parado = true; await salvarMeta().catch(() => {}); return; }
          console.warn("Matinê: cofre vai tentar de novo", e);
          await dormir(espera);
          espera = Math.min(espera * 2, 30000);
        }
      }
    }

    // O player pediu um trecho que ainda não chegou: a conexão pula para lá (se não estiver quase chegando).
    const aoPedir = (ev) => {
      if (ev.data?.cofre !== id || fechado) return;
      const k = ev.data.k;
      if (tem.has(k) || (k >= emCurso && k <= emCurso + 2)) return;
      cursor = k;
      conexao?.abort();
    };
    navigator.serviceWorker.addEventListener("message", aoPedir);
    rodar().catch((e) => { erro = String(e?.message || e); });

    return {
      src: `${base}__filme/${id}?u=${encodeURIComponent(url)}`,
      fechar() { fechado = true; conexao?.abort(); navigator.serviceWorker.removeEventListener("message", aoPedir); },
      info: () => ({ feito: tem.size / nBlocos, pedidos, erro, total: dados.total }),
    };
  } catch (e) {
    console.warn("Matinê: cofre indisponível, tocando direto", e);
    return null;
  }
}

/** "Apagar meus dados": some com os filmes guardados. */
export const apagarCofre = () => globalThis.caches?.delete(CAIXA).catch(() => {});
