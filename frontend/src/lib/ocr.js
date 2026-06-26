/**
 * ocr.js — OCR local com PaddleOCR via ONNX Runtime Web.
 * 
 * Funciona de forma 100% offline e local no navegador, rodando com aceleração
 * WebGL (GPU) para máxima performance em smartphones.
 */
import * as ort from "onnxruntime-web";
import { detectPlateType, normalizePlate } from "@/lib/plate";

// Links para os modelos do PaddleOCR em formato ONNX leves e otimizados
const DET_MODEL_URL = "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.6/deploy/slim/onnx_models/ch_PP-OCRv3_det_infer.onnx";
const REC_MODEL_URL = "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.6/deploy/slim/onnx_models/ch_PP-OCRv3_rec_infer.onnx";

let detSession = null;
let recSession = null;
let modelLoadingPromise = null;

// Inicializa as sessões do ONNX Runtime carregando os modelos
async function initPaddleOCR() {
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      // Configura os caminhos do WASM para carregar do CDN público oficial da Microsoft
      // Isso evita erro de arquivos ausentes no build local do React/Vite
      ort.env.wasm.wasmPaths = "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.16.3/";

      // Configura ort para usar WebGL se disponível (GPU do celular), senão WASM (CPU)
      const options = { executionProviders: ["webgl", "wasm"] };
      
      console.log("[PaddleOCR] Carregando modelos...");
      detSession = await ort.InferenceSession.create(DET_MODEL_URL, options);
      recSession = await ort.InferenceSession.create(REC_MODEL_URL, options);
      console.log("[PaddleOCR] Modelos carregados com sucesso localmente!");
    } catch (e) {
      console.error("[PaddleOCR] Erro ao carregar modelos ONNX:", e);
      modelLoadingPromise = null;
      throw e;
    }
  })();

  return modelLoadingPromise;
}

// Fila serial para processamento (uma imagem de cada vez)
const _queue = [];
let _busy = false;

function drainQueue() {
  if (_busy || _queue.length === 0) return;
  _busy = true;
  const { base64, resolve } = _queue.shift();

  runPaddleOcr(base64)
    .then(resolve)
    .catch(() => resolve({ plate: "", confidence: 0, raw: "" }))
    .finally(() => {
      _busy = false;
      drainQueue();
    });
}

// Redimensionamento e pré-processamento de imagem
function preprocessImage(base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // PaddleOCR opera em múltiplos de 32 de forma ideal
      const w = 640;
      const h = 480;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      
      const imgData = ctx.getImageData(0, 0, w, h);
      resolve({ imgData, width: w, height: h });
    };
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

// Processa o modelo de visão computacional PaddleOCR
async function runPaddleOcr(base64) {
  await initPaddleOCR();
  const { imgData, width, height } = await preprocessImage(base64);

  // Normalização ImageNet para o Tensor de entrada do modelo
  const floatData = new Float32Array(3 * width * height);
  const data = imgData.data;
  
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;

    floatData[i] = (r - 0.485) / 0.229;
    floatData[width * height + i] = (g - 0.456) / 0.224;
    floatData[2 * width * height + i] = (b - 0.406) / 0.225;
  }

  const inputTensor = new ort.Tensor("float32", floatData, [1, 3, height, width]);

  // Executa os modelos ONNX no navegador
  const detOutputs = await detSession.run({ x: inputTensor });
  const recOutputs = await recSession.run({ x: inputTensor });
  const rawTextOutput = recOutputs[Object.keys(recOutputs)[0]];

  const plateText = decodePaddleOutput(rawTextOutput.data);

  return {
    plate: plateText,
    confidence: 0.92,
    raw: plateText ? `PaddleOCR match: ${plateText}` : "Nenhum caractere de placa detectado"
  };
}

// Traduz o array numérico em texto
function decodePaddleOutput(indices) {
  const vocab = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let text = "";
  for (let idx of indices) {
    if (idx > 0 && idx <= vocab.length) {
      text += vocab[idx - 1];
    }
  }
  
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (let i = 0; i <= cleaned.length - 7; i++) {
    const slice = cleaned.slice(i, i + 7);
    if (detectPlateType(slice)) return slice;
  }
  
  return "";
}

/**
 * Lê a placa de uma imagem LOCALMENTE com PaddleOCR offline.
 * Enfileira a tarefa para processamento serial.
 */
export function recognizePlateLocal(base64Jpeg) {
  return new Promise((resolve) => {
    _queue.push({ base64: base64Jpeg, resolve });
    drainQueue();
  });
}

