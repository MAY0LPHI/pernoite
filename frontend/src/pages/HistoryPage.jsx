import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Calendar, Trash2 } from "lucide-react";
import PageShell from "@/components/PageShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSessions, deleteSession } from "@/lib/api";

export default function HistoryPage() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");

  const load = (date) => {
    listSessions(date || undefined)
      .then(setItems)
      .catch(() => toast.error("Erro ao carregar histórico"));
  };

  useEffect(() => { load(); }, []);

  async function onDelete(id, e) {
    e.stopPropagation();
    if (!confirm("Excluir esta sessão do histórico?")) return;
    try {
      await deleteSession(id);
      load(filter);
      toast.success("Excluído");
    } catch { toast.error("Erro ao excluir"); }
  }

  return (
    <PageShell title="Histórico" subtitle="Pernoites salvos" back="/">
      <div>
        <Label className="font-heading uppercase text-xs tracking-wider text-muted-foreground">
          Filtrar por data
        </Label>
        <div className="flex gap-2 mt-2">
          <Input
            data-testid="input-filtro-data"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(filter)}
            placeholder="DD/MM/AAAA"
            className="h-12 bg-input border-border font-mono-plate"
          />
          <button
            data-testid="btn-aplicar-filtro"
            onClick={() => load(filter)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <Calendar className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum pernoite encontrado.
          </div>
        ) : (
          items.map((s) => {
            const total = (s.sectors || []).reduce((a, sec) => a + (sec.vehicles?.length || 0), 0);
            return (
              <div
                key={s.id}
                data-testid={`history-item-${s.id}`}
                onClick={() => nav(`/history/${s.id}`)}
                className="cursor-pointer flex items-center gap-3 p-4 rounded-md border border-border bg-card hover:border-primary/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono-plate text-base font-bold text-primary">{s.date}</div>
                  <div className="text-sm text-foreground/90 truncate">{s.operator_name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {total} {total === 1 ? "veículo" : "veículos"} • {s.start_time} - {s.end_time}
                    {s.finalized ? " • Finalizado" : " • Em andamento"}
                  </div>
                </div>
                <button
                  data-testid={`btn-delete-${s.id}`}
                  onClick={(e) => onDelete(s.id, e)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
