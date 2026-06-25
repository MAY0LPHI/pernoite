/**
 * ocr.js — OCR local com Tesseract.js (sem internet, sem tokens).
 *
 * FIX CRÍTICO: Fila serial (uma imagem por vez).
 * O crash anterior acontecia porque o modo lote processava 2 imagens
 * simultâneas no mesmo worker — corrompendo o DOM do React.
 * Com a fila, apenas 1 imagem é processada por vez, eliminando o conflito.
 */
import { createWorker } from "tesseract.js";
import { detectPlateType, normalizePlate } from "@/lib/plate";

// ─── Worker singleton ─────────────────────────────────────────────────────────

let _workerPromise = null;

function getWorker() {
  if (!_workerPromise) {
    _workerPromise = (async () => {
      const w = await createWorker("eng", 1, {
        logger: () => {}, // Silencia logs para não poluir o console
      });
      await w.setParameters({
        tessedit_pageseg_mode: "3", // Modo automático de segmentação (melhor para fotos completas do veículo)
      });
      return w;
    })();
  }
  return _workerPromise;
}

// ─── Fila serial ──────────────────────────────────────────────────────────────
// Garante que apenas 1 imagem é processada por vez — evita o crash de DOM.

const _queue = [];
let _busy = false;

function drainQueue() {
  if (_busy || _queue.length === 0) return;
  _busy = true;
  const { base64, resolve } = _queue.shift();

  runOcr(base64)
    .then(resolve)
    .catch(() => resolve({ plate: "", confidence: 0, raw: "" }))
    .finally(() => {
      _busy = false;
      drainQueue(); // Processa o próximo
    });
}

// ─── Pré-processamento da imagem ─────────────────────────────────────────────

function preprocessImage(base64Jpeg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Reduz dimensões para acelerar o Tesseract local (máx 800px)
      const maxDim = 800;
      let { width: w, height: h } = img;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      
      // Convertemos para tons de cinza simples para melhorar legibilidade, mas sem binarizar de forma agressiva
      const imageData = ctx.getImageData(0, 0, w, h);
      const px = imageData.data;
      for (let i = 0; i < px.length; i += 4) {
        const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(`data:image/jpeg;base64,${base64Jpeg}`);
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  });
}

// ─── Extração da placa do texto OCR ──────────────────────────────────────────

function extractPlateFromText(rawText) {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  // 1) Token direto com 7 caracteres
  for (const t of tokens) {
    const n = normalizePlate(t);
    if (n.length === 7 && detectPlateType(n)) return n;
  }
  // 2) Concatenação de tokens adjacentes
  for (let i = 0; i < tokens.length - 1; i++) {
    const merged = normalizePlate(tokens[i] + tokens[i + 1]);
    if (merged.length === 7 && detectPlateType(merged)) return merged;
  }
  // 3) Janela deslizante em todo o texto
  const all = cleaned.replace(/\s+/g, "");
  for (let i = 0; i <= all.length - 7; i++) {
    const slice = all.slice(i, i + 7);
    if (detectPlateType(slice)) return slice;
  }
  return "";
}

// ─── OCR real ────────────────────────────────────────────────────────────────

async function runOcr(base64Jpeg) {
  const dataUrl = await preprocessImage(base64Jpeg);
  const worker = await getWorker();
  const { data } = await worker.recognize(dataUrl);
  const raw = data?.text || "";
  const plate = extractPlateFromText(raw);
  return { plate, confidence: data?.confidence || 0, raw };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Lê a placa de uma imagem LOCALMENTE, sem chamar nenhuma API externa.
 * Enfileira a tarefa para garantir processamento serial (sem crash do DOM).
 * Retorna { plate, confidence, raw } — plate = "" se não conseguiu ler.
 */
export function recognizePlateLocal(base64Jpeg) {
  return new Promise((resolve) => {
    _queue.push({ base64: base64Jpeg, resolve });
    drainQueue();
  });
}
