import { test } from "node:test";
import assert from "node:assert/strict";
import { tocaNativo, guardado, adiante } from "../video.js";

const faixas = (...pares) => ({ length: pares.length, start: (i) => pares[i][0], end: (i) => pares[i][1] });

test("toca nativo só quando o navegador diz que toca", () => {
  const navegador = (t) => (t.includes("hev1") ? "" : "maybe");
  assert.equal(tocaNativo(navegador, 'video/mp4; codecs="avc1.64001f, mp4a.40.2"'), true);
  assert.equal(tocaNativo(navegador, 'video/mp4; codecs="hev1.1.6.L93.B0"'), false);
  assert.equal(tocaNativo(navegador, ""), false);
});

test("trecho guardado e quanto falta à frente", () => {
  const f = faixas([0, 30], [50, 80]);
  assert.equal(guardado(f, 10), true);
  assert.equal(guardado(f, 40), false); // buraco: tem que reconverter a partir daqui
  assert.equal(guardado(f, 49.8), true); // folga para o começo do trecho
  assert.equal(adiante(f, 10), 20);
  assert.equal(adiante(f, 40), 0);
});
