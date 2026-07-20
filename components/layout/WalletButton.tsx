"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, LogOut, User, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Identicon } from "@/components/stellar/Identicon";
import { truncateKey } from "@/lib/stellar/strkey";

const STORAGE_KEY = "wallet_address";

// Freighter connect. Multi-wallet kit + the account dashboard come later
export function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAddress(localStorage.getItem(STORAGE_KEY));
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const freighter = await import("@stellar/freighter-api");
      const connected = await freighter.isConnected();
      if (!connected.isConnected) {
        window.open("https://www.freighter.app/", "_blank", "noopener");
        return;
      }
      const access = await freighter.requestAccess();
      if (access.address) {
        localStorage.setItem(STORAGE_KEY, access.address);
        setAddress(access.address);
      }
    } catch {
      // user rejected or extension unavailable, nothing to do
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    localStorage.removeItem(STORAGE_KEY);
    setAddress(null);
  }

  if (!address) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
      >
        <Wallet className="size-3.5" aria-hidden="true" />
        {busy ? "Connecting…" : "Connect"}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-surface-2"
          aria-label="Wallet menu"
        >
          <Identicon address={address} size={14} className="rounded-[2px]" />
          <span className="font-mono">{truncateKey(address)}</span>
          <ChevronDown className="size-3 text-dim" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/account/${address}`} className="text-sm">
            <User className="size-3.5" aria-hidden="true" />
            My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={disconnect} className="text-sm">
          <LogOut className="size-3.5" aria-hidden="true" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
