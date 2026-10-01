import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusPill({ successful, className }: { successful: boolean; className?: string }) {
  const Icon = successful ? CheckCircle2 : XCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        successful ? "border-ok/30 bg-ok/10 text-ok" : "border-fail/30 bg-fail/10 text-fail",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {successful ? "Success" : "Failed"}
    </span>
  );
}
