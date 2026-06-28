import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Loader2, Clock } from "lucide-react";
import { cn } from "../lib/core/utils";

type ConnectionState = "connected" | "offline" | "reconnecting" | "replaying";

export function useConnectionState() {
  const [state, setState] = useState<ConnectionState>("connected");
  const [lastSynced, setLastSynced] = useState<Date>(new Date());

  useEffect(() => {
    function handleOnline() {
      setState("reconnecting");
      setTimeout(() => {
        setState("replaying");
        setTimeout(() => {
          setState("connected");
          setLastSynced(new Date());
        }, 1000);
      }, 500);
    }
    function handleOffline() {
      setState("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setState(navigator.onLine ? "connected" : "offline");

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { state, lastSynced };
}

const config: Record<ConnectionState, {
  bg: string;
  text: string;
  icon: React.ElementType;
  label: string;
  anim: string;
}> = {
  connected: {
    bg: "bg-green-600 dark:bg-green-700", text: "text-white",
    icon: Wifi, label: "Connected", anim: "",
  },
  offline: {
    bg: "bg-red-600 dark:bg-red-700", text: "text-white",
    icon: WifiOff, label: "Offline — changes queued locally", anim: "",
  },
  reconnecting: {
    bg: "bg-yellow-600 dark:bg-yellow-700", text: "text-white",
    icon: RefreshCw, label: "Reconnecting...", anim: "animate-spin",
  },
  replaying: {
    bg: "bg-blue-600 dark:bg-blue-700", text: "text-white",
    icon: Loader2, label: "Syncing missed events...", anim: "animate-spin",
  },
};

interface OfflineBannerProps {
  state: ConnectionState;
  lastSynced: Date;
}

export function OfflineBanner({ state, lastSynced }: OfflineBannerProps) {
  if (state === "connected") return null;

  const cfg = config[state];
  const Icon = cfg.icon;

  return (
    <div className={cn("flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium", cfg.bg, cfg.text)}>
      <Icon className={cn("h-4 w-4", cfg.anim)} />
      <span>{cfg.label}</span>
      {state === "replaying" && (
        <span className="opacity-80">(replay in progress)</span>
      )}
      {state === "offline" && (
        <span className="flex items-center gap-1 ml-2 text-xs opacity-80">
          <Clock className="h-3 w-3" />
          Last synced: {lastSynced.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
