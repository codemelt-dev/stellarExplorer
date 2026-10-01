"use client";

import Link from "next/link";
import { ArrowLeftRight, Blocks, ChevronDown, Droplets, FileCode2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePointerMenu } from "./usePointerMenu";

const ITEMS = [
  { href: "/ledgers", label: "Ledgers", hint: "Latest closed ledgers", icon: Blocks },
  { href: "/transactions", label: "Transactions", hint: "Recent network activity", icon: ArrowLeftRight },
  { href: "/contracts", label: "Contracts", hint: "Soroban smart contracts", icon: FileCode2 },
  { href: "/liquidity-pools", label: "Liquidity pools", hint: "AMM pools and reserves", icon: Droplets },
];

// chain data lists grouped under one nav item
export function BlockchainMenu({ triggerClassName }: { triggerClassName: string }) {
  const menu = usePointerMenu();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" {...menu.trigger} className={`${triggerClassName} inline-flex items-center gap-1 data-[state=open]:bg-surface-2 data-[state=open]:text-foreground`}>
          Blockchain
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent {...menu.content} align="start" sideOffset={8} className="w-60 p-1.5">
        {ITEMS.map(({ href, label, hint, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild className="gap-2.5 px-2.5 py-2">
            <Link href={href}>
              <Icon className="size-4 text-dim" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">{label}</span>
                <span className="truncate text-xs text-dim">{hint}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
