"use client";

import Link from "next/link";
import { ChevronDown, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePointerMenu } from "./usePointerMenu";
import { ProtocolIcon } from "@/components/defi/ProtocolIcon";
import { PROTOCOLS, protocolLogo } from "@/lib/stellar/protocols";

// protocol grid under the DeFi nav item, each opens its protocol page
export function DefiMenu({
  triggerClassName,
  label = "DeFi",
  align = "start",
}: {
  triggerClassName: string;
  label?: React.ReactNode;
  align?: "start" | "end";
}) {
  const menu = usePointerMenu();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" {...menu.trigger} className={`${triggerClassName} inline-flex items-center gap-1 data-[state=open]:bg-surface-2 data-[state=open]:text-foreground`}>
          {label}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent {...menu.content} align={align} sideOffset={8} className="w-[min(26rem,calc(100vw-2rem))] p-2">
        <div className="grid grid-cols-2 gap-1">
          {PROTOCOLS.map((p) => (
            <DropdownMenuItem key={p.slug} asChild className="gap-2.5 px-2.5 py-2">
              <Link href={`/defi/${p.slug}`}>
                <ProtocolIcon logo={protocolLogo(p.slug)} name={p.name} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{p.name}</span>
                  <span className="truncate text-xs text-dim">{p.kind}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem asChild className="gap-2 px-2.5 py-2 text-sm text-dim">
          <Link href="/#defi">
            <LayoutGrid className="size-4" aria-hidden="true" />
            DeFi overview
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
