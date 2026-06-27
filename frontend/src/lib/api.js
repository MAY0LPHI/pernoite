/**
 * api.js — Camada de dados 100% offline (localStorage).
 * Substitui as chamadas ao backend FastAPI.
 * Dados persistidos nas chaves:
 *   vtr_sectors   → Sector[]
 *   vtr_sessions  → Session[]
 *   vtr_vehicles  → { [plate]: Vehicle }
 */

import { GEMINI_KEYS } from "@/lib/keys";

// ─── Helpers de Storage ──────────────────────────────────────────────────────

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uuid() {
  return crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

// ─── Setores Padrão ──────────────────────────────────────────────────────────

const DEFAULT_SECTORS = [
  "ZARP LOCALIZA SETOR VERMELHO / AMARELO",
  "CREDCARROS",
  "SETOR AZUL",
  "SETOR VERMELHO",
  "SETOR LARANJA",
  "SETOR VERDE",
  "SETOR 01",
  "SETOR 02",
  "SETOR 03",
  "SETOR 05",
  "BOLSÃO DE MOTO",
];

function ensureSectors() {
  const sectors = readLS("vtr_sectors", null);
  if (sectors !== null) return sectors;
  // 1ª vez: seed dos defaults
  const seeded = DEFAULT_SECTORS.map((name, idx) => ({
    id: uuid(),
    name,
    order: idx,
    is_default: true,
    created_at: nowISO(),
  }));
  writeLS("vtr_sectors", seeded);
  return seeded;
}

// ─── API: Setores ─────────────────────────────────────────────────────────────

export async function listSectors() {
  return ensureSectors().slice().sort((a, b) => a.order - b.order);
}

export async function createSector(name) {
  const sectors = ensureSectors();
  const maxOrder = sectors.reduce((m, s) => Math.max(m, s.order), -1);
  const newSector = {
    id: uuid(),
    name: name.trim(),
    order: maxOrder + 1,
    is_default: false,
    created_at: nowISO(),
  };
  writeLS("vtr_sectors", [...sectors, newSector]);
  return newSector;
}

export async function deleteSector(id) {
  const sectors = ensureSectors();
  const target = sectors.find((s) => s.id === id);
  if (!target) throw new Error("Setor não encontrado");
  if (target.is_default) throw { response: { data: { detail: "Setores padrão não podem ser removidos" } } };
  writeLS("vtr_sectors", sectors.filter((s) => s.id !== id));
  return { ok: true };
}

// ─── API: Sessões ─────────────────────────────────────────────────────────────

export async function createSession(payload) {
  const sectors = await listSectors();
  const session = {
    id: uuid(),
    operator_name: payload.operator_name,
    date: payload.date,
    start_time: payload.start_time || "18:00",
    end_time: payload.end_time || "06:00",
    sectors: sectors.map((s) => ({
      sector_id: s.id,
      sector_name: s.name,
      vehicles: [],
    })),
    finalized: false,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  const sessions = readLS("vtr_sessions", []);
  writeLS("vtr_sessions", [session, ...sessions]);
  return session;
}

export async function getSession(id) {
  const sessions = readLS("vtr_sessions", []);
  const s = sessions.find((s) => s.id === id);
  if (!s) throw new Error("Sessão não encontrada");
  return s;
}

export async function updateSession(id, patch) {
  const sessions = readLS("vtr_sessions", []);
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error("Sessão não encontrada");

  const updated = { ...sessions[idx], ...patch, updated_at: nowISO() };
  sessions[idx] = updated;
  writeLS("vtr_sessions", sessions);

  // Auto-aprendizado: salva veículos encontrados no cadastro local
  if (patch.sectors) {
    const vehicles = readLS("vtr_vehicles", {});
    for (const sec of patch.sectors) {
      for (const v of sec.vehicles || []) {
        if (v.plate) {
          vehicles[v.plate] = {
            plate: v.plate,
            brand: v.brand || "",
            model: v.model || "",
            color: v.color || "",
            updated_at: nowISO(),
          };
        }
      }
    }
    writeLS("vtr_vehicles", vehicles);
  }

  return updated;
}

export async function deleteSession(id) {
  const sessions = readLS("vtr_sessions", []);
  const filtered = sessions.filter((s) => s.id !== id);
  if (filtered.length === sessions.length) throw new Error("Sessão não encontrada");
  writeLS("vtr_sessions", filtered);
  return { ok: true };
}

export async function listSessions(date) {
  const sessions = readLS("vtr_sessions", []);
  if (!date) return sessions;
  return sessions.filter((s) => s.date === date);
}

// ─── Export: Gera texto WhatsApp ──────────────────────────────────────────────

function formatPlateDisplay(plate) {
  const p = (plate || "").toUpperCase().replace(/-|\s/g, "").trim();
  if (p.length >= 3) {
    return `${p.slice(0, 3)}-${p.slice(3)}`;
  }
  return p;
}

function buildWhatsAppText(session) {
  const lines = [];
  const operator = (session.operator_name || "").toUpperCase();
  
  lines.push(`> *VTR NOTURNO  ${operator}*`);
  lines.push(`*PERNOITE - ${session.date}_*`);
  lines.push(`*${session.start_time} horas* / *${session.end_time} hrs_*`);
  lines.push("");
  
  for (const sector of session.sectors || []) {
    const vehicles = sector.vehicles || [];
    if (!vehicles.length) continue;
    
    lines.push(`> *${(sector.sector_name || "").toUpperCase()}*`);
    lines.push("");
    lines.push("`*MARCA - MODELO - PLACA*`");
    lines.push("");
    
    for (const v of vehicles) {
      const label = [v.brand, v.model].filter(Boolean).join(" ") || "Veículo";
      lines.push(`* ${label}: ${formatPlateDisplay(v.plate)}`);
    }
    
    lines.push("");
    lines.push("*————————————————————*");
    lines.push("");
  }
  
  return lines.join("\n").trim();
}

export async function exportSession(id) {
  const session = await getSession(id);
  return buildWhatsAppText(session);
}

// ─── API: Cadastro de Veículos ────────────────────────────────────────────────

import { VEHICLES_DB } from "./vehiclesDB";

export async function lookupVehicle(plate) {
  const cleaned = (plate || "").toUpperCase().replace(/-|\s/g, "").trim();
  if (!cleaned) return { found: false };

  // 1) Busca no vtr_vehicles (localStorage - histórico do próprio dispositivo)
  const vehicles = readLS("vtr_vehicles", {});
  const v = vehicles[cleaned];
  if (v) return { found: true, vehicle: v };

  // 2) Busca no banco de dados pré-carregado (VEHICLES_DB)
  const seed = VEHICLES_DB[cleaned];
  if (seed) {
    const newVeh = {
      plate: cleaned,
      brand: seed.brand,
      model: seed.model,
      color: "",
      updated_at: nowISO(),
    };
    vehicles[cleaned] = newVeh;
    writeLS("vtr_vehicles", vehicles);
    return { found: true, vehicle: newVeh };
  }

  // 3) Se não encontrou, busca no histórico de sessões anteriores
  const sessions = readLS("vtr_sessions", []);
  for (const s of sessions) {
    for (const sec of s.sectors || []) {
      for (const veh of sec.vehicles || []) {
        const cPlate = (veh.plate || "").toUpperCase().replace(/-|\s/g, "").trim();
        if (cPlate === cleaned && (veh.brand || veh.model)) {
          // Salva no vtr_vehicles para aprendizado automático futuro
          const newVeh = {
            plate: cleaned,
            brand: veh.brand || "",
            model: veh.model || "",
            color: veh.color || "",
            updated_at: nowISO(),
          };
          vehicles[cleaned] = newVeh;
          writeLS("vtr_vehicles", vehicles);
          return { found: true, vehicle: newVeh };
        }
      }
    }
  }

  return { found: false };
}

// ─── Gemini Vision (direto do frontend) ──────────────────────────────────────

let _keyIndex = 0;
const _keyUsage = {};
const RPM_LIMIT = 5;

async function getAvailableKey(retries = 0) {
  if (!GEMINI_KEYS || GEMINI_KEYS.length === 0) {
    throw new Error("Nenhuma chave Gemini configurada.");
  }
  
  const numKeys = GEMINI_KEYS.length;
  if (retries >= numKeys * 2) {
    throw new Error("Todas as chaves Gemini estão congestionadas. Tente novamente.");
  }

  const now = Date.now();
  for (let i = 0; i < numKeys; i++) {
    if (_keyUsage[i]) _keyUsage[i] = _keyUsage[i].filter(ts => now - ts < 60000);
    else _keyUsage[i] = [];
  }

  for (let i = 0; i < numKeys; i++) {
    const idx = (_keyIndex + i) % numKeys;
    if (_keyUsage[idx].length < RPM_LIMIT) {
      _keyIndex = (idx + 1) % numKeys;
      _keyUsage[idx].push(now);
      return { key: GEMINI_KEYS[idx], idx };
    }
  }

  let oldestTs = now;
  for (let i = 0; i < numKeys; i++) {
    if (_keyUsage[i].length > 0 && _keyUsage[i][0] < oldestTs) {
      oldestTs = _keyUsage[i][0];
    }
  }
  const timeToWait = 60000 - (now - oldestTs);
  if (timeToWait > 0) {
    console.log(`[Rate Limit] Aguardando ${timeToWait}ms para respeitar ${RPM_LIMIT} RPM...`);
    await new Promise(r => setTimeout(r, timeToWait + 50));
  }
  return getAvailableKey(retries + 1);
}

async function callGemini(base64, mimeType = "image/jpeg", retries = 0) {
  const { key, idx } = await getAvailableKey(retries);
  // Voltando para gemini-1.5-flash. O modelo 8b e a resolução baixa deixaram a IA cega para as letras miúdas.
  // 1.5-flash é o ponto ideal entre velocidade e capacidade de leitura visual.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text:
              "Analise esta foto de um veículo e extraia:\n" +
              "1. A placa (padrão MERCOSUL: AAA9A99 ou ANTIGA: AAA9999, sem hífen, maiúsculas).\n" +
              "2. A marca/fabricante (ex: Chevrolet, Fiat, Volkswagen, Hyundai, Renault, Toyota).\n" +
              "3. O modelo (ex: Onix, Argo, Polo, HB20, Kwid, Mobi).\n" +
              "Retorne SOMENTE um JSON: {\"plate\": \"...\", \"plate_type\": \"mercosul|antiga\", \"brand\": \"...\", \"model\": \"\"}. " +
              "Faça o seu melhor para ler a placa, tente deduzir caracteres borrados usando o contexto. Sem markdown.",
          },
          { inlineData: { mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    _keyUsage[idx] = Array(RPM_LIMIT).fill(Date.now()); // Marca a chave como esgotada neste minuto
    return callGemini(base64, mimeType, retries + 1);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API erro (${res.status}): ${err}`);
  }

  const result = await res.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  try {
    return JSON.parse(text);
  } catch {
    // tenta extrair JSON do texto
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return {};
  }
}

function validatePlate(raw) {
  const p = (raw || "").toUpperCase().replace(/[-\s]/g, "").trim();
  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(p)) return { plate: p, plate_type: "mercosul" };
  if (/^[A-Z]{3}\d{4}$/.test(p)) return { plate: p, plate_type: "antiga" };
  // Se parece uma placa mas tem erro sutil, retorna mesmo assim para o usuário corrigir
  if (p.length >= 7) return { plate: p.substring(0, 7), plate_type: "" };
  return { plate: "", plate_type: "" };
}

export async function scanPlate(imageBase64) {
  let b64 = imageBase64;
  if (b64.startsWith("data:")) b64 = b64.split(",")[1];

  const data = await callGemini(b64);
  const { plate, plate_type } = validatePlate(data.plate);
  const brand = (data.brand || "").trim();
  const model = (data.model || "").trim();

  // Auto-aprender no cadastro local
  if (plate) {
    const vehicles = readLS("vtr_vehicles", {});
    if (!vehicles[plate]) {
      vehicles[plate] = { plate, brand, model, color: "", updated_at: nowISO() };
      writeLS("vtr_vehicles", vehicles);
    }
  }

  const res = await lookupVehicle(plate);
  return {
    plate,
    plate_type,
    brand: res.found ? (res.vehicle.brand || brand) : brand,
    model: res.found ? (res.vehicle.model || model) : model,
    color: res.found ? (res.vehicle.color || "") : "",
    from_registry: res.found,
    raw: JSON.stringify(data),
  };
}

export async function enrichPlate(plate, imageBase64 = "") {
  const cleaned = (plate || "").toUpperCase().replace(/[-\s]/g, "").trim();
  const { plate: validPlate, plate_type } = validatePlate(cleaned);
  if (!validPlate) throw new Error("Formato de placa inválido");

  // 1) Consulta cadastro local primeiro (inclui histórico de sessões)
  const reg = await lookupVehicle(validPlate);
  if (reg.found) {
    return { plate: validPlate, plate_type, ...reg.vehicle, from_registry: true, raw: "" };
  }

  // 2) Se não há imagem, retorna placa sem dados extras
  if (!imageBase64 || !GEMINI_KEYS?.length) {
    return { plate: validPlate, plate_type, brand: "", model: "", color: "", from_registry: false, raw: "" };
  }

  // 3) Gemini para identificar marca/modelo (apenas quando necessário)
  let b64 = imageBase64;
  if (b64.startsWith("data:")) b64 = b64.split(",")[1];
  try {
    const data = await callGemini(b64);
    const brand = (data.brand || "").trim();
    const model = (data.model || "").trim();
    // Auto-aprender para próximas consultas
    if (validPlate && (brand || model)) {
      const vehicles = readLS("vtr_vehicles", {});
      vehicles[validPlate] = { plate: validPlate, brand, model, color: "", updated_at: nowISO() };
      writeLS("vtr_vehicles", vehicles);
    }
    return { plate: validPlate, plate_type, brand, model, color: "", from_registry: false, raw: JSON.stringify(data) };
  } catch {
    return { plate: validPlate, plate_type, brand: "", model: "", color: "", from_registry: false, raw: "" };
  }
}

/**
 * Lê APENAS a placa do veículo na imagem (chamada Gemini rápida e barata).
 * Não busca marca/modelo — usar enrichPlate() para isso em seguida.
 * Retorna a placa normalizada (sem traço) ou "" se ilegível.
 */
export async function readPlateOnly(imageBase64, retries = 0) {
  let b64 = imageBase64;
  if (b64.startsWith("data:")) b64 = b64.split(",")[1];

  let keyData;
  try {
    keyData = await getAvailableKey(retries);
  } catch {
    return "";
  }
  
  const { key, idx } = keyData;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

  const payload = {
    contents: [{
      parts: [
        {
          text:
            "Leia a placa do veículo nesta foto. " +
            "Responda APENAS com JSON puro: {\"plate\": \"XXXXXXX\"} " +
            "onde XXXXXXX são os 7 caracteres da placa em MAIÚSCULAS sem traço. " +
            "Padrões válidos: MERCOSUL (ex: ABC1D23) ou ANTIGA (ex: ABC1234). " +
            "Se não conseguir ler com certeza, retorne {\"plate\": \"\"}. Sem markdown.",
        },
        { inlineData: { mimeType: "image/jpeg", data: b64 } },
      ],
    }],
    generationConfig: { responseMimeType: "application/json" },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 429) {
      _keyUsage[idx] = Array(RPM_LIMIT).fill(Date.now());
      return readPlateOnly(imageBase64, retries + 1);
    }
    if (!res.ok) return "";
    const result = await res.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let data = {};
    try { data = JSON.parse(text); } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) { try { data = JSON.parse(match[0]); } catch { return ""; } }
    }
    const { plate } = validatePlate(data.plate || "");
    return plate || "";
  } catch {
    return "";
  }
}

