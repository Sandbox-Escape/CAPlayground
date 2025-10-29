"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isUsingOPFS } from "@/lib/storage";

export function BrowserWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem("browser-warning-dismissed");
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    async function checkSupport() {
      const opfsSupported = await isUsingOPFS();
      setShowWarning(!opfsSupported);
    }

    checkSupport();
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem("browser-warning-dismissed", "true");
    setDismissed(true);
  };

  if (!showWarning || dismissed) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-2xl animate-in fade-in slide-in-from-top-2 duration-300">
      <Alert variant="destructive" className="shadow-lg border-2">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="flex items-center justify-between pr-8">
          Browser Partially Supported
        </AlertTitle>
        <AlertDescription>
          <p className="mb-2">
            Your browser does not support the Origin Private File System (OPFS), so projects are being saved to IndexedDB as a fallback. This may have performance implications.
          </p>
          <p className="mt-2 text-xs">
            For the best experience, we recommend using a browser that supports OPFS, such as the latest version of Chrome, Edge, or Safari (not in private browsing mode).
          </p>
        </AlertDescription>
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Dismiss warning"
        >
          <X className="h-4 w-4" />
        </button>
      </Alert>
    </div>
  );
}