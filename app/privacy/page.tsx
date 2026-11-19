import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listHeadClass } from "@/components/layout/listTable";
import { ConsentButton } from "@/components/layout/Consent";

export const metadata: Metadata = { title: "Privacy · Stellar Explorer" };

const OPERATOR = "Codemelt";
const CONTACT_EMAIL = "contact@codemelt.com";
// keep in sync with GA4 Admin > Data retention
const ANALYTICS_RETENTION = "14 months";
const UPDATED = "9 November 2026";

const link = "text-gold underline-offset-4 hover:underline";

type Stored = { name: string; what: string; kept: string };

const ANALYTICS_COOKIES: Stored[] = [
  { name: "_ga", what: "Tells one visitor's visits apart, with a random ID", kept: "2 years" },
  { name: "_ga_*", what: "Keeps the current visit together", kept: "2 years" },
];

const ESSENTIAL: Stored[] = [
  { name: "astrolabe-consent", what: "Your analytics choice, so we don't ask on every page", kept: "1 year" },
  { name: "network", what: "Mainnet or testnet, when you switch networks (cookie)", kept: "1 year" },
  { name: "theme", what: "Light or dark mode", kept: "Until you clear site data" },
  {
    name: "wallet_address, @StellarWalletsKit/*",
    what: "Your public address and wallet app, only after you connect a wallet",
    kept: "Until you disconnect or clear site data",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Privacy</h1>
        <p className="text-sm text-dim">
          Astrolabe is a public explorer for the Stellar network. There are no accounts and no
          sign-up. This page says what we collect, why, and how to turn it off.
        </p>
        <p className="text-xs text-dim">Last updated {UPDATED}</p>
      </div>

      <Section title="Who runs Astrolabe">
        <p>
          {OPERATOR} runs this site and is responsible for the data described here. Write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>{" "}
          with any question or request about your data.
        </p>
      </Section>

      <Section title="Analytics, only if you allow it">
        <p>
          With your permission we use Google Analytics, loaded through Google Tag Manager, to count
          visits and see which pages people use. Until you click Accept on the cookie banner,
          neither is loaded and nothing is sent to Google.
        </p>
        <p>
          When it&apos;s on, Google records the pages you open, the site that sent you, your browser
          and device type, and an approximate location worked out from your IP address. Google
          Analytics doesn&apos;t store the IP address itself. We don&apos;t use it for ads or
          link it to a wallet address.
        </p>
        <p>
          The legal basis is your consent. Google LLC processes the data for us and may handle it in
          the United States, under the EU-US Data Privacy Framework. Reports are kept for{" "}
          {ANALYTICS_RETENTION}.
        </p>
        <StoredTable rows={ANALYTICS_COOKIES} />
        <p>
          You can change your mind at any time with the cookie button at the top of every page.
          Turning analytics off deletes these cookies.
        </p>
        <ConsentButton />
      </Section>

      <Section title="Stored in your browser without asking">
        <p>
          These keep features you asked for working. They stay on your device, aren&apos;t used to
          track you, and don&apos;t need consent.
        </p>
        <StoredTable rows={ESSENTIAL} />
      </Section>

      <Section title="Other services your browser contacts">
        <p>
          Some data loads straight from other services. Like any website, they see your IP address
          and browser, and their own privacy policies apply.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Stellar Horizon (<span className="font-mono">horizon.stellar.org</span>), run by the
            Stellar Development Foundation, for the live ledger and operations feeds.
          </li>
          <li>Asset issuers&apos; websites, for token icons they publish.</li>
          <li>
            DefiLlama (<span className="font-mono">icons.llamao.fi</span>), for protocol logos on
            the DeFi pages.
          </li>
          <li>Your wallet app, such as Freighter or xBull, when you connect it.</li>
        </ul>
      </Section>

      <Section title="Server logs">
        <p>
          Our hosting provider records each request, with its IP address, time, page and browser, to
          run the site and keep it secure. Addresses and hashes you look up are part of the page
          address, so they appear there too. These logs are kept for a short time and aren&apos;t
          used to profile anyone. The legal basis is our legitimate interest in a working, secure
          site.
        </p>
      </Section>

      <Section title="Public blockchain data">
        <p>
          Everything the explorer shows comes from the public Stellar ledger. Anyone can read it, and
          we can&apos;t change or delete it.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask to see, correct or delete the data we hold about you, to limit or object to its
          use, and to get a copy of it. You can withdraw consent at any time, without affecting what
          happened before. Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>
          . You can also complain to a data protection authority, usually the one where you live.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this page changes, the date at the top changes with it.{" "}
          <Link href="/" className={link}>
            Back to the explorer
          </Link>
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Card className="flex flex-col gap-3 p-5 text-sm text-dim">{children}</Card>
    </section>
  );
}

function StoredTable({ rows }: { rows: Stored[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <Table>
        <TableHeader className={listHeadClass}>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>What it does</TableHead>
            <TableHead>Kept for</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="font-mono text-xs text-foreground">{row.name}</TableCell>
              <TableCell className="whitespace-normal">{row.what}</TableCell>
              <TableCell className="whitespace-nowrap">{row.kept}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
