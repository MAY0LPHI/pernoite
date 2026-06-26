import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Trash2, Plus, Sparkles, Database, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageShell from "@/components/PageShell";
import CameraCapture from "@/components/CameraCapture";
import { getSession, updateSession, createVehicle, lookupVehicle, enrichPlate, scanPlate, isHybridMode } from "@/lib/api";
import { normalizePlate, formatPlate, isValidPlate } from "@/lib/plate";
import { recognizePlateLocal } from "@/lib/ocr";

function getPendingBatchCount(sessionId, sectorId) {
  try {
    const key = `batch_${sessionId}_${sectorId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const items = JSON.parse(raw);
    return items.filter((it) => it.status !== "duplicate").length;
  } catch {
    return 0;
  }
}

function compressImage(file, maxSize = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round((height * maxSize) / width); width = maxSize; }
          else { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ScanPage() {
  const { id, sectorId } = useParams();
  const nav = useNavigate();

  const [session, setSession] = useState(null);
  const [sector, setSector] = useState(null);
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastSource, setLastSource] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingBatch, setPendingBatch] = useState(0);

  useEffect(() => {
    setPendingBatch(getPendingBatchCount(id, sectorId));
  }, [id, sectorId]);

  const load = async () => {
    try {
      const s = await getSession(id);
      setSession(s);
      const sec = (s.sectors || []).find((x) => x.sector_id === sectorId);
      setSector(sec || null);
    } catch {
      toast.error("Erro ao carregar setor");
    }
  };

  useEffect(() => { load(); }, [id, sectorId]);

  async function onLookupPlate(value) {
    setPlate(value.toUpperCase());
    const cleaned = value.toUpperCase().replace(/[-\s]/g, "");
    if (cleaned.length >= 7) {
      try {
        const res = await lookupVehicle(cleaned);
        if (res.found) {
          setBrand(res.vehicle.brand || "");
          setModel(res.vehicle.model || "");
          setLastSource("registry");
          toast.success("Veículo encontrado no cadastro", { duration: 1500 });
        }
      } catch (e) {
        console.debug("plate lookup failed", e);
      }
    }
  }

  async function handleScan(captureData) {
    // A captura agora retorna um objeto ou uma string dependendo se veio do input file ou da camera
    const b64Crop = captureData?.b64Crop || captureData;
    const b64Full = captureData?.b64Full || captureData;
    setScanning(true);
    const safetyTimer = setTimeout(() => setScanning(false), 25000);
    try {
      if (isHybridMode()) {
        // ==========================================
        // MODO HÍBRIDO (Economia de IA)
        // ==========================================
        // ─── ETAPA 1: OCR local (Tesseract — sem internet, sem tokens) ──────────
        const local = await recognizePlateLocal(b64Crop);

        if (local.plate) {
          // Placa lida localmente!
          setPlate(local.plate);

          // ─── ETAPA 2: Busca dados no banco local (pernoites anteriores) ───────
          const lookup = await lookupVehicle(local.plate);
          if (lookup.found) {
            // ✅ Dados encontrados localmente — ZERO tokens gastos!
            if (lookup.vehicle.brand) setBrand(lookup.vehicle.brand);
            if (lookup.vehicle.model) setModel(lookup.vehicle.model);
            setLastSource("registry");
            toast.success("✅ Lido localmente + dados do cadastro — nenhum token gasto!");
            setCameraOpen(false);
            return;
          }

          // ─── ETAPA 3: Placa nova — chama IA só para marca/modelo ─────────────
          try {
            const res = await enrichPlate(local.plate, b64Full);
            if (res.brand) setBrand(res.brand);
            if (res.model) setModel(res.model);
            setLastSource("ai");
            toast.success("🤖 Placa lida localmente + IA identificou o veículo");
          } catch {
            toast.success("📷 Placa lida localmente — adicione marca/modelo manualmente");
          }
          setCameraOpen(false);
          return;
        }

        // ─── FALLBACK: OCR local falhou — usa IA para tudo ──────────────────────
        const scanRes = await scanPlate(b64Full);
        if (scanRes.plate) {
          setPlate(scanRes.plate);
          if (scanRes.brand) setBrand(scanRes.brand);
          if (scanRes.model) setModel(scanRes.model);
          setLastSource(scanRes.from_registry ? "registry" : "ai");
          toast.success("✨ IA leu a placa e identificou o veículo (Fallback)");
        } else {
          toast.error("Nenhuma placa identificada. Tente novamente.");
        }
        setCameraOpen(false);
      } else {
        // ==========================================
        // MODO 100% IA (Velocidade e Precisão)
        // ==========================================
        const scanRes = await scanPlate(b64Full);
        if (scanRes.plate) {
          setPlate(scanRes.plate);
          if (scanRes.brand) setBrand(scanRes.brand);
          if (scanRes.model) setModel(scanRes.model);
          setLastSource(scanRes.from_registry ? "registry" : "ai");
          toast.success("✨ Lida pela Inteligência Artificial");
        } else {
          toast.error("A IA não encontrou placa nesta foto.");
        }
        setCameraOpen(false);
      }
    } catch {
      toast.error("Falha ao reconhecer. Digite manualmente.");
    } finally {
      clearTimeout(safetyTimer);
      setScanning(false);
    }
  }


  async function onAdd() {
    const cleanPlate = normalizePlate(plate);
    if (!cleanPlate) {
      toast.error("Informe a placa");
      return;
    }
    if (!isValidPlate(cleanPlate)) {
      toast.error("Formato inválido. Use AAA0A00 (Mercosul) ou AAA0000 (antiga).");
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
      toast.warning(`Placa ${formatPlate(cleanPlate)} já registrada hoje no setor: ${existingSectorName}`);
      return;
    }

    const newSectors = (session.sectors || []).map((s) => {
      if (s.sector_id !== sectorId) return s;
      return {
        ...s,
        vehicles: [
          ...(s.vehicles || []),
          { id: crypto.randomUUID(), plate: cleanPlate, brand, model, color: "" },
        ],
      };
    });
    try {
      const updated = await updateSession(id, { sectors: newSectors });
      setSession(updated);
      setSector(updated.sectors.find((x) => x.sector_id === sectorId));
      setPlate(""); setBrand(""); setModel("");
      setLastSource(null);
      toast.success("Veículo adicionado");
    } catch {
      toast.error("Erro ao salvar");
    }
  }

  async function onRemove(vehicleId) {
    const newSectors = (session.sectors || []).map((s) => {
      if (s.sector_id !== sectorId) return s;
      return { ...s, vehicles: (s.vehicles || []).filter((v) => v.id !== vehicleId) };
    });
    try {
      const updated = await updateSession(id, { sectors: newSectors });
      setSession(updated);
      setSector(updated.sectors.find((x) => x.sector_id === sectorId));
      toast.success("Removido");
    } catch {
      toast.error("Erro ao remover");
    }
  }

  if (!session || !sector) {
    return (
      <PageShell title="Carregando..." back={`/session/${id}`}>
        <div className="text-muted-foreground">Aguarde...</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={sector.sector_name}
      subtitle={`${sector.vehicles?.length || 0} ${(sector.vehicles?.length || 0) === 1 ? "veículo" : "veículos"} neste setor`}
      back={`/session/${id}`}
    >
      {/* Viewfinder + Upload */}
      <div className="relative rounded-md border-2 border-dashed border-primary/40 bg-secondary/40 h-40 flex flex-col items-center justify-center overflow-hidden">
        <div className="viewfinder-corner tl" />
        <div className="viewfinder-corner tr" />
        <div className="viewfinder-corner bl" />
        <div className="viewfinder-corner br" />
        <Camera className="h-9 w-9 text-primary" strokeWidth={2} />
        <div className="mt-2 font-heading uppercase tracking-wider text-xs text-muted-foreground">
          Pronto para escanear
        </div>
      </div>

      <Button
        data-testid="btn-camera"
        onClick={() => setCameraOpen(true)}
        disabled={scanning}
        className="h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider"
      >
        <Camera className="h-5 w-5 mr-2" />
        Abrir Câmera
      </Button>

      <Button
        data-testid="btn-batch"
        onClick={() => nav(`/session/${id}/sector/${sectorId}/batch`)}
        variant="outline"
        className="relative h-12 border-primary/40 bg-card hover:bg-secondary text-primary font-bold uppercase tracking-wider text-sm"
      >
        <Upload className="h-4 w-4 mr-2" />
        <span>Modo Lote (várias fotos)</span>
        {pendingBatch > 0 && (
          <span className="absolute -top-2 -right-2 inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold px-1 shadow-lg animate-pulse">
            {pendingBatch}
          </span>
        )}
      </Button>



      {/* Manual form */}
      <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-heading uppercase text-xs tracking-wider text-muted-foreground">
            Dados do veículo
          </span>
          {lastSource === "ai" && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary font-heading">
              <Sparkles className="h-3 w-3" /> IA
            </span>
          )}
          {lastSource === "registry" && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-accent font-heading">
              <Database className="h-3 w-3" /> Cadastro
            </span>
          )}
          {lastSource === "local" && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-foreground font-heading">
              <Sparkles className="h-3 w-3" /> OCR Local
            </span>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Placa</Label>
          <Input
            data-testid="input-placa"
            value={plate}
            onChange={(e) => onLookupPlate(e.target.value)}
            placeholder="AAA0A00"
            className="h-14 mt-1 font-mono-plate text-lg uppercase bg-input border-border tracking-widest"
            maxLength={8}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Marca</Label>
            <Input
              data-testid="input-marca"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Chevrolet"
              className="h-12 mt-1 bg-input border-border"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Modelo</Label>
            <Input
              data-testid="input-modelo"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Onix"
              className="h-12 mt-1 bg-input border-border"
            />
          </div>
        </div>
        <Button
          data-testid="btn-adicionar-veiculo"
          onClick={onAdd}
          className="h-12 mt-1 bg-accent hover:bg-accent/90 text-accent-foreground font-bold uppercase tracking-wider"
        >
          <Plus className="h-5 w-5 mr-2" /> Adicionar
        </Button>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {(sector.vehicles || []).slice().reverse().map((v) => (
          <div
            key={v.id}
            data-testid={`vehicle-row-${v.plate}`}
            className="flex items-center gap-3 p-3 rounded-md border border-border bg-card"
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono-plate font-bold text-primary text-base">{formatPlate(v.plate)}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[v.brand, v.model].filter(Boolean).join(" • ") || "—"}
              </div>
            </div>
            <button
              data-testid={`btn-remover-${v.plate}`}
              onClick={() => onRemove(v.id)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(sector.vehicles || []).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-6">
            Nenhum veículo adicionado neste setor ainda.
          </div>
        )}
      </div>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleScan}
        scanning={scanning}
      />
    </PageShell>
  );
}
