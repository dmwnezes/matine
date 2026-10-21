// Fotos no chat: reduz no próprio aparelho e manda como JPEG pequeno (data URL) junto da mensagem.
// shortcut: a foto vai dentro do banco (o Storage do Firebase exige o plano pago); por isso o limite de ~200 KB.

const LIMITE = 280000; // caracteres da data URL (as regras do banco aceitam até 300 000)

/** Aceita só JPEG em data URL dentro do limite (o que vem do banco pode ter sido escrito por qualquer um). */
export const fotoValida = (s) => typeof s === "string" && s.startsWith("data:image/jpeg;base64,") && s.length <= 300000;

/** Lado maior e qualidade a tentar, do melhor para o mais leve. */
export const TENTATIVAS = [[1280, 0.75], [1024, 0.65], [800, 0.6], [640, 0.55]];

export async function fotoParaChat(arquivo) {
  if (!arquivo.type.startsWith("image/")) throw new Error("Matinê:Isso não é uma imagem.");
  const bitmap = await createImageBitmap(arquivo).catch(() => { throw new Error("Matinê:Não consegui abrir essa imagem."); });
  try {
    for (const [lado, qualidade] of TENTATIVAS) {
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * escala);
      canvas.height = Math.round(bitmap.height * escala);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", qualidade);
      if (url.length <= LIMITE) return url;
    }
  } finally { bitmap.close?.(); }
  throw new Error("Matinê:A foto é grande demais.");
}
