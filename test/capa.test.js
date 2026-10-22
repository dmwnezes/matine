import { test } from "node:test";
import assert from "node:assert/strict";
import { lerResposta, chaveBusca, anoDoNome, capaValida } from "../capa.js";

const json = { d: [
  { i: ["https://m.media-amazon.com/images/M/AAA._V1_.jpg", 10, 15], id: "tt0816692", l: "Interstellar", qid: "movie", s: "Matthew McConaughey", y: 2014 },
  { i: ["https://m.media-amazon.com/images/M/BBB._V1_.jpg", 10, 15], id: "tt9999999", l: "Interstellar", qid: "movie", y: 1990 },
  { i: ["https://m.media-amazon.com/images/M/CCC._V1_.jpg", 10, 15], id: "nm0000190", l: "Uma pessoa" },
  { id: "tt1111111", l: "Sem capa", qid: "movie" },
  { i: ["https://outro-site.com/x.jpg"], id: "tt2222222", l: "Capa de fora", qid: "movie" },
] };

test("lê a resposta do IMDb: só títulos com capa do IMDb, ano do arquivo primeiro", () => {
  const r = lerResposta(json);
  assert.deepEqual(r.map((c) => c.pagina), ["https://www.imdb.com/title/tt0816692/", "https://www.imdb.com/title/tt9999999/"]);
  assert.deepEqual(r[0], { titulo: "Interstellar", img: "https://m.media-amazon.com/images/M/AAA._V1_SX400.jpg", resumo: "2014 · Matthew McConaughey", pagina: "https://www.imdb.com/title/tt0816692/" });
  assert.equal(lerResposta(json, 1990)[0].pagina, "https://www.imdb.com/title/tt9999999/");
  assert.deepEqual(lerResposta({}), []);
});

test("termo de busca e ano a partir do nome", () => {
  assert.equal(chaveBusca("O Poderoso Chefão"), "opoderosochefao");
  assert.equal(chaveBusca("Cidade de Deus!"), "cidadededeus");
  assert.equal(anoDoNome("Interstellar.2014.1080p.BluRay.mkv"), 2014);
  assert.equal(anoDoNome("Blade Runner (1982).mp4"), 1982);
  assert.equal(anoDoNome("filme1080p.mp4"), 0);
});

test("só aceita capas do IMDb (ou as antigas da Wikipédia)", () => {
  assert.equal(capaValida(lerResposta(json)[0]), true);
  assert.equal(capaValida({ img: "https://upload.wikimedia.org/a.jpg", pagina: "https://pt.wikipedia.org/?curid=1" }), true);
  assert.equal(capaValida({ img: "https://evil.com/a.jpg", pagina: "https://www.imdb.com/title/tt1/" }), false);
  assert.equal(capaValida(null), false);
});
