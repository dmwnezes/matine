import { test } from "node:test";
import assert from "node:assert/strict";
import { lerResposta, anoDoNome, capaValida, buscarCapa } from "../capa.js";

const json = { results: [
  { media_type: "movie", id: 157336, title: "Interestelar", release_date: "2014-11-05", overview: "Uma equipe…", poster_path: "/abc.jpg" },
  { media_type: "movie", id: 99, title: "Interestelar", release_date: "1990-01-01", overview: "", poster_path: "/def.jpg" },
  { media_type: "person", id: 1, name: "Uma pessoa", profile_path: "/p.jpg" },
  { media_type: "movie", id: 2, title: "Sem capa", poster_path: null },
  { media_type: "tv", id: 1399, name: "A Série", first_air_date: "2011-04-17", overview: "Série.", poster_path: "/ghi.jpg" },
] };

test("lê a resposta do TMDB: filmes e séries com capa, ano do arquivo primeiro", () => {
  const r = lerResposta(json);
  assert.deepEqual(r.map((c) => c.pagina), ["https://www.themoviedb.org/movie/157336", "https://www.themoviedb.org/movie/99", "https://www.themoviedb.org/tv/1399"]);
  assert.deepEqual(r[0], { titulo: "Interestelar", img: "https://image.tmdb.org/t/p/w500/abc.jpg", resumo: "Uma equipe…", pagina: "https://www.themoviedb.org/movie/157336", ano: 2014 });
  assert.equal(r[2].titulo, "A Série");
  assert.equal(lerResposta(json, 1990)[0].pagina, "https://www.themoviedb.org/movie/99");
  assert.deepEqual(lerResposta({}), []);
});

test("ano a partir do nome do arquivo", () => {
  assert.equal(anoDoNome("Interstellar.2014.1080p.BluRay.mkv"), 2014);
  assert.equal(anoDoNome("Blade Runner (1982).mp4"), 1982);
  assert.equal(anoDoNome("filme1080p.mp4"), 0);
});

test("sem chave do TMDB não busca nada", async () => {
  assert.deepEqual(await buscarCapa("Interestelar", 0, ""), []);
});

test("só aceita capas do TMDB (ou as já guardadas do IMDb/Wikipédia)", () => {
  assert.equal(capaValida(lerResposta(json)[0]), true);
  assert.equal(capaValida({ img: "https://upload.wikimedia.org/a.jpg", pagina: "https://pt.wikipedia.org/?curid=1" }), true);
  assert.equal(capaValida({ img: "https://evil.com/a.jpg", pagina: "https://www.themoviedb.org/movie/1" }), false);
  assert.equal(capaValida(null), false);
});
