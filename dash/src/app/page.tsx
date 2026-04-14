"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const TOKEN_KEY = "virgil_token";
const TOKEN_TTL = 24 * 60 * 60 * 1000;
const REFETCH_INTERVAL = 2 * 60 * 1000;

const ageLabel = (isoString: string) => {
  const secs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
};

const isStale = (isoString: string) => {
  return (Date.now() - new Date(isoString).getTime()) / 1000 > 300;
};

const saveToken = (token: string) => {
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      token,
      expiresAt: Date.now() + TOKEN_TTL,
      lastFetchedAt: Date.now(),
    }),
  );
};

const touchLastFetched = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ ...JSON.parse(raw), lastFetchedAt: Date.now() }),
    );
  } catch {}
};

const loadToken = (): string | null => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

const getLastFetchedAt = (): number | null => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw).lastFetchedAt ?? null;
  } catch {
    return null;
  }
};

const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const Bar = ({ value, colorClass }: { value: number; colorClass: string }) => (
  <div className="flex-1 h-1.5 bg-black/10 rounded-full overflow-hidden">
    <div
      className={`h-full rounded-full ${colorClass}`}
      style={{ width: `${Math.round(value)}%` }}
    />
  </div>
);

type GPU = {
  index: number;
  name: string;
  utilization: number;
  memory_used: number;
  memory_total: number;
  temperature: number;
  free: boolean;
};

type CardTheme = {
  bg: string;
  border: string;
  accent: string;
  bar: string;
  barClass: string;
  dim: string;
  dot: string;
};

const getTheme = (freeCount: number, total: number): CardTheme => {
  const allFree = freeCount === total;
  const someFree = freeCount > 0 && freeCount < total;
  if (allFree)
    return {
      bg: "bg-[#f0f7ee]",
      border: "border-[#C0DD97]",
      accent: "text-[#3B6D11]",
      bar: "bg-[#639922]",
      barClass: "bg-[#639922]",
      dim: "text-[#3B6D11]/60",
      dot: "bg-[#639922]",
    };
  if (someFree)
    return {
      bg: "bg-[#fdf5e6]",
      border: "border-[#FAC775]",
      accent: "text-[#854F0B]",
      bar: "bg-[#BA7517]",
      barClass: "bg-[#BA7517]",
      dim: "text-[#854F0B]/60",
      dot: "bg-[#BA7517]",
    };
  return {
    bg: "bg-[#fdf0ee]",
    border: "border-[#F5C4B3]",
    accent: "text-[#993C1D]",
    bar: "bg-[#D85A30]",
    barClass: "bg-[#D85A30]",
    dim: "text-[#993C1D]/60",
    dot: "bg-[#D85A30]",
  };
};

const GPURow = ({ gpu, theme }: { gpu: GPU; theme: CardTheme }) => {
  const memPct = Math.round((gpu.memory_used / gpu.memory_total) * 100);
  const memGB = (gpu.memory_used / 1024).toFixed(1);
  const totalGB = Math.round(gpu.memory_total / 1024);

  return (
    <div
      className="grid items-center gap-x-3 py-2 border-b border-black/[0.06] last:border-0"
      style={{ gridTemplateColumns: "60px 1fr 90px" }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${gpu.free ? "bg-[#639922]" : theme.dot}`}
        />
        <span className={`text-xs font-mono font-semibold ${theme.accent}`}>
          GPU {gpu.index}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono w-7 ${theme.dim}`}>
            {gpu.utilization}%
          </span>
          <Bar value={gpu.utilization} colorClass={theme.barClass} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono w-7 ${theme.dim}`}>
            {memPct}%
          </span>
          <Bar value={memPct} colorClass={theme.barClass} />
        </div>
      </div>

      <div className="text-right">
        <div className={`text-[10px] font-mono ${theme.dim}`}>
          {memGB}/{totalGB}GB
        </div>
        <div className={`text-[10px] font-mono ${theme.dim}`}>
          {gpu.temperature}°C
        </div>
      </div>
    </div>
  );
};

const MachineCard = ({
  data,
}: {
  data: { gpus: GPU[]; updatedAt: string };
}) => {
  const { gpus, updatedAt } = data;
  const freeCount = gpus.filter((g) => g.free).length;
  const stale = isStale(updatedAt);
  const theme = getTheme(freeCount, gpus.length);

  return (
    <div
      className={`${theme.bg} border-2 ${theme.border} rounded-2xl p-5 font-mono`}
    >
      <div className="flex justify-between items-start mb-0.5">
        <span className={`font-bold text-[17px] ${theme.accent}`}>virgil</span>
        {stale ? (
          <span className="text-[11px] text-[#993C1D] bg-[#fdf0ee] border border-[#F5C4B3] rounded-md px-1.5 py-0.5">
            stale · {ageLabel(updatedAt)}
          </span>
        ) : (
          <span className={`text-[11px] ${theme.dim}`}>
            {ageLabel(updatedAt)}
          </span>
        )}
      </div>

      <div className={`text-xs mb-1 ${theme.dim}`}>
        {gpus.length}× {gpus[0]?.name ?? "H100"} · dept cluster
      </div>

      <div className={`text-[22px] font-bold mt-2.5 mb-1 ${theme.accent}`}>
        {freeCount} / {gpus.length}
        <span className="text-[13px] font-normal ml-1.5">GPUs free</span>
      </div>

      <div className="w-full h-px bg-black/[0.08] my-2.5" />

      {gpus.map((gpu) => (
        <GPURow key={gpu.index} gpu={gpu} theme={theme} />
      ))}
    </div>
  );
};

export default function ComputePage() {
  const [data, setData] = useState<{ gpus: GPU[]; updatedAt: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const tokenRef = useRef("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async (token: string) => {
    if (document.visibilityState !== "visible") return;
    setLoading(true);
    try {
      const res = await fetch("/api/gpus", {
        headers: { "x-access-token": token },
      });
      if (res.status === 401) {
        lock();
        return;
      }
      if (res.status === 404)
        throw new Error("No data yet — is the cron job running?");
      if (!res.ok) throw new Error("Something went wrong.");
      setData(await res.json());
      setError(null);
      touchLastFetched();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(
    (token: string) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => fetch_(token), REFETCH_INTERVAL);
    },
    [fetch_],
  );

  const lock = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearToken();
    setData(null);
    setUnlocked(false);
    setTokenInput("");
    tokenRef.current = "";
  };

  const unlock = async () => {
    const token = tokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gpus", {
        headers: { "x-access-token": token },
      });
      if (res.status === 401) throw new Error("Wrong token.");
      if (res.status === 404)
        throw new Error("No data yet — is the cron job running?");
      if (!res.ok) throw new Error("Something went wrong.");
      setData(await res.json());
      setUnlocked(true);
      saveToken(token);
      startPolling(token);
      touchLastFetched();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = loadToken();
    if (!saved) return;

    tokenRef.current = saved;
    setTokenInput(saved);

    const lastFetchedAt = getLastFetchedAt();
    const elapsed = lastFetchedAt ? Date.now() - lastFetchedAt : Infinity;
    const remaining = REFETCH_INTERVAL - elapsed;

    if (remaining > 0) {
      fetch_(saved).then(() => setUnlocked(true));
      const timeout = setTimeout(() => {
        fetch_(saved);
        startPolling(saved);
      }, remaining);
      return () => {
        clearTimeout(timeout);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      fetch_(saved).then(() => {
        setUnlocked(true);
        startPolling(saved);
      });
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <main className="max-w-lg mx-auto px-4 py-8 font-sans">
      <div className="flex justify-between items-center mb-7">
        {/* <h1 className="text-[22px] font-medium m-0">Compute</h1> */}

        {!unlocked ? (
          <main className="max-w-lg mx-auto px-4 py-8 font-sans flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-[340px]">
              <p className="text-[11px] font-medium tracking-widest text-gray-400 uppercase mb-5">
                Compute
              </p>
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[13px] text-gray-500">
                    Access token
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value);
                      tokenRef.current = e.target.value;
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && tokenInput && unlock()
                    }
                    className="h-9 px-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-[14px] font-mono outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
                  />
                </div>
                <button
                  onClick={unlock}
                  disabled={loading || !tokenInput}
                  className={`h-9 w-full rounded-lg text-[13px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    loading || !tokenInput
                      ? "bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-default"
                      : "bg-black dark:bg-white text-white dark:text-black cursor-pointer hover:bg-gray-800 dark:hover:bg-gray-200"
                  }`}
                >
                  {loading ? "…" : "Unlock"}
                </button>
              </div>
              {error && (
                <p className="text-[12px] text-red-700 bg-red-50 px-3 py-2 rounded-lg mt-3">
                  {error}
                </p>
              )}
              <p className="text-[11px] text-gray-400 text-center mt-4">
                virgil · dept cluster
              </p>
            </div>
          </main>
        ) : (
          <div className="flex items-center gap-3">
            {loading && (
              <span className="text-xs text-gray-400">refreshing…</span>
            )}
            <button
              onClick={lock}
              className="text-xs text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0"
            >
              lock
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-[13px] text-[#A32D2D] bg-[#FCEBEB] px-3 py-2 rounded-lg mb-4">
          {error}
        </p>
      )}

      {data && <MachineCard data={data} />}
    </main>
  );
}
