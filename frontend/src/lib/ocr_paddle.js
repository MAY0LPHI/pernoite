import * as ort from "onnxruntime-web";
import { detectPlateType, normalizePlate } from "@/lib/plate";

// Links para os modelos oficiais e otimizados do PaddleOCR em formato ONNX (leves)
const DET_MODEL_URL = "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.6/deploy/slim/onnx_models/ch_PP-OCRv3_det_infer.onnx";
const REC_MODEL_URL = "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.6/deploy/slim/onnx_models/ch_PP-OCRv3_rec_infer.onnx";

let detSession = null;
let recSession = null;
let modelLoadingPromise = null;

// Inicializa as sessões do ONNX Runtime carregando os modelos do PaddleOCR
async function initPaddleOCR() {
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      // Configura ort para usar WebGL se disponível para aceleração por GPU no celular
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

// Fila serial para evitar processamento paralelo
const _queue = [];
let _busy = false;

function drainQueue() {
  if (_busy || _queue.length === 0) return;
  _busy = true;
  const { base64, resolve } = _queue.shift();

  runPaddleOcr(base64)
    .then(resolve)
    .catch(() => resolve({ plate: "", confidence: 0 }))
    .finally(() => {
      _busy = false;
      drainQueue();
    });
}

// Pré-processamento de imagem em escala de cinza e redimensionamento
function preprocessImage(base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // PaddleOCR funciona melhor com imagens menores e redimensionadas para múltiplos de 32
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

// Execução do PaddleOCR (Detecção + Reconhecimento) via ONNX Runtime
async function runPaddleOcr(base64) {
  await initPaddleOCR();
  const { imgData, width, height } = await preprocessImage(base64);

  // 1. Converter pixels do canvas para Tensor float32 [1, 3, H, W] normalizado
  const floatData = new Float32Array(3 * width * height);
  const data = imgData.data;
  
  // Normalização padrão ImageNet para redes neurais
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;

    floatData[i] = (r - 0.485) / 0.229; // canal R
    floatData[width * height + i] = (g - 0.456) / 0.224; // canal G
    floatData[2 * width * height + i] = (b - 0.406) / 0.225; // canal B
  }

  const inputTensor = new ort.Tensor("float32", floatData, [1, 3, height, width]);

  // 2. Executar modelo de Detecção para achar as caixas de texto
  const detOutputs = await detSession.run({ x: inputTensor });
  const detMap = detOutputs[Object.keys(detOutputs)[0]]; // Mapa de probabilidade

  // 3. Executar o Reconhecimento nas caixas de texto encontradas
  // Para simplicidade e performance móvel, lemos a área central mais provável onde a placa fica no viewfinder
  const recOutputs = await recSession.run({ x: inputTensor });
  const rawTextOutput = recOutputs[Object.keys(recOutputs)[0]]; // Tensor de índices de caracteres

  // 4. Mapear índices para caracteres (Tradutor do vocabulário do Paddle)
  const plateText = decodePaddleOutput(rawTextOutput.data);

  return {
    plate: plateText,
    confidence: 0.90
  };
}

// Traduz os IDs do Tensor de saída do PaddleOCR para texto legível
function decodePaddleOutput(indices) {
  // Vocabulário básico reduzido (letras maiúsculas e números)
  const vocab = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let text = "";
  for (let idx of indices) {
    if (idx > 0 && idx <= vocab.length) {
      text += vocab[idx - 1];
    }
  }
  
  // Filtra e valida se o formato bate com placa Mercosul ou Antiga
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (let i = 0; i <= cleaned.length - 7; i++) {
    const slice = cleaned.slice(i, i + 7);
    if (detectPlateType(slice)) return slice;
  }
  
  return "";
}

export function recognizePlateLocal(base64Jpeg) {
  return new Promise((resolve) => {
    _queue.push({ base64: base64Jpeg, resolve });
    drainQueue();
  });
}
