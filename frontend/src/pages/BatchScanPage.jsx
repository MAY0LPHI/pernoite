import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Upload, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Sparkles, Database, Cpu, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageShell from "@/components/PageShell";
import { getSession, updateSession, readPlateOnly, enrichPlate, lookupVehicle, scanPlate } from "@/lib/api";
import { normalizePlate, formatPlate, isValidPlate } from "@/lib/plate";
import { recognizePlateLocal } from "@/lib/ocr";
import { ErrorBoundary } from "@/components/ErrorBoundary";



const CONCURRENCY = 2;

function storageKey(sessionId, sectorId) {
  return `batch_${sessionId}_${sectorId}`;
}
function saveBatch(sessionId, sectorId, items) {
  try {
    // Salva thumb (pequena ~15KB) mas não b64 (pesada ~200KB) para evitar QuotaExceededError
    const toSave = items.map(it => ({ ...it, b64: null }));
    localStorage.setItem(storageKey(sessionId, sectorId), JSON.stringify(toSave));
  } catch (e) {
    // Se ainda estourar a quota, tenta sem thumb
    try {
      const toSave = items.map(it => ({ ...it, b64: null, thumb: null }));
      localStorage.setItem(storageKey(sessionId, sectorId), JSON.stringify(toSave));
    } catch {
      console.warn("localStorage save failed (quota?)", e);
    }
  }
}
function loadBatch(sessionId, sectorId) {
  try {
    const raw = localStorage.getItem(storageKey(sessionId, sectorId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function clearBatch(sessionId, sectorId) {
  try { localStorage.removeItem(storageKey(sessionId, sectorId)); } catch { /* ignore */ }
}

function compressFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // ── Thumb (salva no localStorage para persistir após refresh) ──────────
        const THUMB = 640;
        let tw = img.width, th = img.height;
        if (tw > THUMB || th > THUMB) {
          if (tw > th) { th = Math.round(th * THUMB / tw); tw = THUMB; }
          else { tw = Math.round(tw * THUMB / th); th = THUMB; }
        }
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = tw; thumbCanvas.height = th;
        thumbCanvas.getContext("2d").drawImage(img, 0, 0, tw, th);
        const thumb = thumbCanvas.toDataURL("image/jpeg", 0.75);

        // ── B64 (para OCR e envio à IA) ───────────────────────────────────────
        // Reduzindo o tamanho máximo para 640px para deixar o upload e a IA muito mais rápidos
        const AI_MAX = 640;
        let aw = img.width, ah = img.height;
        if (aw > AI_MAX || ah > AI_MAX) {
          if (aw > ah) { ah = Math.round(ah * AI_MAX / aw); aw = AI_MAX; }
          else { aw = Math.round(aw * AI_MAX / ah); ah = AI_MAX; }
        }
        const aiCanvas = document.createElement("canvas");
        aiCanvas.width = aw; aiCanvas.height = ah;
        aiCanvas.getContext("2d").drawImage(img, 0, 0, aw, ah);
        const b64 = aiCanvas.toDataURL("image/jpeg", 0.80).split(",")[1];

        resolve({ b64, thumb });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BatchScanPage() {
  const { id, sectorId } = useParams();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [session, setSession] = useState(null);
  const [sector, setSector] = useState(null);
  const [items, setItems] = useState([]); // {id, thumb, b64, status, plate, brand, model, source, error}
  const runningRef = useRef(0);
  const queueRef = useRef([]);

  useEffect(() => {
    getSession(id).then((s) => {
      setSession(s);
      setSector((s.sectors || []).find((x) => x.sector_id === sectorId));
      // Restore persisted batch items
      const restored = loadBatch(id, sectorId);
      if (restored.length > 0) {
        // any 'processing' state must be reset to 'pending' since worker died on reload
        const fixed = restored.map((it) =>
          it.status === "processing" ? { ...it, status: "pending" } : it
        );
        setItems(fixed);
        // re-enqueue pending items
        fixed.filter((it) => it.status === "pending").forEach((it) => queueRef.current.push(it.id));
        setTimeout(pumpQueue, 100);
        toast.info(`${fixed.length} foto(s) restauradas do último lote`);
      }
    });
  }, [id, sectorId]);

  // Persist on every items change
  useEffect(() => {
    if (session) saveBatch(id, sectorId, items);
  }, [items, id, sectorId, session]);

  function pumpQueue() {
    while (runningRef.current < CONCURRENCY && queueRef.current.length > 0) {
      const itemId = queueRef.current.shift();
      runningRef.current += 1;
      processItem(itemId).finally(() => {
        runningRef.current -= 1;
        pumpQueue();
      });
    }
  }

  async function processItem(itemId) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, status: "processing" } : it)));
    const cur = (await new Promise((r) => setItems((p) => { r(p.find((x) => x.id === itemId)); return p; })));
    if (!cur) return;

    const safety = setTimeout(() => {
      setItems((prev) =>
        prev.map((it) => it.id === itemId && it.status === "processing"
          ? { ...it, status: "needs_input", error: "Tempo esgotado" }
          : it
        )
      );
    }, 30000);

    try {
      // ─── ETAPA 1: Tenta ler com IA ─────────────────────
      // Chama scanPlate que extrai a placa E a marca/modelo em uma única requisição (economiza a cota da IA)
      const scanRes = await scanPlate(cur.b64);
      const finalPlate = scanRes.plate || "";

      if (!finalPlate) {
        setItems((prev) => prev.map((it) =>
          it.id === itemId ? { ...it, status: "needs_input", source: null } : it
        ));
        return;
      }

      // ─── ETAPA 2: Verifica duplicatas ────────────────────────────────────
      const inSector = (sector?.vehicles || []).some((v) => v.plate === finalPlate);
      if (inSector) {
        setItems((prev) => prev.map((it) =>
          it.id === itemId
            ? { ...it, status: "duplicate", plate: finalPlate, source: "duplicate", error: "Já no setor" }
            : it
        ));
        return;
      }
      const dupItem = await new Promise((r) =>
        setItems((p) => {
          r(p.find((x) => x.id !== itemId && x.plate === finalPlate && (x.status === "done" || x.status === "duplicate")));
          return p;
        })
      );
      if (dupItem) {
        setItems((prev) => prev.map((it) =>
          it.id === itemId
            ? { ...it, status: "duplicate", plate: finalPlate, brand: dupItem.brand, model: dupItem.model, source: "duplicate", error: "Foto duplicada" }
            : it
        ));
        return;
      }

      // ─── ETAPA 3: Sucesso — salva item com todos os dados ───────────
      // O scanPlate já buscou no registro local (from_registry) ou usou a IA.
      setItems((prev) => prev.map((it) =>
        it.id === itemId
          ? { 
              ...it, 
              status: "done", 
              plate: finalPlate, 
              brand: scanRes.brand || "", 
              model: scanRes.model || "", 
              source: scanRes.from_registry ? "registry" : "ai", 
              error: "" 
            }
          : it
      ));
    } catch (e) {
      console.error("Batch item failed:", e);
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, status: "error", error: "Falha no reconhecimento" } : it))
      );
    } finally {
      clearTimeout(safety);
    }
  }

  async function aiRetryItem(itemId) {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    setItems((prev) => prev.map((x) => (x.id === itemId ? { ...x, status: "processing" } : x)));
    try {
      const res = await scanPlate(it.b64);
      setItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: res.plate ? "done" : "needs_input",
                plate: res.plate || x.plate,
                brand: res.brand || x.brand,
                model: res.model || x.model,
                source: res.from_registry ? "registry" : (res.plate ? "ai" : null),
              }
            : x
        )
      );
    } catch {
      setItems((prev) => prev.map((x) => (x.id === itemId ? { ...x, status: "error", error: "IA falhou" } : x)));
    }
  }

  async function enrichAllMissing() {
    const targets = items.filter(
      (it) =>
        it.status !== "pending" &&
        it.status !== "processing" &&
        it.status !== "duplicate" &&
        (!it.plate || !it.brand || !it.model || it.status === "error" || it.status === "needs_input")
    );
    if (targets.length === 0) {
      toast.info("Tudo já está identificado ou são duplicatas");
      return;
    }
    toast.message(`Consultando IA para ${targets.length} veículo(s)...`);
    for (const it of targets) {
      try {
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "processing" } : x)));
        
        let res;
        // Se já temos uma placa válida mas faltam dados, apenas enriquece.
        // Se a placa não foi lida localmente, escaneia a imagem completa com a IA.
        if (it.plate && isValidPlate(normalizePlate(it.plate)) && it.status !== "error") {
          res = await enrichPlate(it.plate, it.b64);
        } else {
          res = await scanPlate(it.b64);
        }

        setItems((prev) =>
          prev.map((x) =>
            x.id === it.id
              ? {
                  ...x,
                  status: res.plate ? "done" : "needs_input",
                  plate: res.plate || x.plate,
                  brand: res.brand || x.brand,
                  model: res.model || x.model,
                  source: res.from_registry ? "registry" : (res.plate || res.brand ? "ai" : x.source),
                  error: "",
                }
              : x
          )
        );
      } catch {
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "error", error: "IA falhou" } : x)));
      }
    }
    toast.success("Processamento com IA concluído");
  }

  async function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newItems = [];
    for (const f of files) {
      try {
        const { b64, thumb } = await compressFile(f);
        newItems.push({
          id: crypto.randomUUID(),
          thumb, b64,
          status: "pending",
          plate: "", brand: "", model: "",
          source: null, error: "",
        });
      } catch {
        // skip bad file
      }
    }
    setItems((prev) => [...prev, ...newItems]);
    newItems.forEach((it) => queueRef.current.push(it.id));
    pumpQueue();
    if (fileRef.current) fileRef.current.value = "";
  }

  function updateItem(itemId, patch) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }

  function removeItem(itemId) {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  }

  async function retryItem(itemId) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, status: "pending", error: "" } : it)));
    queueRef.current.push(itemId);
    pumpQueue();
  }

  async function aiRetry(itemId) {
    return aiRetryItem(itemId);
  }

  async function addOne(itemId) {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    const cleanPlate = normalizePlate(it.plate);
    if (!isValidPlate(cleanPlate)) {
      toast.error("Placa inválida. Use formato AAA0A00 ou AAA-0000.");
      return;
    }
    // Block duplicate against session (any sector)
    let existingSectorName = null;
    for (const s of session.sectors || []) {
      if ((s.vehicles || []).some((v) => normalizePlate(v.plate) === cleanPlate)) {
        existingSectorName = s.sector_name;
        break;
      }
    }
    if (existingSectorName) {
      toast.warning(`${formatPlate(cleanPlate)} já está registrado hoje no setor: ${existingSectorName}`);
      removeItem(itemId);
      return;
    }
    const newSectors = (session.sectors || []).map((s) => {
      if (s.sector_id !== sectorId) return s;
      return {
        ...s,
        vehicles: [
          ...(s.vehicles || []),
          { id: crypto.randomUUID(), plate: cleanPlate, brand: it.brand, model: it.model, color: "" },
        ],
      };
    });
    try {
      const updated = await updateSession(id, { sectors: newSectors });
      setSession(updated);
      setSector(updated.sectors.find((x) => x.sector_id === sectorId));
      const remaining = items.filter((x) => x.id !== itemId);
      setItems(remaining);
      if (remaining.length === 0) clearBatch(id, sectorId);
      toast.success(`${formatPlate(cleanPlate)} adicionado`);
    } catch {
      toast.error("Erro ao salvar");
    }
  }

  async function addAll() {
    const ready = items.filter((it) =>
      (it.status === "done" || it.status === "needs_input" || it.status === "duplicate") &&
      isValidPlate(normalizePlate(it.plate))
    );
    if (ready.length === 0) {
      toast.error("Nenhum item válido para adicionar");
      return;
    }
    const seen = new Set((sector.vehicles || []).map((v) => v.plate));
    const toAdd = [];
    const skippedDup = [];
    for (const it of ready) {
      const p = normalizePlate(it.plate);
      if (seen.has(p)) { skippedDup.push(it.id); continue; }
      seen.add(p);
      toAdd.push({ id: crypto.randomUUID(), plate: p, brand: it.brand, model: it.model, color: "" });
    }
    
    // Mesmo se toAdd.length === 0, queremos limpar os duplicados da tela
    if (toAdd.length > 0) {
      const newSectors = (session.sectors || []).map((s) =>
        s.sector_id !== sectorId ? s : { ...s, vehicles: [...(s.vehicles || []), ...toAdd] }
      );
      try {
        const updated = await updateSession(id, { sectors: newSectors });
        setSession(updated);
        setSector(updated.sectors.find((x) => x.sector_id === sectorId));
      } catch {
        toast.error("Erro ao salvar");
        return;
      }
    }

    const addedIds = new Set(ready.map((r) => r.id));
    const remaining = items.filter((it) => !addedIds.has(it.id));
    setItems(remaining);
    if (remaining.length === 0) clearBatch(id, sectorId);
    
    const msg = skippedDup.length > 0
      ? `${toAdd.length} adicionado(s) • ${skippedDup.length} duplicata(s) limpa(s)`
      : `${toAdd.length} adicionado(s)`;
    toast.success(msg);
  }

  const stats = {
    total: items.length,
    processing: items.filter((i) => i.status === "processing" || i.status === "pending").length,
    done: items.filter((i) => i.status === "done").length,
    duplicate: items.filter((i) => i.status === "duplicate").length,
    error: items.filter((i) => i.status === "error" || i.status === "needs_input").length,
  };

  return (
    <PageShell
      title="Modo Lote"
      subtitle={sector?.sector_name}
      back={`/session/${id}/sector/${sectorId}`}
    >
      <Button
        data-testid="btn-pick-files"
        onClick={() => fileRef.current?.click()}
        className="h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider"
      >
        <Upload className="h-5 w-5 mr-2" /> Selecionar fotos da galeria
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPickFiles}
        data-testid="input-batch-files"
      />

      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-md border border-border bg-card p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground font-heading">Fila</div>
            <div className="text-lg font-bold font-mono-plate text-primary">{stats.processing}</div>
          </div>
          <div className="rounded-md border border-border bg-card p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground font-heading">Prontos</div>
            <div className="text-lg font-bold font-mono-plate text-green-500">{stats.done}</div>
          </div>
          <div className="rounded-md border border-border bg-card p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground font-heading">Dup.</div>
            <div className="text-lg font-bold font-mono-plate text-yellow-500">{stats.duplicate}</div>
          </div>
          <div className="rounded-md border border-border bg-card p-2 text-center">
            <div className="text-[10px] uppercase text-muted-foreground font-heading">Manual</div>
            <div className="text-lg font-bold font-mono-plate text-destructive">{stats.error}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <ErrorBoundary key={it.id} onReset={() => retryItem(it.id)}>
            <BatchCard
              item={it}
              onUpdate={(patch) => updateItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
              onRetry={() => retryItem(it.id)}
              onAiRetry={() => aiRetry(it.id)}
              onAdd={() => addOne(it.id)}
            />
          </ErrorBoundary>
        ))}
        {items.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Toque em "Selecionar fotos" para começar.<br />
            As fotos serão processadas em segundo plano.
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 pb-5 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent">
          <div className="max-w-md mx-auto flex flex-col gap-2">
            <Button
              data-testid="btn-enrich-all"
              onClick={enrichAllMissing}
              variant="outline"
              disabled={stats.processing > 0}
              className="w-full h-11 border-primary/40 bg-card hover:bg-secondary text-primary font-bold uppercase tracking-wider text-xs"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Identificar marca/modelo com IA
            </Button>
            <Button
              data-testid="btn-adicionar-todos"
              onClick={addAll}
              disabled={stats.processing > 0}
              className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider"
            >
              <Plus className="h-5 w-5 mr-2" />
              {stats.processing > 0 ? `Aguardando ${stats.processing}...` : `Adicionar todos prontos`}
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function BatchCard({ item, onUpdate, onRemove, onRetry, onAiRetry, onAdd }) {
  const status = item.status;
  const plateValid = isValidPlate(normalizePlate(item.plate));
  const [preview, setPreview] = React.useState(false);
  const imgSrc = item.b64 ? `data:image/jpeg;base64,${item.b64}` : item.thumb;

  return (
    <>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setPreview(false)}
        >
          <img
            src={imgSrc}
            alt="Visualização"
            className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2"
            onClick={() => setPreview(false)}
          >✕</button>
        </div>
      )}
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex gap-3 p-3">
        <img
          src={item.thumb}
          alt=""
          className="w-20 h-20 object-cover rounded-md border border-border cursor-zoom-in transition-opacity hover:opacity-80"
          onClick={() => setPreview(true)}
          title="Clique para ampliar"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={status} source={item.source} />
            <button
              data-testid="btn-remove-batch-item"
              onClick={onRemove}
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {status === "processing" || status === "pending" ? (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{status === "pending" ? "Na fila" : "Analisando com IA..."}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="px-3 pb-3 flex flex-col gap-2">
        <Input
          data-testid="batch-input-placa"
          value={item.plate}
          onChange={(e) => onUpdate({ plate: e.target.value.toUpperCase() })}
          placeholder="AAA0A00 ou AAA0000"
          className="h-11 font-mono-plate uppercase tracking-widest bg-input border-border"
          maxLength={8}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            data-testid="batch-input-marca"
            value={item.brand}
            onChange={(e) => onUpdate({ brand: e.target.value })}
            placeholder="Marca"
            className="h-10 bg-input border-border text-sm"
          />
          <Input
            data-testid="batch-input-modelo"
            value={item.model}
            onChange={(e) => onUpdate({ model: e.target.value })}
            placeholder="Modelo"
            className="h-10 bg-input border-border text-sm"
          />
        </div>
        <div className="flex gap-2">
          {(item.status === "error" || item.status === "needs_input") && (
            <Button
              data-testid="btn-retry-batch"
              onClick={onAiRetry}
              variant="outline"
              className="flex-1 h-10 border-primary/40 bg-secondary text-primary text-xs"
            >
              <Sparkles className="h-3 w-3 mr-1" /> Tentar com IA
            </Button>
          )}
          <Button
            data-testid="btn-add-batch-one"
            onClick={onAdd}
            disabled={!plateValid}
            className="flex-1 h-10 bg-accent hover:bg-accent/90 text-accent-foreground font-bold uppercase text-xs tracking-wider"
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
        {item.plate && !plateValid && (
          <div className="text-[10px] text-destructive"><span>Formato inválido (use AAA0A00 ou AAA0000)</span></div>
        )}
      </div>
    </div>
    </>
  );
}

function StatusBadge({ status, source }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-heading text-green-500">
        <CheckCircle2 className="h-3 w-3" /> <span>Reconhecido</span>
        {source === "registry" && <Database className="h-3 w-3 text-accent" title="Do cadastro" />}
        {source === "ai" && <Sparkles className="h-3 w-3 text-primary" title="IA" />}
        {source === "local" && <Cpu className="h-3 w-3 text-foreground" title="OCR local" />}
      </span>
    );
  }
  if (status === "duplicate") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-heading text-yellow-500">
        <RotateCcw className="h-3 w-3" /> <span>Duplicata — dados reaproveitados</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-heading text-destructive">
        <AlertCircle className="h-3 w-3" /> <span>Erro — preencha manual</span>
      </span>
    );
  }
  if (status === "needs_input") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-heading text-yellow-500">
        <AlertCircle className="h-3 w-3" /> <span>Não detectado — preencha</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-heading text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> <span>{status === "pending" ? "Na fila" : "Processando"}</span>
    </span>
  );
}
