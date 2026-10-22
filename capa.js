// Nome, capa e sinopse do filme pelo TMDB (themoviedb.org), em português — o mesmo da Estante.
// A chave fica no config.js (chaveTmdb). Sem chave, o filme só fica sem capa.
import { chaveTmdb } from "./config.js";

const API = "https://api.themoviedb.org/3";

/** Ano no nome do arquivo ("Interstellar.2014.1080p.mkv" → 2014), para escolher o filme certo. */
export const anoDoNome = (n) => Number((String(n || "").match(/(?:^|[\s._(\[-])((?:19|20)\d\d)(?=$|[\s._)\]-])/) || [])[1]) || 0;

/** Resposta do /search/multi → candidatos { titulo, img, resumo, pagina }: só com capa, o do ano certo primeiro. */
export function lerResposta(json, ano = 0) {
  const lista = (json?.results || [])
    .filter((x) => (x.media_type === "movie" || x.media_type === "tv") && /^\/\w+\.(jpg|png)$/.test(x.poster_path || "") && Number.isInteger(x.id))
    .map((x) => {
      const tv = x.media_type === "tv";
      const data = String((tv ? x.first_air_date : x.release_date) || "");
      return {
        titulo: String((tv ? x.name : x.title) || x.original_title || x.original_name || "").slice(0, 120),
        img: `https://image.tmdb.org/t/p/w500${x.poster_path}`,
        resumo: String(x.overview || "").slice(0, 400),
        pagina: `https://www.themoviedb.org/${tv ? "tv" : "movie"}/${x.id}`,
        ano: Number(data.slice(0, 4)) || 0,
      };
    });
  if (ano) lista.sort((a, b) => (b.ano === ano) - (a.ano === ano));
  return lista.map(({ ano: _, ...c }) => c);
}

/** Busca no TMDB e devolve a lista de candidatos (vazia se não achou, sem chave ou sem internet). */
export async function buscarCapa(titulo, ano = 0, chave = chaveTmdb) {
  if (!chave || !titulo || titulo.length < 2) return [];
  // Token v4 (longo, começa com "eyJ") vai no cabeçalho; chave v3 vai no endereço (igual à Estante).
  const bearer = chave.length > 60;
  const q = new URLSearchParams({ query: titulo, language: "pt-BR", include_adult: "false" });
  if (!bearer) q.set("api_key", chave);
  try {
    const r = await fetch(`${API}/search/multi?${q}`, bearer ? { headers: { Authorization: `Bearer ${chave}` } } : {});
    return r.ok ? lerResposta(await r.json(), ano) : [];
  } catch { return []; }
}

/** Capa vinda do banco: só aceita endereços do TMDB (ou do IMDb/Wikipédia, das capas já guardadas). */
export const capaValida = (c) => !!c && (
  (/^https:\/\/image\.tmdb\.org\/t\/p\//.test(c.img || "") && /^https:\/\/www\.themoviedb\.org\/(movie|tv)\/\d+$/.test(c.pagina || "")) ||
  (/^https:\/\/m\.media-amazon\.com\/images\//.test(c.img || "") && /^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/.test(c.pagina || "")) ||
  (/^https:\/\/upload\.wikimedia\.org\//.test(c.img || "") && /^https:\/\/pt\.wikipedia\.org\//.test(c.pagina || "")));
