import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageShell from "@/components/PageShell";
import { listSectors, createSector, deleteSector } from "@/lib/api";

export default function SectorsManagePage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");

  const load = () => listSectors().then(setItems).catch(() => toast.error("Erro"));
  useEffect(() => { load(); }, []);

  async function onAdd() {
    if (!name.trim()) {
      toast.error("Informe o nome do setor");
      return;
    }
    try {
      await createSector(name.trim());
      setName("");
      load();
      toast.success("Setor adicionado");
    } catch { toast.error("Erro ao adicionar"); }
  }

  async function onDelete(id) {
    if (!confirm("Remover este setor?")) return;
    try {
      await deleteSector(id);
      load();
      toast.success("Removido");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro");
    }
  }

  return (
    <PageShell title="Setores" subtitle="Gerenciar setores do estacionamento" back="/">
      <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3">
        <div className="font-heading uppercase text-xs tracking-wider text-muted-foreground">
          Novo setor
        </div>
        <div className="flex gap-2">
          <Input
            data-testid="input-novo-setor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: SETOR ROSA"
            className="h-12 bg-input border-border"
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <Button
            data-testid="btn-add-setor"
            onClick={onAdd}
            className="h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <div
            key={s.id}
            data-testid={`setor-row-${s.id}`}
            className="flex items-center gap-3 p-3 rounded-md border border-border bg-card"
          >
            <div className="flex-1 min-w-0">
              <div className="font-heading uppercase text-sm font-medium leading-tight text-foreground break-words">
                {s.name}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                {s.is_default ? "Padrão" : "Personalizado"}
              </div>
            </div>
            {s.is_default ? (
              <Lock className="h-4 w-4 text-muted-foreground" />
            ) : (
              <button
                data-testid={`btn-del-setor-${s.id}`}
                onClick={() => onDelete(s.id)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
