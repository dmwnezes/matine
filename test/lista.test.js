import { test } from "node:test";
import assert from "node:assert/strict";
import { novaLista, listaValida, organizar, jaNaFila } from "../lista.js";
import { lerHash } from "../sync.js";

test("código da lista: 16 letras/números, válido e diferente a cada vez", () => {
  const a = novaLista(), b = novaLista();
  assert.ok(listaValida(a) && listaValida(b));
  assert.notEqual(a, b);
  assert.equal(listaValida("curto"), false);
  assert.equal(listaValida("abc/defghijklmnop"), false);
});

test("lista organizada: próxima sessão, fila por chegada e vistos do mais recente", () => {
  const r = organizar({
    a: { link: "x", titulo: "A", em: 30 },
    b: { link: "y", titulo: "B", em: 10 },
    c: { link: "z", titulo: "C", em: 20, visto: 100 },
    d: { link: "w", titulo: "D", em: 5, visto: 200 },
    e: { titulo: "sem link" },
  });
  assert.equal(r.proxima.id, "b");
  assert.deepEqual(r.fila.map((f) => f.id), ["a"]);
  assert.deepEqual(r.vistos.map((f) => f.id), ["d", "c"]);
  assert.deepEqual(organizar(null), { proxima: null, fila: [], vistos: [] });
});

test("mesmo link não entra duas vezes na fila (mas pode voltar depois de visto)", () => {
  const f = { a: { link: "https://x/f.mp4" }, b: { link: "https://x/g.mp4", visto: 1 } };
  assert.equal(jaNaFila(f, " https://x/f.mp4 "), true);
  assert.equal(jaNaFila(f, "https://x/g.mp4"), false);
});

test("link da lista abre a lista compartilhada", () => {
  assert.deepEqual(lerHash("#lista=AbCdEfGh23456789"), { codigo: "", chave: "", lista: "AbCdEfGh23456789" });
  assert.equal(lerHash("#lista=curta").lista, "");
  assert.equal(lerHash("#ABC234").lista, "");
});
