import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Moon, Settings2, History as HistoryIcon, ChevronRight } from "lucide-react";
import PageShell from "@/components/PageShell";
import { createSession, listSessions, isHybridMode, toggleHybridMode } from "@/lib/api";
import { setActiveSession } from "@/lib/storage";

function todayBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function HomePage() {
  const nav = useNavigate();
  const [operator, setOperator] = useState("");
  const [date, setDate] = useState(todayBR());
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("06:00");
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    listSessions().then((s) => setRecent(s.slice(0, 3))).catch(() => {});
  }, []);

  async function onStart() {
    if (!operator.trim()) {
      toast.error("Informe o nome do colaborador");
      return;
    }
    setLoading(true);
    try {
      const s = await createSession({
        operator_name: operator.trim(),
        date,
        start_time: start,
        end_time: end,
      });
      setActiveSession(s.id);
      toast.success("Pernoite iniciado");
      nav(`/session/${s.id}`);
    } catch (e) {
      toast.error("Erro ao iniciar pernoite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      title={<><span className="text-primary">VTR</span> NOTURNO</>}
      subtitle="Controle de veículos em pernoite no estacionamento"
    >
      <div className="diagonal-stripes border border-border rounded-md p-5 bg-card">
        <div className="flex items-center gap-3 mb-1">
          <Moon 
            className="h-5 w-5 text-primary cursor-pointer hover:text-yellow-400 transition-colors" 
            strokeWidth={2.5} 
            onClick={() => {
              const novo = toggleHybridMode();
              toast.success(novo ? "Modo Híbrido (Economia) Ativado 🌙" : "Modo 100% IA (Rapidez) Ativado 🚀");
            }}
          />
          <span className="font-heading uppercase tracking-wider text-xs text-muted-foreground">
            Iniciar Turno
          </span>
        </div>
        <p className="text-foreground/90 font-medium text-sm">
          Preencha os dados e comece a escanear os setores.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="operator" className="font-heading uppercase text-xs tracking-wider text-muted-foreground">
            Colaborador
          </Label>
          <Input
            id="operator"
            data-testid="input-colaborador"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="SEU NOME AQUI"
            className="h-14 mt-2 bg-input border-border text-base"
          />
        </div>
        <div>
          <Label htmlFor="date" className="font-heading uppercase text-xs tracking-wider text-muted-foreground">
            Data
          </Label>
          <Input
            id="date"
            data-testid="input-data"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder="DD/MM/AAAA"
            className="h-14 mt-2 bg-input border-border text-base font-mono-plate"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="start" className="font-heading uppercase text-xs tracking-wider text-muted-foreground">
              Entrada
            </Label>
            <Input
              id="start"
              data-testid="input-entrada"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-14 mt-2 bg-input border-border font-mono-plate text-base"
            />
          </div>
          <div>
            <Label htmlFor="end" className="font-heading uppercase text-xs tracking-wider text-muted-foreground">
              Saída
            </Label>
            <Input
              id="end"
              data-testid="input-saida"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-14 mt-2 bg-input border-border font-mono-plate text-base"
            />
          </div>
        </div>
      </div>

      <Button
        data-testid="btn-iniciar-pernoite"
        onClick={onStart}
        disabled={loading}
        className="h-14 mt-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider text-base"
      >
        {loading ? "Iniciando..." : "Iniciar Pernoite"}
      </Button>

      <div className="grid grid-cols-2 gap-3 mt-2">
        <Button
          data-testid="btn-historico"
          variant="outline"
          onClick={() => nav("/history")}
          className="h-12 border-border bg-card hover:bg-secondary text-foreground"
        >
          <HistoryIcon className="h-4 w-4 mr-2" /> Histórico
        </Button>
        <Button
          data-testid="btn-setores"
          variant="outline"
          onClick={() => nav("/sectors")}
          className="h-12 border-border bg-card hover:bg-secondary text-foreground"
        >
          <Settings2 className="h-4 w-4 mr-2" /> Setores
        </Button>
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="font-heading uppercase text-xs tracking-wider text-muted-foreground mb-2">
            Pernoites recentes
          </div>
          <div className="flex flex-col gap-2">
            {recent.map((r) => (
              <button
                key={r.id}
                data-testid={`recent-${r.id}`}
                onClick={() => nav(`/history/${r.id}`)}
                className="flex items-center justify-between p-3 rounded-md border border-border bg-card hover:bg-secondary transition-colors text-left"
              >
                <div>
                  <div className="font-mono-plate text-sm text-primary">{r.date}</div>
                  <div className="text-sm text-foreground/80">{r.operator_name}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
