"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iconButton } from "./iconButton";

// unset in local dev and CI: no banner, no outside scripts
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

type Choice = "granted" | "denied";

const STORAGE_KEY = "astrolabe-consent";
// a choice lasts a year, then the banner asks again
const CHOICE_TTL_MS = 365 * 86_400_000;
const TRACKER_COOKIES = ["_ga", "_gid", "_gcl"];

let editing = false;
// holds the choice when storage is blocked (private mode)
let unsaved: Choice | null = null;
let gtmLoaded = false;
const listeners = new Set<() => void>();

function subscribe(change: () => void) {
  listeners.add(change);
  window.addEventListener("storage", change);
  return () => {
    listeners.delete(change);
    window.removeEventListener("storage", change);
  };
}

function notify() {
  for (const change of listeners) change();
}

function storedChoice(): Choice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
      choice?: unknown;
      at?: number;
    } | null;
    if (saved?.choice !== "granted" && saved?.choice !== "denied") return null;
    return Date.now() - (saved.at ?? 0) < CHOICE_TTL_MS ? saved.choice : null;
  } catch {
    return null;
  }
}

const readChoice = () => unsaved ?? storedChoice();

function choose(choice: Choice) {
  const withdrawn = choice === "denied" && readChoice() === "granted";
  unsaved = choice;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: Date.now() }));
  } catch {
    // kept in memory for this page load only
  }
  editing = false;
  notify();
  if (withdrawn) {
    clearTrackerCookies();
    // GTM can't be unloaded, a fresh page runs without it
    location.reload();
  }
}

function openConsent() {
  editing = true;
  notify();
}

function clearTrackerCookies() {
  const parts = location.hostname.split(".");
  const domains = parts.map((_, i) => parts.slice(i).join("."));
  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0];
    if (!TRACKER_COOKIES.some((prefix) => name.startsWith(prefix))) continue;
    document.cookie = `${name}=; max-age=0; path=/`;
    for (const domain of domains) {
      document.cookie = `${name}=; max-age=0; path=/; domain=${domain}`;
    }
  }
}

// GTM reads consent commands only as an arguments object, the way Google's gtag() pushes them
const gtag: (...args: unknown[]) => void = function () {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
};

function loadGtm(id: string) {
  if (gtmLoaded) return;
  gtmLoaded = true;
  window.dataLayer ??= [];
  // only analytics was asked for, ad storage stays off
  gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

export function Consent() {
  if (!GTM_ID) return null;
  return <ConsentBanner gtmId={GTM_ID} />;
}

// nothing from Google loads until the visitor accepts. Shown worldwide, built to EU opt-in rules
function ConsentBanner({ gtmId }: { gtmId: string }) {
  const choice = useSyncExternalStore<Choice | null | "pending">(
    subscribe,
    readChoice,
    () => "pending",
  );
  const open = useSyncExternalStore(subscribe, () => editing, () => false);

  useEffect(() => {
    if (choice === "granted") loadGtm(gtmId);
  }, [choice, gtmId]);

  if (choice === "pending" || (choice && !open)) return null;

  return (
    <section aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">
            {choice ? "Cookie settings" : "We use cookies"}
          </p>
          <p className="text-dim">
            We use cookies to analyze site traffic and improve your experience. Accept to allow
            analytics cookies, or reject to continue without them.
            {choice && ` Analytics cookies are currently ${choice === "granted" ? "on" : "off"}.`}{" "}
            <Link href="/privacy" className="text-gold underline-offset-4 hover:underline">
              Privacy policy
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => choose("denied")}>
            Reject
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => choose("granted")}>
            Accept
          </Button>
        </div>
      </div>
    </section>
  );
}

// reopens the banner so a visitor can change or withdraw consent
export function CookieSettings() {
  if (!GTM_ID) return null;
  return (
    <button
      type="button"
      onClick={openConsent}
      aria-label="Cookie settings"
      title="Cookie settings"
      className={iconButton}
    >
      <Cookie className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function ConsentButton() {
  if (!GTM_ID) return null;
  return (
    <Button variant="outline" size="sm" className="self-start" onClick={openConsent}>
      Change cookie settings
    </Button>
  );
}
