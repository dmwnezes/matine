// Easter egg: "/brotos" no chat chama os Brotos (os mascotes do dmwnezes.com) para a tela de todo mundo da sala.
// Eles vivem nos espaços entre as mensagens: andam em cima dos balões, pulam de um para outro (por trás dos
// balões, para nunca cobrir texto), cochilam, levam susto e olham para quem está digitando. "/tchau" manda embora.
// Cada aparelho sorteia os próprios movimentos; o que é igual para todos é a chegada e a saída.

const TAM = 24; // pequeno o bastante para caber no vão entre os balões sem tampar nada
const VAO = TAM + 8; // espaço entre as mensagens enquanto os Brotos estão na sala

const olhos = (y) => `<g class="b-olhos"><circle cx="42" cy="${y}" r="5.5" fill="#231C48"/><circle cx="58" cy="${y}" r="5.5" fill="#231C48"/></g>
  <g class="b-susto"><circle cx="42" cy="${y - 1}" r="8" fill="#fff" stroke="#231C48" stroke-width="2.5"/><circle cx="58" cy="${y - 1}" r="8" fill="#fff" stroke="#231C48" stroke-width="2.5"/><circle cx="42" cy="${y - 1}" r="3" fill="#231C48"/><circle cx="58" cy="${y - 1}" r="3" fill="#231C48"/><ellipse cx="50" cy="${y + 15}" rx="4.5" ry="6" fill="#231C48"/><path d="M80 ${y - 20} q-6 9 0 12 q6 -3 0 -12z" fill="#7FC4F5"/></g>
  <g class="b-sono"><path d="M36 ${y} q6 5 12 0 M52 ${y} q6 5 12 0" stroke="#231C48" stroke-width="4" fill="none" stroke-linecap="round"/></g>
  <g class="b-amor">${[42, 58].map((x) => `<path d="M${x} ${y + 6} l-7 -7 a4 4 0 0 1 7 -5 a4 4 0 0 1 7 5z" fill="#E5737A"/>`).join("")}</g>
  <path class="b-boca" d="M45 ${y + 12} q5 5 10 0" stroke="#231C48" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <ellipse class="b-braco" cx="86" cy="58" rx="6" ry="12" fill="currentColor"/>`;
const pes = (c) => `<ellipse cx="38" cy="96" rx="9" ry="5" fill="${c}"/><ellipse cx="62" cy="96" rx="9" ry="5" fill="${c}"/>`;
// Cores e formas iguais às do hub (B1 a B5).
const BROTOS = {
  B1: ["#E6C14F", `${pes("#B8962F")}<path d="M52 14 q10 -14 22 -10 q-6 12 -22 10z" fill="#5FB873"/><path d="M50 16 v-7" stroke="#3E8A50" stroke-width="3"/><rect x="20" y="16" width="60" height="78" rx="18" fill="#E6C14F"/><ellipse cx="31" cy="64" rx="6" ry="3.5" fill="#F2A0B4"/><ellipse cx="69" cy="64" rx="6" ry="3.5" fill="#F2A0B4"/>${olhos(52)}`],
  B2: ["#6F95E6", `${pes("#4A72CF")}<circle cx="50" cy="58" r="36" fill="#6F95E6"/><path d="M46 22 q-2 -16 11 -14 q9 3 2 10 q-4 3 -6 -2" stroke="#6F95E6" stroke-width="7" fill="none" stroke-linecap="round"/>${olhos(54)}`],
  B3: ["#C6F36B", `${pes("#93B84A")}<rect x="4" y="44" width="92" height="50" rx="25" fill="#C6F36B"/>${olhos(64)}`],
  B4: ["#5FB873", `${pes("#3E8A50")}<path d="M50 6 C76 32 84 50 82 64 A32 30 0 0 1 18 64 C16 50 24 32 50 6z" fill="#5FB873"/>${olhos(58)}`],
  B5: ["#9B8CFF", `${pes("#6E5FD0")}<ellipse cx="34" cy="20" rx="8" ry="22" fill="#9B8CFF" transform="rotate(-12 34 34)"/><ellipse cx="66" cy="20" rx="8" ry="22" fill="#9B8CFF" transform="rotate(12 66 34)"/><ellipse cx="34" cy="22" rx="3.5" ry="14" fill="#C9C0FF" transform="rotate(-12 34 34)"/><ellipse cx="66" cy="22" rx="3.5" ry="14" fill="#C9C0FF" transform="rotate(12 66 34)"/><rect x="16" y="34" width="68" height="60" rx="30" fill="#9B8CFF"/>${olhos(60)}`],
};

const sorteio = (a) => a[Math.floor(Math.random() * a.length)];

/** Comando do chat que mexe nos Brotos ("/brotos", "/tchau") ou null. */
export const comandoBrotos = (texto) => ({ "/brotos": "chamar", "/tchau": "tchau" })[String(texto).trim().toLowerCase()] || null;

export function iniciarBrotos(chat) {
  const camada = document.createElement("div");
  camada.className = "brotos";
  camada.setAttribute("aria-hidden", "true");
  chat.prepend(camada);

  let lista = [], olhar = null, saindo = false, timerSaida = 0, rodando = false;
  const bolhas = () => [...chat.querySelectorAll(".msg .bubble")];
  const visiveis = () => bolhas().filter((b) => {
    const t = b.parentElement.offsetTop - chat.scrollTop;
    return t > VAO && t < chat.clientHeight - 20;
  });
  const pos = (b) => ({ x: b.parentElement.offsetLeft + b.offsetLeft, y: b.parentElement.offsetTop, w: b.offsetWidth });
  const colocar = (br, x, y) => { br.el.style.transform = `translate(${x}px, ${y}px)`; br.px = x; br.py = y; };

  function criar(tag) {
    const el = document.createElement("div");
    el.className = "broto";
    el.style.color = BROTOS[tag][0];
    el.innerHTML = `<svg viewBox="0 0 100 100"><g class="b-vira"><g class="b-anda">${BROTOS[tag][1]}</g></g></svg>`;
    camada.appendChild(el);
    const br = { tag, el, bolha: null, x: 0, alvoX: 0, modo: "caindo", px: 0, py: 0, ate: 0 };
    el.addEventListener("click", (e) => { e.stopPropagation(); assustar(br, true); });
    return br;
  }

  function pular(br, bolha, dur = 600) {
    if (!bolha) return;
    const p = pos(bolha);
    br.de = { x: br.px, y: br.py };
    br.para = { bolha, x: Math.random() * Math.max(0, p.w - TAM) };
    br.t0 = performance.now(); br.dur = dur; br.modo = "pulando";
    br.el.classList.remove("dorme");
    br.el.classList.add("andando");
    br.el.classList.toggle("esquerda", p.x + br.para.x < br.px);
  }

  function assustar(br, fugir) {
    br.el.classList.remove("dorme", "amor");
    br.el.classList.add("susto");
    setTimeout(() => br.el.classList.remove("susto"), fugir ? 900 : 650);
    if (!fugir) { br.el.querySelector(".b-anda").animate([{ transform: "translateY(0)" }, { transform: "translateY(-10px)" }, { transform: "translateY(0)" }], { duration: 320 }); return; }
    const outras = visiveis().filter((b) => b !== br.bolha);
    setTimeout(() => pular(br, sorteio(outras.length ? outras : bolhas()), 480), 150);
  }

  function decidir(br) {
    const r = Math.random();
    if (br.tag === "B3" && r < 0.35) { br.modo = "dormindo"; br.el.classList.add("dorme"); br.ate = performance.now() + 5000 + Math.random() * 3000; return; }
    if (br.tag === "B2" && r < 0.3) { // olha para os lados, desconfiado
      [0, 450, 900].forEach((t) => setTimeout(() => br.el.classList.toggle("esquerda"), t));
      br.modo = "parado"; br.ate = performance.now() + 1500; return;
    }
    if (r < 0.45) { pular(br, sorteio(visiveis().filter((b) => b !== br.bolha)) || br.bolha); return; }
    const p = pos(br.bolha);
    br.alvoX = Math.random() * Math.max(0, p.w - TAM);
    br.modo = "andando";
    br.el.classList.add("andando");
    br.el.classList.toggle("esquerda", br.alvoX < br.x);
  }

  function quadro(agora) {
    for (const br of lista) {
      if (br.modo === "pulando" || br.modo === "caindo" || br.modo === "saindo") {
        if (agora < br.t0) continue;
        const k = Math.min(1, (agora - br.t0) / br.dur);
        const fim = br.modo === "saindo" ? br.para : (() => { const q = pos(br.para.bolha); return { x: q.x + br.para.x, y: q.y - TAM }; })();
        const arco = br.modo === "caindo" ? 0 : 40;
        const y = br.de.y + (fim.y - br.de.y) * (br.modo === "caindo" ? k * k : k) - Math.sin(Math.PI * k) * arco;
        colocar(br, br.de.x + (fim.x - br.de.x) * k, y);
        if (k >= 1) {
          if (br.modo === "saindo") { br.el.remove(); br.fora = true; continue; }
          Object.assign(br, { bolha: br.para.bolha, x: br.para.x, modo: "parado", ate: agora + 1200 + Math.random() * 2500 });
          br.el.classList.remove("andando");
          br.el.querySelector(".b-anda").animate([{ transform: "scale(1.2,.8)" }, { transform: "scale(1)" }], { duration: 200 });
        }
        continue;
      }
      if (br.modo === "acenando") continue;
      if (!br.bolha?.isConnected) { pular(br, sorteio(visiveis()) || sorteio(bolhas())); continue; }
      // O chat rolou e o balão dele saiu da tela: vai para um balão que dá para ver.
      const vis = visiveis();
      if (vis.length && !vis.includes(br.bolha)) { pular(br, sorteio(vis), 450); continue; }
      const p = pos(br.bolha);
      if (br.modo === "andando") {
        const d = br.alvoX - br.x;
        br.x += Math.sign(d) * Math.min(0.6, Math.abs(d));
        if (Math.abs(d) < 1) { br.modo = "parado"; br.el.classList.remove("andando"); br.ate = agora + 1000 + Math.random() * 2500; }
      }
      colocar(br, p.x + Math.min(br.x, Math.max(0, p.w - TAM)), p.y - TAM);
      if (br.modo === "dormindo" && Math.random() < 0.01) zzz(br);
      if (br.modo !== "andando" && agora > br.ate) { br.el.classList.remove("dorme"); decidir(br); }
      // Olhos seguem o dedo/mouse ou a caixa de texto
      if (olhar) {
        const r = br.el.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, (olhar.x - r.left - TAM / 2) / 80)) * (br.el.classList.contains("esquerda") ? -1 : 1);
        const dy = Math.max(-1, Math.min(1, (olhar.y - r.top - TAM / 2) / 80));
        br.el.querySelector(".b-olhos").style.transform = `translate(${dx * 2.5}px, ${dy * 2.5}px)`;
      }
    }
    lista = lista.filter((b) => !b.fora);
    if (!lista.length) { rodando = false; chat.classList.remove("com-brotos"); return; }
    requestAnimationFrame(quadro);
  }

  function zzz(br) {
    const z = document.createElement("i");
    z.className = "zzz";
    z.textContent = "z";
    z.style.transform = `translate(${br.px + TAM - 4}px, ${br.py - 4}px)`;
    camada.appendChild(z);
    setTimeout(() => z.remove(), 2000);
  }

  setInterval(() => {
    const b = sorteio(lista);
    if (!b || document.hidden) return;
    b.el.classList.add("pisca");
    setTimeout(() => b.el.classList.remove("pisca"), 140);
  }, 1100);

  function chamar() {
    if (lista.length && !saindo) { lista.forEach((b) => assustar(b, false)); return; }
    saindo = false;
    chat.classList.add("com-brotos"); // abre espaço entre as mensagens antes de eles pousarem
    requestAnimationFrame(() => setTimeout(() => {
      const alvos = visiveis().length ? visiveis() : bolhas().slice(-5);
      if (!alvos.length) { chat.classList.remove("com-brotos"); return; }
      ["B1", "B2", "B3", "B4", "B5"].forEach((tag, i) => {
        const br = criar(tag);
        const bolha = alvos[(alvos.length - 1 - i + alvos.length * 5) % alvos.length];
        const p = pos(bolha);
        br.de = { x: p.x + Math.random() * Math.max(0, p.w - TAM), y: chat.scrollTop - TAM * 2 };
        br.para = { bolha, x: Math.random() * Math.max(0, p.w - TAM) };
        Object.assign(br, { t0: performance.now() + i * 180, dur: 700, modo: "caindo" });
        colocar(br, br.de.x, br.de.y);
        lista.push(br);
      });
      if (!rodando) { rodando = true; requestAnimationFrame(quadro); }
      clearTimeout(timerSaida);
      timerSaida = setTimeout(tchau, 2 * 60 * 1000);
    }, 260));
  }

  function tchau() {
    if (!lista.length || saindo) return;
    saindo = true;
    clearTimeout(timerSaida);
    lista.forEach((br, i) => {
      br.modo = "acenando";
      br.el.classList.remove("dorme", "andando");
      br.el.classList.add("acena");
      setTimeout(() => {
        br.el.classList.remove("acena");
        br.de = { x: br.px, y: br.py };
        br.para = { x: br.px + (Math.random() < 0.5 ? -90 : 90), y: chat.scrollTop - TAM * 3 };
        Object.assign(br, { t0: performance.now(), dur: 650, modo: "saindo" });
      }, 1100 + i * 140);
    });
  }

  /** Mensagem nova no chat: susto em quem está perto e um curioso vai ver. */
  function novaMensagem(bolha, texto) {
    if (!lista.length || saindo) return;
    const y = pos(bolha).y;
    lista.forEach((br) => { if (br.bolha && Math.abs(pos(br.bolha).y - y) < 140 && br.modo !== "pulando") assustar(br, false); });
    const curioso = sorteio(lista.filter((b) => b.modo !== "pulando" && b.modo !== "caindo"));
    if (curioso) setTimeout(() => pular(curioso, bolha), 350);
    if (/❤|♥|amo\b|te amo/i.test(texto)) {
      setTimeout(() => lista.filter((b) => b.bolha === bolha).forEach((b) => { b.el.classList.add("amor"); setTimeout(() => b.el.classList.remove("amor"), 2500); }), 1100);
    }
  }

  // Tocar num balão balança o balão e assusta quem está em cima.
  chat.addEventListener("click", (e) => {
    const b = e.target.closest(".bubble");
    if (!b || !lista.length) return;
    b.classList.remove("balanca"); void b.offsetWidth; b.classList.add("balanca");
    lista.filter((br) => br.bolha === b).forEach((br) => assustar(br, true));
  });
  document.addEventListener("pointermove", (e) => { if (lista.length) olhar = { x: e.clientX, y: e.clientY }; });

  return {
    chamar, tchau, novaMensagem,
    /** Alguém está digitando aqui: todos olham para a caixa de texto. */
    olharPara(el) { if (!el) { olhar = null; return; } const r = el.getBoundingClientRect(); olhar = { x: r.left + r.width / 2, y: r.top }; },
  };
}
