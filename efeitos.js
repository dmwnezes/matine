// Comandos secretos do chat que viram efeito na tela de todos da sala:
// /pipoca (chove pipoca; tocar estoura) · /confete · /dado e /moeda (mesmo resultado para todos) · /luz (apaga/acende).
// Quem manda sorteia o dado/moeda e manda o resultado junto; os outros só mostram.

const NOMES = { "/pipoca": "pipoca", "/confete": "confete", "/dado": "dado", "/moeda": "moeda", "/luz": "luz" };

/** Nome do efeito para o texto do chat, ou null. */
export const comandoEfeito = (texto) => NOMES[String(texto || "").trim().toLowerCase()] || null;

/** O que vai junto da mensagem de quem manda (o sorteio é feito uma vez só, aqui). */
export function sortearValor(nome, aleatorio = Math.random) {
  if (nome === "dado") return 1 + Math.floor(aleatorio() * 6);
  if (nome === "moeda") return aleatorio() < 0.5 ? "cara" : "coroa";
  return null;
}

/** Valor recebido de outra pessoa: só aceita o que um sorteio de verdade daria. */
export function valorValido(nome, v) {
  if (nome === "dado") return Number.isInteger(v) && v >= 1 && v <= 6 ? v : null;
  if (nome === "moeda") return v === "cara" || v === "coroa" ? v : null;
  return null;
}

/** Linha do chat que conta o que aconteceu. */
export function textoDoEfeito(nome, quem, valor) {
  return {
    pipoca: `🍿 ${quem} jogou pipoca na sala`,
    confete: `🎉 ${quem} soltou confete`,
    dado: `🎲 ${quem} jogou o dado: ${valor ?? "?"}`,
    moeda: `🪙 ${quem} jogou a moeda: ${valor ?? "?"}`,
    luz: `💡 ${quem} mexeu nas luzes`,
  }[nome];
}

const camada = () => {
  let c = document.getElementById("efeitos");
  if (!c) { c = document.createElement("div"); c.id = "efeitos"; c.setAttribute("aria-hidden", "true"); document.body.appendChild(c); }
  return c;
};
const sumir = (el, ms) => setTimeout(() => el.remove(), ms);
const rnd = (a, b) => a + Math.random() * (b - a);

const PIPOCA = `<svg viewBox="0 0 40 40"><circle cx="14" cy="18" r="9" fill="#FFF6DC"/><circle cx="25" cy="15" r="9" fill="#FFF6DC"/><circle cx="21" cy="25" r="9" fill="#FFF3D0"/><circle cx="18" cy="17" r="3" fill="#E6C14F" opacity=".55"/></svg>`;

function pipoca() {
  const c = camada();
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("button");
    p.type = "button";
    p.className = "ef-pipoca";
    p.tabIndex = -1;
    p.innerHTML = PIPOCA;
    p.style.left = `${rnd(2, 92)}%`;
    p.style.setProperty("--giro", `${rnd(-200, 200)}deg`);
    p.style.animationDuration = `${rnd(2.6, 4.2)}s`;
    p.style.animationDelay = `${rnd(0, 1.4)}s`;
    p.addEventListener("pointerdown", () => { p.classList.add("estoura"); sumir(p, 300); });
    c.appendChild(p);
    sumir(p, 6000);
  }
}

function confete() {
  const c = camada();
  const cores = ["#9B8CFF", "#E6C14F", "#5FB873", "#E5737A", "#6FA8E8", "#F4F1FF"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("i");
    p.className = "ef-confete";
    p.style.left = `${rnd(0, 100)}%`;
    p.style.background = cores[i % cores.length];
    p.style.setProperty("--x", `${rnd(-80, 80)}px`);
    p.style.setProperty("--giro", `${rnd(360, 1080)}deg`);
    p.style.animationDuration = `${rnd(2.2, 3.6)}s`;
    p.style.animationDelay = `${rnd(0, 0.6)}s`;
    c.appendChild(p);
    sumir(p, 4500);
  }
}

const FACES = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[30, 30], [50, 50], [70, 70]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]], 6: [[30, 28], [70, 28], [30, 50], [70, 50], [30, 72], [70, 72]] };
const dadoSvg = (n) => `<svg viewBox="0 0 100 100"><rect x="6" y="6" width="88" height="88" rx="20" fill="#F4F1FF"/>${FACES[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#231C48"/>`).join("")}</svg>`;

function centro(html, cls, ms) {
  const el = document.createElement("div");
  el.className = `ef-centro ${cls}`;
  el.innerHTML = html;
  camada().appendChild(el);
  sumir(el, ms);
  return el;
}

function dado(valor) {
  const el = centro(dadoSvg(1), "ef-dado", 3200);
  let n = 0;
  const giro = setInterval(() => { el.innerHTML = dadoSvg(1 + (n++ % 6)); }, 90);
  setTimeout(() => { clearInterval(giro); el.innerHTML = dadoSvg(valor || 1); el.classList.add("parou"); }, 1100);
}

function moeda(valor) {
  const face = (lado) => `<div class="ef-face ${lado}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#E6C14F"/><circle cx="50" cy="50" r="38" fill="none" stroke="#B8962F" stroke-width="4"/><text x="50" y="58" text-anchor="middle" font-family="Outfit, sans-serif" font-weight="800" font-size="20" fill="#3A2E10">${lado.toUpperCase()}</text></svg></div>`;
  const el = centro(`<div class="ef-moeda-gira ${valor === "coroa" ? "coroa" : "cara"}">${face("cara")}${face("coroa")}</div>`, "ef-moeda", 3200);
  return el;
}

function luz() { document.body.classList.toggle("luz-apagada"); }

/** Mostra o efeito nesta tela. */
export function rodarEfeito(nome, valor) {
  ({ pipoca, confete, dado: () => dado(valor), moeda: () => moeda(valor), luz })[nome]?.();
}
