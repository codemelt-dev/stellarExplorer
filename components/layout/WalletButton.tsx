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
import { getClientNetwork } from "@/lib/stellar/clientConfig";

const STORAGE_KEY = "wallet_address";

let kitReady = false;

// kit is browser-only and heavy, load it on first click
async function loadKit() {
  const [{ StellarWalletsKit, Networks }, freighter, xbull] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit"),
    import("@creit.tech/stellar-wallets-kit/modules/freighter"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
  ]);
  if (!kitReady) {
    StellarWalletsKit.init({
      modules: [new freighter.FreighterModule(), new xbull.xBullModule()],
      network:
        getClientNetwork().id === "mainnet" ? Networks.PUBLIC : Networks.TESTNET,
    });
    kitReady = true;
  }
  return StellarWalletsKit;
}

// wallet connect via Stellar Wallets Kit (Freighter + xBull)
export function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAddress(localStorage.getItem(STORAGE_KEY));
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const kit = await loadKit();
      const { address } = await kit.authModal();
      if (address) {
        localStorage.setItem(STORAGE_KEY, address);
        setAddress(address);
      }
    } catch {
      // user closed the modal or rejected, nothing to do
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    localStorage.removeItem(STORAGE_KEY);
    setAddress(null);
    if (kitReady) {
      const { StellarWalletsKit } = await import(
        "@creit.tech/stellar-wallets-kit"
      );
      StellarWalletsKit.disconnect().catch(() => {});
    }
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
