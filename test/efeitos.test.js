import { test } from "node:test";
import assert from "node:assert/strict";
import { comandoEfeito, sortearValor, valorValido, textoDoEfeito } from "../efeitos.js";
import { fotoValida } from "../fotos.js";

test("comandos de efeito", () => {
  assert.equal(comandoEfeito(" /Pipoca "), "pipoca");
  assert.equal(comandoEfeito("/dado"), "dado");
  assert.equal(comandoEfeito("/brotos"), null);
  assert.equal(comandoEfeito("pipoca"), null);
});

test("dado e moeda: sorteio e validação do que chega do banco", () => {
  assert.equal(sortearValor("dado", () => 0), 1);
  assert.equal(sortearValor("dado", () => 0.999), 6);
  assert.equal(sortearValor("moeda", () => 0.2), "cara");
  assert.equal(sortearValor("pipoca"), null);
  assert.equal(valorValido("dado", 7), null);
  assert.equal(valorValido("dado", "3"), null);
  assert.equal(valorValido("moeda", "coroa"), "coroa");
  assert.equal(textoDoEfeito("dado", "Você", 4), "🎲 Você jogou o dado: 4");
});

test("só aceita foto JPEG pequena", () => {
  assert.equal(fotoValida("data:image/jpeg;base64,AAAA"), true);
  assert.equal(fotoValida("data:image/svg+xml;base64,AAAA"), false);
  assert.equal(fotoValida("javascript:alert(1)"), false);
  assert.equal(fotoValida("data:image/jpeg;base64," + "A".repeat(300000)), false);
});
