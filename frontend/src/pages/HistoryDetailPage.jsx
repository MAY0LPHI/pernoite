import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Check, Share2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageShell from "@/components/PageShell";
import { exportSession, getSession } from "@/lib/api";

export default function HistoryDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [session, setSession] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getSession(id).then(setSession).catch(() => toast.error("Sessão não encontrada"));
    exportSession(id).then(setText).catch(() => {});
  }, [id]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.debug("clipboard copy failed", e);
    }
  }

  async function shareWhats() {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  return (
    <PageShell
      title={session?.date || "Pernoite"}
      subtitle={session?.operator_name}
      back="/history"
    >
      <div className="rounded-md border border-border bg-card p-4">
        <pre
          data-testid="history-detail-text"
          className="whitespace-pre-wrap break-words text-sm text-foreground/90 font-mono-plate leading-relaxed"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {text || "Carregando..."}
        </pre>
      </div>

      <Button
        data-testid="btn-copy-history"
        onClick={copyAll}
        className="h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider"
      >
        {copied ? <Check className="h-5 w-5 mr-2" /> : <Copy className="h-5 w-5 mr-2" />}
        {copied ? "Copiado" : "Copiar Tudo"}
      </Button>

      <Button
        data-testid="btn-share-history"
        onClick={shareWhats}
        variant="outline"
        className="h-12 border-border bg-card hover:bg-secondary text-foreground"
      >
        <Share2 className="h-4 w-4 mr-2" /> Enviar no WhatsApp
      </Button>

      {session && !session.finalized && (
        <Button
          data-testid="btn-continue-session"
          onClick={() => nav(`/session/${id}`)}
          variant="outline"
          className="h-12 border-primary/40 bg-card hover:bg-secondary text-primary"
        >
          <PlayCircle className="h-4 w-4 mr-2" /> Continuar este pernoite
        </Button>
      )}
    </PageShell>
  );
}
