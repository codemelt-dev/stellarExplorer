import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

// never show a blank panel
export function EmptyState({
  message,
  icon: Icon = Inbox,
  action,
  className,
}: {
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-10 text-center",
        className,
      )}
    >
      <Icon className="size-5 text-dim" aria-hidden="true" />
      <p className="max-w-sm text-sm text-dim">{message}</p>
      {action}
    </div>
  );
}
