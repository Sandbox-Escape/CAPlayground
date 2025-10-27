"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function BrowserWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem("browser-warning-dismissed");
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const isPartiallySupported = detectPartialSupport();
    setShowWarning(isPartiallySupported);
  }, []);

  const detectPartialSupport = (): boolean => {
    const ua = navigator.userAgent.toLowerCase();
    
    const isOldSafari = /safari/.test(ua) && !/chrome/.test(ua) && !/crios/.test(ua) && !/fxios/.test(ua);
    const isFirefox = /firefox/.test(ua);
    const isOldEdge = /edge\//.test(ua);
    const isIE = /trident/.test(ua) || /msie/.test(ua);
    
    const isMobileSafari = /iphone|ipad|ipod/.test(ua) && /safari/.test(ua);
    const isAndroidBrowser = /android/.test(ua) && !/chrome/.test(ua);
    
    return isOldSafari || isFirefox || isOldEdge || isIE || isAndroidBrowser;
  };

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
            Your browser may have limited compatibility with this editor. You might experience issues with:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Rendering certain visual effects</li>
            <li>Saving projects or assets</li>
            <li>Performance and responsiveness</li>
          </ul>
          <p className="mt-2 text-xs">
            For the best experience, we recommend using the latest version of Chrome, Edge, or Safari. If you are, it might be because you are on Incognito or Private browsing mode.
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
