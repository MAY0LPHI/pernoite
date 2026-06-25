import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, ChevronRight, CheckCheck, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageShell from "@/components/PageShell";
import { getSession } from "@/lib/api";

function getPendingBatch(sessionId, sectorId) {
  try {
    const raw = localStorage.getItem(`batch_${sessionId}_${sectorId}`);
    if (!raw) return 0;
    const items = JSON.parse(raw);
    return items.filter((it) => it.status !== "duplicate").length;
  } catch { return 0; }
}

export default function SessionPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState(null);

  const load = () => {
    getSession(id)
      .then(setSession)
      .catch(() => toast.error("Sessão não encontrada"));
  };

  useEffect(() => {
    load();
    // refresh when returning back
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [id]);

  if (!session) {
    return (
      <PageShell title="Carregando..." back="/">
        <div className="text-muted-foreground">Aguarde...</div>
      </PageShell>
    );
  }

  const totalVehicles = (session.sectors || []).reduce((acc, s) => acc + (s.vehicles?.length || 0), 0);

  return (
    <PageShell
      title="Setores"
      subtitle={`${session.operator_name} • ${session.date}`}
      back="/"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="font-heading uppercase text-[10px] tracking-wider text-muted-foreground">Veículos</div>
          <div className="text-2xl font-bold font-mono-plate text-primary mt-1">{totalVehicles}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="font-heading uppercase text-[10px] tracking-wider text-muted-foreground">Setores ativos</div>
          <div className="text-2xl font-bold font-mono-plate text-primary mt-1">
            {(session.sectors || []).filter((s) => (s.vehicles || []).length > 0).length}
            <span className="text-muted-foreground text-base"> / {session.sectors.length}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        {(session.sectors || []).map((sector) => {
          const count = sector.vehicles?.length || 0;
          const pendingBatch = getPendingBatch(id, sector.sector_id);
          return (
            <button
              key={sector.sector_id}
              data-testid={`sector-card-${sector.sector_id}`}
              onClick={() => nav(`/session/${id}/sector/${sector.sector_id}`)}
              className="group flex items-center justify-between p-4 rounded-md border border-border bg-card hover:border-primary/60 hover:bg-secondary/60 transition-all text-left"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-secondary border border-border group-hover:border-primary/40">
                  <Camera className="h-4 w-4 text-primary" strokeWidth={2.5} />
                  {pendingBatch > 0 && (
                    <span className="absolute -top-2 -right-2 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 shadow animate-pulse">
                      {pendingBatch}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading uppercase text-sm font-medium leading-tight text-foreground break-words">
                    {sector.sector_name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {count === 0 ? "Nenhum veículo" : `${count} ${count === 1 ? "veículo" : "veículos"}`}
                    {pendingBatch > 0 && (
                      <span className="ml-2 text-destructive font-medium">
                        • {pendingBatch} pendente(s) no lote
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 rounded-md bg-primary/15 text-primary font-bold text-xs px-2 font-mono-plate">
                    {count}
                  </span>
                )}
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 pb-5 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="max-w-md mx-auto">
          <Button
            data-testid="btn-revisar-finalizar"
            onClick={() => nav(`/session/${id}/review`)}
            disabled={totalVehicles === 0}
            className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider"
          >
            {totalVehicles === 0 ? (
              <>
                <FileText className="h-5 w-5 mr-2" /> Adicione veículos para finalizar
              </>
            ) : (
              <>
                <CheckCheck className="h-5 w-5 mr-2" /> Revisar e Finalizar
              </>
            )}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
