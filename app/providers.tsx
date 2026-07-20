"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LedgerStreamProvider } from "@/components/live/LedgerStreamProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Public Horizon is rate-limited: cache aggressively, no focus refetch.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (
                error instanceof Error &&
                "status" in error &&
                (error as { status?: number }).status === 429
              ) {
                return failureCount < 1;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <LedgerStreamProvider>{children}</LedgerStreamProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
