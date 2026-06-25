import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Check, Save, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageShell from "@/components/PageShell";
import { exportSession, updateSession } from "@/lib/api";
import { setActiveSession } from "@/lib/storage";

export default function ReviewPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    exportSession(id).then(setText).catch(() => toast.error("Erro ao gerar resumo"));
  }, [id]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function shareWhats() {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  async function finalize() {
    try {
      await updateSession(id, { finalized: true });
      setActiveSession(null);
      toast.success("Pernoite salvo no histórico");
      nav("/");
    } catch {
      toast.error("Erro ao finalizar");
    }
  }

  return (
    <PageShell title="Resumo" subtitle="Confira antes de copiar" back={`/session/${id}`}>
      <div className="rounded-md border border-border bg-card p-4">
        <pre
          data-testid="review-text"
          className="whitespace-pre-wrap break-words text-sm text-foreground/90 font-mono-plate leading-relaxed"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {text || "Carregando..."}
        </pre>
      </div>

      <Button
        data-testid="btn-copiar-tudo"
        onClick={copyAll}
        className="h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider"
      >
        {copied ? <Check className="h-5 w-5 mr-2" /> : <Copy className="h-5 w-5 mr-2" />}
        {copied ? "Copiado" : "Copiar Tudo"}
      </Button>

      <Button
        data-testid="btn-share-whatsapp"
        onClick={shareWhats}
        variant="outline"
        className="h-12 border-border bg-card hover:bg-secondary text-foreground"
      >
        <Share2 className="h-4 w-4 mr-2" /> Abrir no WhatsApp
      </Button>

      <Button
        data-testid="btn-finalizar"
        onClick={finalize}
        variant="outline"
        className="h-12 border-border bg-card hover:bg-secondary text-foreground"
      >
        <Save className="h-4 w-4 mr-2" /> Salvar e Encerrar
      </Button>
    </PageShell>
  );
}
