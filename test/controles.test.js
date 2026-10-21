import { test } from "node:test";
import assert from "node:assert/strict";
import { ladoDoToque, tempo } from "../controles.js";

test("lado do toque em terços", () => {
  assert.equal(ladoDoToque(10, 300), "esq");
  assert.equal(ladoDoToque(150, 300), "meio");
  assert.equal(ladoDoToque(290, 300), "dir");
});

test("tempo do filme", () => {
  assert.equal(tempo(0), "0:00");
  assert.equal(tempo(83), "1:23");
  assert.equal(tempo(3725), "1:02:05");
  assert.equal(tempo(NaN), "0:00");
});
