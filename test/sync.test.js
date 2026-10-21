import { test } from "node:test";
import assert from "node:assert/strict";
import { esperado, correcao, ehNovidade, emContagem, linkDoVideo, novoCodigo, codigoValido, limparTitulo } from "../sync.js";

test("posição esperada anda com o relógio só quando está tocando", () => {
  assert.equal(esperado({ tocando: true, pos: 10, em: 1000 }, 4000), 13);
  assert.equal(esperado({ tocando: false, pos: 10, em: 1000 }, 4000), 10);
  assert.equal(esperado({ tocando: true, pos: 10, em: 5000 }, 4000), 10); // relógio atrasado não volta o filme
});

test("correção: pula longe, ajusta velocidade perto, nada quando igual", () => {
  assert.deepEqual(correcao(3), { pular: true, velocidade: 1 });
  assert.deepEqual(correcao(-2), { pular: true, velocidade: 1 });
  assert.deepEqual(correcao(0.8), { pular: false, velocidade: 0.9 });
  assert.deepEqual(correcao(-0.8), { pular: false, velocidade: 1.1 });
  assert.deepEqual(correcao(0.2), { pular: false, velocidade: 0.95 });
  assert.deepEqual(correcao(0.03), { pular: false, velocidade: 1 });
});

test("obedecer a sala não volta como novidade (sem eco)", () => {
  const s = { tocando: true, pos: 100, em: 0 };
  assert.equal(ehNovidade(s, true, 102, 2000), false); // tocou porque a sala mandou
  assert.equal(ehNovidade(s, false, 102, 2000), true); // pausei de verdade
  assert.equal(ehNovidade(s, true, 300, 2000), true); // pulei de verdade
  assert.equal(ehNovidade(null, true, 0, 0), true);
});

test("links de vídeo", () => {
  assert.equal(linkDoVideo("https://site.com/f.mp4").url, "https://site.com/f.mp4");
  assert.match(linkDoVideo("https://www.dropbox.com/s/x/f.mp4?dl=0").url, /raw=1/);
  assert.ok(!linkDoVideo("https://www.dropbox.com/s/x/f.mp4?dl=0").url.includes("dl=0"));
  assert.ok(linkDoVideo("https://youtu.be/abc").erro);
  assert.ok(linkDoVideo("ftp://x/y").erro);
  assert.ok(linkDoVideo("não é link").erro);
  const id = "1AbCdEfGhIjKlMnOp";
  assert.ok(linkDoVideo(`https://drive.google.com/file/d/${id}/view?usp=sharing`, "").erro);
  assert.equal(linkDoVideo(`https://drive.google.com/file/d/${id}/view`, "K").drive, id);
  assert.equal(linkDoVideo(`https://drive.google.com/open?id=${id}`, "K").drive, id);
});

test("código da sala", () => {
  for (let i = 0; i < 200; i++) assert.ok(codigoValido(novoCodigo()));
  assert.equal(codigoValido("ABC12O"), false); // O e 1 não existem
  assert.equal(codigoValido("abcdef"), false);
});

test("contagem: tocando com o 'já' no futuro", () => {
  assert.equal(emContagem({ tocando: true, pos: 5, em: 3000 }, 1000), true);
  assert.equal(esperado({ tocando: true, pos: 5, em: 3000 }, 1000), 5); // parado no ponto até o "já"
  assert.equal(emContagem({ tocando: true, pos: 5, em: 3000 }, 3000), false);
  assert.equal(emContagem({ tocando: false, pos: 5, em: 3000 }, 1000), false);
  assert.equal(emContagem(null, 0), false);
});

test("título limpo a partir do nome do arquivo", () => {
  assert.equal(limparTitulo("Interstellar.2014.1080p.BluRay.x264.mkv"), "Interstellar");
  assert.equal(limparTitulo("Cidade_de_Deus_DUBLADO.mp4"), "Cidade de Deus");
  assert.equal(limparTitulo("Divertida Mente 2 (2024) [WEB-DL].mp4"), "Divertida Mente 2");
  assert.equal(limparTitulo("filme"), "filme");
});
