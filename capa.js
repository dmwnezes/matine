// Nome e capa do filme pelo IMDb: a busca rápida do próprio site do IMDb (a mesma da caixa de pesquisa),
// sem chave. Ela não libera leitura por outros sites (CORS), só por <script> (JSONP), então é assim que vem.
// shortcut: endpoint não oficial do IMDb; se um dia parar, a capa só não aparece (o filme abre igual).

const TIPOS = new Set(["movie", "tvMovie", "tvSeries", "tvMiniSeries", "tvSpecial", "video", "short"]);

/** Termo da busca no formato que o IMDb aceita no nome do arquivo: sem acento, espaço ou pontuação. */
export const chaveBusca = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);

/** Ano no nome do arquivo ("Interstellar.2014.1080p.mkv" → 2014), para escolher o filme certo. */
export const anoDoNome = (n) => Number((String(n || "").match(/(?:^|[\s._(\[-])((?:19|20)\d\d)(?=$|[\s._)\]-])/) || [])[1]) || 0;

/** Resposta do IMDb → candidatos { titulo, img, resumo, pagina }, o do ano certo primeiro. */
export function lerResposta(json, ano = 0) {
  const lista = (json?.d || [])
    .filter((x) => Array.isArray(x.i) && /^https:\/\/m\.media-amazon\.com\/images\//.test(x.i[0] || "") && /^tt\d+$/.test(x.id || "") && (!x.qid || TIPOS.has(x.qid)))
    .map((x) => ({
      titulo: String(x.l || "").slice(0, 120),
      img: x.i[0].replace(/\._V1_.*\.(jpg|png)$/i, "._V1_SX400.$1"), // versão menor da capa
      resumo: [x.y, x.s].filter(Boolean).join(" · ").slice(0, 400),
      pagina: `https://www.imdb.com/title/${x.id}/`,
      ano: x.y || 0,
    }));
  if (ano) lista.sort((a, b) => (b.ano === ano) - (a.ano === ano));
  return lista.map(({ ano: _, ...c }) => c);
}

/** Busca no IMDb e devolve a lista de candidatos (vazia se não achou ou sem internet). */
export function buscarCapa(titulo, ano = 0) {
  const q = chaveBusca(titulo);
  if (q.length < 2) return Promise.resolve([]);
  return new Promise((resolver) => {
    const nome = "imdb$" + q;
    const s = document.createElement("script");
    let timer = 0;
    const fim = (v) => { clearTimeout(timer); s.remove(); resolver(v); };
    window[nome] = (json) => { delete window[nome]; fim(lerResposta(json, ano)); };
    s.onerror = () => fim([]);
    timer = setTimeout(() => fim([]), 6000);
    s.src = `https://sg.media-imdb.com/suggests/${q[0]}/${q}.json`;
    document.head.append(s);
  });
}

/** Capa vinda do banco: só aceita endereços do IMDb (ou da Wikipédia, das capas antigas). */
export const capaValida = (c) => !!c && (
  (/^https:\/\/m\.media-amazon\.com\/images\//.test(c.img || "") && /^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/.test(c.pagina || "")) ||
  (/^https:\/\/upload\.wikimedia\.org\//.test(c.img || "") && /^https:\/\/pt\.wikipedia\.org\//.test(c.pagina || "")));
