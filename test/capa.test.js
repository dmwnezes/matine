import { test } from "node:test";
import assert from "node:assert/strict";
import { lerResposta } from "../capa.js";

test("lê a resposta da Wikipédia", () => {
  const json = { query: { pages: { 42: { pageid: 42, index: 1, title: "Interstellar", extract: "Um filme.", thumbnail: { source: "https://upload.wikimedia.org/x.png?utm_source=pt" } } } } };
  assert.deepEqual(lerResposta(json), { titulo: "Interstellar", img: "https://upload.wikimedia.org/x.png", resumo: "Um filme.", pagina: "https://pt.wikipedia.org/?curid=42" });
  assert.equal(lerResposta({ query: { pages: { 1: { pageid: 1, title: "Sem foto" } } } }), null);
  assert.equal(lerResposta({}), null);
});
