"use client";

import { useState } from "react";
import { Activity, Coins, FileCode2, Layers, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/stats/StatTile";
import { Segmented } from "@/components/layout/Segmented";
import { DailyBars, dayLabel, type BarSeries } from "./DailyBars";
import { CONTRACT_TYPES } from "@/lib/stellar/opFilters";
import type { NetworkDay } from "@/lib/stellar/analytics";
import { compactNumber, percentGap } from "@/lib/format";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const GOLD = "var(--gold)";
const VIOLET = "var(--contract)";
const RED = "var(--fail)";
const CLASSIC: BarSeries = { label: "Classic", color: GOLD };
const SOROBAN: BarSeries = { label: "Soroban", color: VIOLET };

const count = (n: number) => compactNumber(Math.round(n));
const lumens = (n: number) => `${compactNumber(Math.round(n))} XLM`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const typeName = (type: string) => {
  const words = type.replace(/_/g, " ");
  return words[0].toUpperCase() + words.slice(1);
};

// every day from the first to the last, a missing one as null
function calendar(days: NetworkDay[]): Array<{ day: string; data: NetworkDay | null }> {
  if (!days.length) return [];
  const byDay = new Map(days.map((d) => [d.day, d]));
  const out: Array<{ day: string; data: NetworkDay | null }> = [];
  for (let t = Date.parse(days[0].day); t <= Date.parse(days[days.length - 1].day); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, data: byDay.get(day) ?? null });
  }
  return out;
}

export function AnalyticsBoard({ days }: { days: NetworkDay[] }) {
  const [range, setRange] = useState<Range>(30);
  const shown = calendar(days).slice(-range);
  const keys = shown.map((d) => d.day);
  const series = (...pick: Array<(d: NetworkDay) => number | null>) =>
    shown.map(({ data }) => pick.map((p) => (data ? p(data) : null)));

  const latest = days[days.length - 1];
  const before = days.slice(-8, -1);
  const versus = (value: (d: NetworkDay) => number) => {
    const average = before.reduce((s, d) => s + value(d), 0) / before.length;
    return before.length && average > 0 ? `${percentGap(value(latest), average)} vs 7-day average` : undefined;
  };

  const charts: Array<{ title: string; info: string; series: BarSeries[]; values: Array<Array<number | null>>; format: (n: number) => string }> = [
    {
      title: "Transactions",
      info: "Every transaction in a ledger, failed ones included. Soroban ones call a contract.",
      series: [CLASSIC, SOROBAN],
      values: series((d) => d.transactions - d.soroban, (d) => d.soroban),
      format: count,
    },
    {
      title: "Failed transactions",
      info: "The share of transactions that failed but still paid their fee.",
      series: [{ label: "Failed", color: RED }],
      values: series((d) => (d.transactions ? (d.failed / d.transactions) * 100 : 0)),
      format: pct,
    },
    {
      title: "Operations",
      info: "Operations in every transaction, failed ones included.",
      series: [{ label: "Operations", color: GOLD }],
      values: series((d) => d.operations),
      format: count,
    },
    {
      title: "Active accounts",
      info: "Distinct accounts that sent a transaction that day.",
      series: [{ label: "Active accounts", color: GOLD }],
      values: series((d) => d.activeAccounts),
      format: count,
    },
    {
      title: "New accounts",
      info: "Accounts created that day, by successful create account operations.",
      series: [{ label: "New accounts", color: GOLD }],
      values: series((d) => d.newAccounts),
      format: count,
    },
    {
      title: "Fees",
      info: "What transactions paid in fees, in XLM. Soroban fees include the resources a contract call used.",
      series: [CLASSIC, SOROBAN],
      values: series(
        (d) => (d.sorobanFees === null ? d.fees : d.fees - d.sorobanFees),
        (d) => d.sorobanFees,
      ),
      format: lumens,
    },
    {
      title: "Contract calls",
      info: "Soroban contract invocations.",
      series: [{ label: "Contract calls", color: VIOLET }],
      values: series((d) => d.contractCalls),
      format: count,
    },
    {
      title: "New contracts",
      info: "Contracts deployed that day, Stellar asset contracts included.",
      series: [{ label: "New contracts", color: VIOLET }],
      values: series((d) => d.newContracts),
      format: count,
    },
    {
      title: "Token transfers",
      info: "Payments, trades and contract transfers of any asset, as unified token events. Fees left out.",
      series: [{ label: "Token transfers", color: GOLD }],
      values: series((d) => d.tokenTransfers),
      format: count,
    },
  ];

  // operations by type over the range, biggest first, the tail as one row
  const byType = new Map<string, number>();
  for (const { data } of shown) {
    for (const [type, n] of Object.entries(data?.operationsByType ?? {})) byType.set(type, (byType.get(type) ?? 0) + n);
  }
  const types = [...byType].sort((x, y) => y[1] - x[1]);
  const allOps = types.reduce((s, [, n]) => s + n, 0);
  const topTypes = types.slice(0, 12);
  const rest = types.slice(12).reduce((s, [, n]) => s + n, 0);

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Latest full day" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {dayLabel(latest.day)}
          <span className="ml-2 text-sm font-normal text-dim">latest full day</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Transactions" icon={Activity} value={count(latest.transactions)} caption={versus((d) => d.transactions)} />
          <StatTile label="Operations" icon={Layers} value={count(latest.operations)} caption={versus((d) => d.operations)} />
          <StatTile
            label="Active accounts"
            info="Distinct accounts that sent a transaction that day."
            icon={Users}
            value={count(latest.activeAccounts)}
            caption={versus((d) => d.activeAccounts)}
          />
          <StatTile label="New accounts" icon={UserPlus} value={count(latest.newAccounts)} caption={versus((d) => d.newAccounts)} />
          <StatTile label="Fees" icon={Coins} value={lumens(latest.fees)} caption={versus((d) => d.fees)} />
          <StatTile label="Contract calls" icon={FileCode2} value={count(latest.contractCalls)} caption={versus((d) => d.contractCalls)} />
        </div>
      </section>

      <section aria-label="Daily history" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Per day</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-dim">
              {dayLabel(keys[0])} to {dayLabel(keys[keys.length - 1])}
            </span>
            <Segmented
              label="Range"
              options={RANGES.map((d) => ({ id: String(d), label: `${d}D` }))}
              value={String(range)}
              onChange={(v) => setRange(Number(v) as Range)}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {charts.map((c) => {
            const last = c.values[c.values.length - 1];
            return (
              <Card key={c.title} className="tile gap-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    {c.title}
                  </h3>
                  {last.some((v) => v !== null) && (
                    <span className="font-mono text-sm text-dim">
                      {c.format(last.reduce<number>((s, v) => s + (v ?? 0), 0))}
                    </span>
                  )}
                </div>
                <DailyBars days={keys} series={c.series} values={c.values} format={c.format} label={c.title} />
                <p className="text-xs text-dim">{c.info}</p>
              </Card>
            );
          })}
          <Card className="tile gap-3 p-5">
            <h3 className="text-base font-semibold">Operations by type</h3>
            <ul className="flex flex-col gap-1.5">
              {[...topTypes, ...(rest ? ([[`${types.length - 12} other types`, rest]] as Array<[string, number]>) : [])].map(
                ([type, n]) => {
                  const contract = CONTRACT_TYPES.has(type);
                  return (
                    <li key={type} className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] items-center gap-x-3 text-sm">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate">{byType.has(type) ? typeName(type) : type}</span>
                        <span className="h-1 rounded-full bg-surface-2" aria-hidden="true">
                          <span
                            className="block h-1 rounded-full"
                            style={{ width: `${(n / allOps) * 100}%`, background: contract ? VIOLET : GOLD }}
                          />
                        </span>
                      </span>
                      <span className="text-right font-mono text-dim tabular-nums">{count(n)}</span>
                      <span className="text-right font-mono tabular-nums">{pct((n / allOps) * 100)}</span>
                    </li>
                  );
                },
              )}
            </ul>
          </Card>
        </div>
      </section>

      <details className="group rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer rounded-lg px-5 py-3 text-sm font-medium">Daily numbers</summary>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead className="bg-table-head text-xs uppercase tracking-wider text-dim">
              <tr className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-right [&_th]:font-medium [&_th]:whitespace-nowrap">
                <th className="!text-left">Day</th>
                <th>Transactions</th>
                <th>Failed</th>
                <th>Soroban</th>
                <th>Operations</th>
                <th>Active accounts</th>
                <th>New accounts</th>
                <th>Fees, XLM</th>
                <th>Contract calls</th>
                <th>New contracts</th>
                <th>Token transfers</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {[...shown].reverse().map(({ day, data }) => (
                <tr key={day} className="border-t border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-right [&_td]:whitespace-nowrap">
                  <td className="!text-left text-dim">{day}</td>
                  {data ? (
                    [
                      data.transactions,
                      data.failed,
                      data.soroban,
                      data.operations,
                      data.activeAccounts,
                      data.newAccounts,
                      Math.round(data.fees),
                      data.contractCalls,
                      data.newContracts,
                      data.tokenTransfers,
                    ].map((n, i) => <td key={i}>{n.toLocaleString("en-US")}</td>)
                  ) : (
                    <td colSpan={10} className="!text-left text-dim">
                      not indexed
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
