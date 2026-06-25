import { useEffect, useRef, useState } from "react";
import { Camera, X, RefreshCw, Loader2, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Live camera modal with optional auto-scan mode.
 * onCapture(base64) is called on capture (manual or auto loop).
 * Parent must set scanning=true while processing and the captured base64
 * is whatever the parent triggers; in auto mode this is called every ~2.2s
 * until parent closes the modal.
 */
export default function CameraCapture({ open, onClose, onCapture, scanning, defaultAuto = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const autoTimerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState("environment");
  const [err, setErr] = useState("");
  const [autoMode, setAutoMode] = useState(defaultAuto);
  const [pulse, setPulse] = useState(false);

  async function start() {
    setErr("");
    setReady(false);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch (e) {
      console.error(e);
      setErr(
        e?.name === "NotAllowedError"
          ? "Permissão da câmera negada. Habilite nas configurações do navegador."
          : "Não foi possível abrir a câmera neste dispositivo."
      );
    }
  }

  function stop() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setReady(false);
  }

  useEffect(() => {
    if (open) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  function captureFrame() {
    const v = videoRef.current;
    if (!v || !ready) return null;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    const max = 1280;
    let cw = w, ch = h;
    if (w > max || h > max) {
      if (w > h) { ch = Math.round(h * max / w); cw = max; }
      else { cw = Math.round(w * max / h); ch = max; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext("2d").drawImage(v, 0, 0, cw, ch);
    return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
  }

  function manualCapture() {
    const b64 = captureFrame();
    if (!b64) {
      toast.error("Câmera não está pronta");
      return;
    }
    onCapture(b64);
  }

  // Auto-scan loop: while autoMode is on, ready and not scanning, capture every 2.2s
  useEffect(() => {
    if (!open || !autoMode || !ready || scanning) {
      setPulse(false);
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      return;
    }
    setPulse(true);
    autoTimerRef.current = setTimeout(() => {
      const b64 = captureFrame();
      if (b64) onCapture(b64);
    }, 2200);
    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoMode, ready, scanning]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 bg-black/80 border-b border-border">
        <button
          data-testid="btn-close-camera"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          data-testid="btn-toggle-auto"
          onClick={() => setAutoMode((a) => !a)}
          className={`inline-flex items-center gap-2 h-10 px-3 rounded-md border text-xs font-bold uppercase tracking-wider transition-colors ${
            autoMode
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary text-foreground border-border"
          }`}
        >
          {autoMode ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
          {autoMode ? "Auto" : "Manual"}
        </button>
        <button
          data-testid="btn-flip-camera"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-foreground"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`relative w-[80%] max-w-md h-32 transition-all ${pulse ? "scale-105" : "scale-100"}`}>
            <div className="viewfinder-corner tl" />
            <div className="viewfinder-corner tr" />
            <div className="viewfinder-corner bl" />
            <div className="viewfinder-corner br" />
            {pulse && (
              <div className="absolute inset-0 border-2 border-primary/40 rounded-md animate-pulse" />
            )}
          </div>
        </div>

        {autoMode && ready && !scanning && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-md">
            <span className="text-xs font-heading uppercase tracking-wider text-primary inline-flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
              Detectando placa...
            </span>
          </div>
        )}

        {!ready && !err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="mt-3 text-sm text-foreground/80">Abrindo câmera...</div>
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center">
            <div className="text-destructive font-bold mb-2">{err}</div>
            <Button onClick={start} className="mt-2 bg-primary text-primary-foreground">
              Tentar novamente
            </Button>
          </div>
        )}
        {scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <div className="mt-3 font-heading uppercase tracking-wider text-sm text-primary">
              Analisando imagem...
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-black/90 border-t border-border flex items-center justify-center">
        <button
          data-testid="btn-capture"
          onClick={manualCapture}
          disabled={!ready || scanning}
          className="relative h-20 w-20 rounded-full bg-primary flex items-center justify-center disabled:opacity-50"
        >
          <div className="absolute inset-2 rounded-full border-4 border-primary-foreground" />
          <Camera className="h-7 w-7 text-primary-foreground relative z-10" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
