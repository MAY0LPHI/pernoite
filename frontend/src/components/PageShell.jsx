import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PageShell({ title, subtitle, back, children, right }) {
  return (
    <div className="w-full max-w-md mx-auto px-4 sm:px-6 pt-6 pb-32 min-h-screen flex flex-col">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {back && (
            <Link
              to={back}
              data-testid="btn-back"
              className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-primary" strokeWidth={2.5} />
            </Link>
          )}
          <div className="flex-1">
            <h1 className="font-heading text-3xl sm:text-4xl uppercase tracking-tight font-bold text-foreground leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm text-muted-foreground font-medium">{subtitle}</p>
            )}
          </div>
        </div>
        {right}
      </header>
      <div className="flex-1 flex flex-col gap-4">{children}</div>
    </div>
  );
}
