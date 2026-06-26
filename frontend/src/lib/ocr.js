/**
 * ocr.js — OCR local com Tesseract.js (100% offline após primeiro carregamento).
 *
 * Lê texto da imagem diretamente no navegador usando a engine Tesseract
 * compilada em WebAssembly. Não envia nada para nenhum servidor externo.
 */
import { detectPlateType } from "@/lib/plate";

let _worker = null;
let _workerReady = false;
let _workerPromise = null;

/**
 * Inicializa o worker do Tesseract (carrega o WASM + modelo de idioma).
 * Após o primeiro carregamento, o navegador faz cache e fica instantâneo.
 */
async function getWorker() {
  if (_workerReady && _worker) return _worker;
  if (_workerPromise) return _workerPromise;

  _workerPromise = (async () => {
    try {
      const Tesseract = await import("tesseract.js");
      const worker = await Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            console.log(`[OCR Local] Progresso: ${Math.round((m.progress || 0) * 100)}%`);
          }
        },
      });
      // O modo "6" (bloco único de texto) é o mais equilibrado: 
      // ele garante a leitura da esquerda para a direita, mas é mais tolerante a ruídos/bordas que o modo 7.
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        tessedit_pageseg_mode: "6", // Assume a single uniform block of text
      });
      _worker = worker;
      _workerReady = true;
      console.log("[OCR Local] Tesseract.js pronto!");
      return worker;
    } catch (e) {
      console.error("[OCR Local] Falha ao inicializar Tesseract:", e);
      _workerPromise = null;
      throw e;
    }
  })();

  return _workerPromise;
}

/**
 * Tenta extrair uma placa brasileira válida do texto bruto reconhecido.
 */
function extractPlateFromText(rawText) {
  // Remove tudo que não é letra ou número
  const cleaned = (rawText || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Tenta encontrar uma sequência de 7 caracteres que seja placa válida
  for (let i = 0; i <= cleaned.length - 7; i++) {
    const slice = cleaned.slice(i, i + 7);
    if (detectPlateType(slice)) return slice;
  }

  return "";
}

export async function recognizePlateLocal(base64Jpeg) {
  // OCR local desativado a pedido do usuário para forçar o uso 100% da IA (Gemini).
  // Retorna vazio imediatamente para acionar o fallback da IA.
  return { plate: "", confidence: 0, raw: "" };
}
