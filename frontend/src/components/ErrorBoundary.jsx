import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center p-6 my-4 rounded-lg border border-destructive/30 bg-destructive/10 text-center max-w-md mx-auto">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h3 className="text-lg font-bold mb-2">Ops! Ocorreu um erro nesta seção</h3>
          <p className="text-sm text-muted-foreground mb-4">
            O navegador encontrou um problema ao renderizar este elemento (possível conflito de carregamento).
          </p>
          <Button onClick={this.handleReset} variant="outline" className="h-9 border-destructive/50 hover:bg-destructive/20">
            Tentar Recarregar
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
