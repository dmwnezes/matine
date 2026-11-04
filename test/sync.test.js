import { test } from "node:test";
import assert from "node:assert/strict";
import { esperado, correcao, emContagem, quemDecide, todosProntos, pastaDoDrive, proximoBloco, faixaPedida, motivoDoErro, linkDoVideo, embedDoLink, novoCodigo, codigoValido, limparTitulo, lerHash, montarHash } from "../sync.js";

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

test("links de vídeo", () => {
  assert.equal(linkDoVideo("https://site.com/f.mp4").url, "https://site.com/f.mp4");
  assert.match(linkDoVideo("https://www.dropbox.com/s/x/f.mp4?dl=0").url, /raw=1/);
  assert.ok(!linkDoVideo("https://www.dropbox.com/s/x/f.mp4?dl=0").url.includes("dl=0"));
  assert.deepEqual(linkDoVideo("https://youtu.be/dQw4w9WgXcQ").embed, { tipo: "youtube", id: "dQw4w9WgXcQ" });
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

test("link da sala leva o código e a chave", () => {
  const k = "AIza" + "x".repeat(35);
  assert.deepEqual(lerHash(montarHash("ABC234", k)), { codigo: "ABC234", chave: k, lista: "" });
  assert.deepEqual(lerHash("#abc234"), { codigo: "ABC234", chave: "", lista: "" }); // link antigo, sem chave
  assert.deepEqual(lerHash("#ABC234~lixo"), { codigo: "ABC234", chave: "", lista: "" });
  assert.deepEqual(lerHash(""), { codigo: "", chave: "", lista: "" });
  assert.equal(montarHash("ABC234", ""), "#ABC234");
});

test("links do YouTube e do Vimeo viram player embutido", () => {
  const yt = { tipo: "youtube", id: "dQw4w9WgXcQ" };
  for (const l of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
  ]) assert.deepEqual(embedDoLink(l), yt, l);
  assert.equal(embedDoLink("https://www.youtube.com/watch?v=curto"), null);
  assert.equal(embedDoLink("https://www.youtube.com/@canal"), null);
  assert.deepEqual(embedDoLink("https://vimeo.com/76979871"), { tipo: "vimeo", id: "76979871" });
  assert.deepEqual(embedDoLink("https://vimeo.com/76979871/8272103f6e"), { tipo: "vimeo", id: "76979871", h: "8272103f6e" });
  assert.deepEqual(embedDoLink("https://player.vimeo.com/video/76979871?h=8272103f6e"), { tipo: "vimeo", id: "76979871", h: "8272103f6e" });
  assert.deepEqual(embedDoLink("https://vimeo.com/channels/staffpicks/76979871"), { tipo: "vimeo", id: "76979871" });
  assert.equal(embedDoLink("https://site.com/f.mp4"), null);
});

test("convite cortado no meio de um % não derruba o site", () => {
  assert.deepEqual(lerHash("#ABC234%"), { codigo: "ABC234%", chave: "", lista: "" });
});

test("quem decide é quem pediu; se saiu, o menor uid presente", () => {
  assert.equal(quemDecide({ a: {}, b: {} }, "b"), "b");
  assert.equal(quemDecide({ c: {}, a: {} }, "x"), "a");
  assert.equal(quemDecide({}, "x"), null);
});

test("sala solta quando todos carregaram; quem saiu da aba ou deu erro não segura", () => {
  assert.equal(todosProntos({ a: { pronto: "p" }, b: { pronto: "p" } }, "p"), true);
  assert.equal(todosProntos({ a: { pronto: "p" }, b: { pronto: "velho" } }, "p"), false);
  assert.equal(todosProntos({ a: { pronto: "p" }, b: { fora: true } }, "p"), true);
  assert.equal(todosProntos({ a: { pronto: "p" }, b: { erro: "x" } }, "p"), true);
});

test("link de pasta do Drive", () => {
  assert.equal(pastaDoDrive("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn?usp=sharing"), "1AbCdEfGhIjKlMn");
  assert.equal(pastaDoDrive("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMn"), "1AbCdEfGhIjKlMn");
  assert.equal(pastaDoDrive("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view"), "");
  assert.equal(pastaDoDrive("https://site.com/folders/1AbCdEfGhIjKlMn"), "");
  assert.equal(pastaDoDrive("não é link"), "");
});

test("próximo bloco: segue do cursor e volta para o começo", () => {
  assert.equal(proximoBloco(new Set(), 3, 5), 3);
  assert.equal(proximoBloco(new Set([3, 4]), 3, 5), 0);
  assert.equal(proximoBloco(new Set([0, 1, 2, 3, 4]), 2, 5), null);
});

test("faixa pedida pelo player", () => {
  assert.deepEqual(faixaPedida("bytes=0-", 100, 10), { ini: 0, fim: 9 });
  assert.deepEqual(faixaPedida("bytes=0-1", 100, 10), { ini: 0, fim: 1 });
  assert.deepEqual(faixaPedida("bytes=95-", 100, 10), { ini: 95, fim: 99 });
  assert.deepEqual(faixaPedida("bytes=-5", 100, 10), { ini: 95, fim: 99 });
  assert.deepEqual(faixaPedida(null, 100, 10), { ini: 0, fim: 9 });
  assert.equal(faixaPedida("bytes=100-", 100, 10), null);
  assert.equal(faixaPedida("bytes=5-2", 100, 10), null);
  assert.equal(faixaPedida("lixo", 100, 10), null);
});

test("motivo do erro do Drive", () => {
  assert.match(motivoDoErro(403, "downloadQuotaExceeded"), /excesso de downloads/);
  assert.match(motivoDoErro(403, "ipRefererBlocked"), /chave/);
  assert.match(motivoDoErro(403, "userRateLimitExceeded"), /Muitos pedidos/);
  assert.match(motivoDoErro(404), /não encontrado/);
  assert.match(motivoDoErro(403), /Sem permissão/);
});
