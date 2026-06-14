"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Cpu,
  Fingerprint,
  Flame,
  Radio,
  Server,
  TrendingUp,
  Waves,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types mirroring agent.py's status.json                              */
/* ------------------------------------------------------------------ */
type Signals = {
  nansen_smart_money_flow: number;
  bybit_mnt_funding: number;
  elfa_sentiment: string;
  zai_predictive_spread: string;
  orbit_volatility_regime: string;
  bga_sustainability_index: string;
  animoca_macro_risk: string;
};

type Latest = {
  state: string;
  rationale: string;
  txHash: string | null;
  timestamp: string;
  target_meth_ratio: number;
  current_meth_ratio: number;
  ai_conviction_score: number;
  total_vault_usd: number;
  meth_qty: number;
  usdy_qty: number;
  meth_price: number;
  usdy_price: number;
  signals: Signals;
};

type HistoryPoint = {
  timestamp: string;
  target_meth_ratio?: number;
  current_meth_ratio?: number;
  AI_Conviction_Score: number;
  dominant_signal: string;
  state: string;
};

type LedgerEntry = {
  timestamp: string;
  action: string;
  amount_usd: number;
  rationale: string;
  txHash: string;
};

type Status = { latest: Latest; history: HistoryPoint[]; ledger: LedgerEntry[] };

const EXPLORER = "https://explorer.sepolia.mantle.xyz/tx/";

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */
function Panel({
  title,
  icon,
  children,
  className = "",
  accent = "neon",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: "neon" | "purple";
}) {
  const border =
    accent === "purple" ? "border-cyber-purple/40" : "border-neon/30";
  const glow =
    accent === "purple" ? "shadow-neon-purple" : "shadow-neon";
  return (
    <div
      className={`relative rounded-lg border ${border} bg-panel/80 backdrop-blur-sm ${className}`}
    >
      <div
        className={`flex items-center gap-2 border-b ${border} px-4 py-2 text-xs uppercase tracking-widest text-neutral-400`}
      >
        <span className={accent === "purple" ? "text-cyber-purple" : "text-neon"}>
          {icon}
        </span>
        {title}
      </div>
      <div className="p-4">{children}</div>
      {/* corner accent */}
      <span
        className={`pointer-events-none absolute -right-px -top-px h-3 w-3 border-r border-t ${border} ${glow}`}
      />
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    EXECUTED: {
      label: "EXECUTED",
      cls: "text-neon border-neon/50",
      dot: "bg-neon",
    },
    EXECUTE: { label: "EXECUTED", cls: "text-neon border-neon/50", dot: "bg-neon" },
    SKIPPED_MET: {
      label: "SKIPPED_MET",
      cls: "text-cyber-yellow border-cyber-yellow/50",
      dot: "bg-cyber-yellow",
    },
    SKIPPED_GAS: {
      label: "SKIPPED_GAS",
      cls: "text-cyber-red border-cyber-red/50",
      dot: "bg-cyber-red",
    },
  };
  const m = map[state] ?? map.SKIPPED_MET;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 text-xs ${m.cls}`}
    >
      <span className={`h-2 w-2 rounded-full ${m.dot} animate-flicker`} />
      {m.label}
    </span>
  );
}

const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const short = (h?: string | null) =>
  h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—";
const hhmmss = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("en-GB");
  } catch {
    return iso;
  }
};

/* ================================================================== */
/* MAIN PAGE                                                           */
/* ================================================================== */
export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [whaleBusy, setWhaleBusy] = useState(false);
  const [whaleMsg, setWhaleMsg] = useState<string | null>(null);
  const termRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/status.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) setStatus(await res.json());
    } catch {
      /* keep last good state */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // auto-scroll terminal to bottom on update
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [status]);

  const triggerWhale = async () => {
    setWhaleBusy(true);
    setWhaleMsg(null);
    try {
      const res = await fetch("/api/simulate-whale", { method: "POST" });
      const data = await res.json();
      setWhaleMsg(
        data.ok
          ? `WHALE DEPOSIT CONFIRMED · ${short(data.txHash)}`
          : `ATTACK FAILED · ${data.error}`
      );
      setTimeout(refresh, 1500);
    } catch (e) {
      setWhaleMsg(`ATTACK FAILED · ${String(e)}`);
    } finally {
      setWhaleBusy(false);
    }
  };

  const latest = status?.latest;
  const history = status?.history ?? [];
  const ledger = status?.ledger ?? [];

  const currentPct = Math.round((latest?.current_meth_ratio ?? 0) * 100);
  const targetPct = Math.round((latest?.target_meth_ratio ?? 0) * 100);
  return (
    <main className="relative z-10 mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
      {/* ============================ HEADER ============================ */}
      <header className="mb-5 flex flex-col gap-3 rounded-lg border border-neon/30 bg-panel/80 px-5 py-4 shadow-neon backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neon text-glow sm:text-2xl">
            ChameleonVault{" "}
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Autonomous AI x RWA yield strategy · Mantle Turing Test 2026 ·
            Radical Transparency Mode
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            icon={<Radio size={13} />}
            text="Mantle Testnet"
            dot="bg-neon"
            color="text-neon border-neon/40"
          />
          <Badge
            icon={<Fingerprint size={13} />}
            text="ERC-8004 Identity NFT: Verified"
            color="text-cyber-purple border-cyber-purple/40 shadow-neon-purple"
          />
          <Badge
            icon={<Server size={13} />}
            text="Powered by Tencent Cloud & Byreal"
            color="text-neutral-300 border-neutral-700"
          />

          {/* Hidden Human Whale Attack trigger */}
          <button
            onClick={triggerWhale}
            disabled={whaleBusy}
            title="Human Whale Attack — deposit 500 mETH to force drift"
            className="group  inline-flex items-center gap-1.5 rounded border border-cyber-red/30 bg-cyber-red/5 px-2.5 py-1 text-xs text-cyber-red/70 opacity-40 transition hover:opacity-100 hover:shadow-[0_0_14px_rgba(255,77,77,0.5)] disabled:cursor-not-allowed"
          >
            <Flame size={13} className={whaleBusy ? "animate-flicker" : ""} />
            {whaleBusy ? "ATTACKING…" : "Human Whale Attack"}
          </button>
        </div>
      </header>

      {whaleMsg && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded border border-cyber-red/40 bg-cyber-red/10 px-4 py-2 text-xs text-cyber-red"
        >
          ⚡ {whaleMsg}
        </motion.div>
      )}

      {/* ===================== PORTFOLIO + ALLOCATION (merged) ===================== */}
      <div className="grid grid-cols-1 gap-4">
        <Panel
          title="Portfolio State // Vault Allocation"
          icon={<Waves size={14} />}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: TVL + token breakdown + drift narrative */}
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest text-neutral-500">
                Total Vault TVL
              </div>
              <div className="text-4xl font-bold text-neon text-glow">
                {fmtUSD(latest?.total_vault_usd ?? 0)}
              </div>

              <div className="mt-4 space-y-1 text-xs text-neutral-400">
                <div>
                  mETH:{" "}
                  <span className="text-neutral-200">
                    {(latest?.meth_qty ?? 0).toFixed(4)}
                  </span>{" "}
                  @ {fmtUSD(latest?.meth_price ?? 0)}
                </div>
                <div>
                  USDY:{" "}
                  <span className="text-neutral-200">
                    {(latest?.usdy_qty ?? 0).toLocaleString()}
                  </span>{" "}
                  @ {fmtUSD(latest?.usdy_price ?? 1)}
                </div>
              </div>

              <p className="mt-4 max-w-md text-xs text-neutral-500">
                AI is steering the live allocation toward a{" "}
                <span className="text-cyber-purple">{targetPct}% mETH</span>{" "}
                target (drift{" "}
                <span
                  className={
                    Math.abs(currentPct - targetPct) >= 1
                      ? "text-cyber-yellow"
                      : "text-neon"
                  }
                >
                  {Math.abs(currentPct - targetPct)}%
                </span>
                ). It only rebalances when expected yield &gt; estimated gas.
              </p>
            </div>

            {/* Right: two matching gauges — live current vs AI target */}
            <div className="flex items-center justify-center gap-8">
              <RingGauge pct={currentPct} label="CURRENT (LIVE)" color="#00FF66" />
              <RingGauge pct={targetPct} label="AI TARGET" color="#A855F7" />
            </div>
          </div>
        </Panel>
      </div>

      {/* ===================== MIDDLE: SIGNALS + HISTORY ===================== */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Signals grid */}
        <Panel
          title="AI Neural Matrix // Ecosystem Signals"
          icon={<Cpu size={14} />}
        >
          <div className="grid grid-cols-1 gap-2">
            <SignalRow
              tag="Nansen"
              label="Smart Money Flow"
              value={`${(latest?.signals.nansen_smart_money_flow ?? 0) > 0 ? "+" : ""}${latest?.signals.nansen_smart_money_flow ?? 0}%`}
              good={(latest?.signals.nansen_smart_money_flow ?? 0) >= 0}
            />
            <SignalRow
              tag="Bybit"
              label="MNT Perp Funding"
              value={`${latest?.signals.bybit_mnt_funding ?? 0}%`}
              good={(latest?.signals.bybit_mnt_funding ?? 0) >= 0}
            />
            <SignalRow
              tag="Elfa AI"
              label="Social Sentiment"
              value={latest?.signals.elfa_sentiment ?? "—"}
              good={latest?.signals.elfa_sentiment === "Risk-On"}
            />
            <SignalRow
              tag="Z.ai / Orbit"
              label="Predictive Spread"
              value={`${latest?.signals.zai_predictive_spread ?? "—"} · vol ${latest?.signals.orbit_volatility_regime ?? "—"}`}
              good={latest?.signals.zai_predictive_spread === "Tightening"}
            />
            <SignalRow
              tag="Animoca / BGA"
              label="Macro Risk / Sustainability"
              value={`${latest?.signals.animoca_macro_risk ?? "—"} · ${latest?.signals.bga_sustainability_index ?? "—"}`}
              good={latest?.signals.animoca_macro_risk === "Low"}
            />
          </div>
        </Panel>

        {/* Historical AI target allocation area chart */}
        <Panel
          title="Historical Alpha // AI Target Allocation"
          icon={<TrendingUp size={14} />}
          className="lg:col-span-2"
        >
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history.map((h) => ({
                  time: hhmmss(h.timestamp),
                  target: Math.round((h.target_meth_ratio ?? 0) * 100),
                  current: Math.round((h.current_meth_ratio ?? 0) * 100),
                  signal: h.dominant_signal,
                  state: h.state,
                }))}
                margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="tgt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#A855F7" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  stroke="#52525b"
                  tick={{ fontSize: 10, fontFamily: "monospace" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  stroke="#52525b"
                  tick={{ fontSize: 10, fontFamily: "monospace" }}
                />
                <Tooltip content={<AllocationTooltip />} />
                {/* AI target — primary purple area */}
                <Area
                  type="monotone"
                  dataKey="target"
                  name="AI Target"
                  stroke="#A855F7"
                  strokeWidth={2}
                  fill="url(#tgt)"
                  dot={{ r: 2, fill: "#A855F7" }}
                  activeDot={{ r: 4 }}
                />
                {/* Live current — thin green line chasing the target */}
                <Area
                  type="monotone"
                  dataKey="current"
                  name="Current (live)"
                  stroke="#00FF66"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* ===================== BOTTOM: TERMINAL + LEDGER ===================== */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Agent status terminal */}
        <Panel
          title="Agent Status Terminal"
          icon={<Activity size={14} />}
          className="lg:col-span-1"
        >
          <div
            ref={termRef}
            className="h-[260px] overflow-y-auto rounded bg-black/60 p-3 text-xs leading-relaxed"
          >
            <div className="text-neutral-500">
              &gt; root@byreal-skills:~/chameleon-agent/logs
            </div>
            {history.map((h, i) => (
              <TerminalLine
                key={i}
                state={h.state}
                time={hhmmss(h.timestamp)}
                signal={h.dominant_signal}
                score={h.AI_Conviction_Score}
              />
            ))}
            {/* live latest detail */}
            {latest && (
              <div className="mt-2 border-t border-neutral-800 pt-2">
                <StateBadge state={latest.state} />
                <div className="mt-1 text-neutral-300">{latest.rationale}</div>
                {latest.txHash && (
                  <a
                    href={`${EXPLORER}${latest.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neon underline-offset-2 hover:underline"
                  >
                    tx: {short(latest.txHash)}
                  </a>
                )}
                <span className="ml-1 inline-block h-3 w-2 animate-flicker bg-neon align-middle" />
              </div>
            )}
          </div>
        </Panel>

        {/* On-chain benchmark ledger */}
        <Panel
          title="On-Chain Benchmark Ledger"
          icon={<BadgeCheck size={14} />}
          className="lg:col-span-2"
          accent="purple"
        >
          <div className="max-h-[260px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-panel text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="py-2 pr-2">Time</th>
                  <th className="py-2 pr-2">Action</th>
                  <th className="py-2 pr-2">Amount</th>
                  <th className="py-2 pr-2">AI Rationale</th>
                  <th className="py-2 pr-2">Proof</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-neutral-600">
                      No benchmarked executions yet.
                    </td>
                  </tr>
                )}
                {ledger.map((e, i) => (
                  <tr
                    key={i}
                    className="border-b border-neutral-900 hover:bg-white/5"
                  >
                    <td className="py-2 pr-2 text-neutral-400">
                      {hhmmss(e.timestamp)}
                    </td>
                    <td className="py-2 pr-2 text-neon">{e.action}</td>
                    <td className="py-2 pr-2 text-neutral-300">
                      {fmtUSD(e.amount_usd)}
                    </td>
                    <td className="py-2 pr-2 max-w-[320px] text-neutral-400">
                      {e.rationale}
                    </td>
                    <td className="py-2 pr-2">
                      <a
                        href={`${EXPLORER}${e.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyber-purple underline-offset-2 hover:underline"
                      >
                        {short(e.txHash)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <footer className="mt-6 flex items-center justify-center gap-2 text-[11px] text-neutral-600">
        <AlertTriangle size={12} />
        Demo MVP · mocked DEX/oracle · ERC-8004 gated · not audited · not
        financial advice
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */
function Badge({
  icon,
  text,
  color,
  dot,
}: {
  icon: React.ReactNode;
  text: string;
  color: string;
  dot?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border bg-black/40 px-2.5 py-1 text-xs ${color}`}
    >
      {dot && <span className={`h-2 w-2 rounded-full ${dot} animate-flicker`} />}
      {icon}
      {text}
    </span>
  );
}

function RingGauge({
  pct,
  label,
  color,
}: {
  pct: number;
  label: string;
  color: string;
}) {
  const frac = Math.max(0, Math.min(1, pct / 100));
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - frac);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={r} fill="none" stroke="#1f2937" strokeWidth="12" />
          <motion.circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold"
            style={{ color, textShadow: `0 0 10px ${color}` }}
          >
            {pct}%
          </span>
          <span className="text-[9px] tracking-widest text-neutral-500">
            mETH
          </span>
        </div>
      </div>
      <div
        className="mt-2 text-[10px] font-bold tracking-widest"
        style={{ color }}
      >
        {label}
      </div>
    </div>
  );
}

function SignalRow({
  tag,
  label,
  value,
  good,
}: {
  tag: string;
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded border border-neutral-800 bg-black/30 px-3 py-2">
      <div>
        <span className="rounded bg-neon/10 px-1.5 py-0.5 text-[10px] font-bold text-neon">
          {tag}
        </span>
        <span className="ml-2 text-xs text-neutral-400">{label}</span>
      </div>
      <span
        className={`text-xs font-bold ${good ? "text-neon" : "text-cyber-yellow"}`}
      >
        {value}
      </span>
    </div>
  );
}

function TerminalLine({
  state,
  time,
  signal,
  score,
}: {
  state: string;
  time: string;
  signal: string;
  score: number;
}) {
  const cfg: Record<string, { color: string; icon: string; msg: string }> = {
    EXECUTED: { color: "text-neon", icon: "🟢", msg: "[EXECUTED]" },
    EXECUTE: { color: "text-neon", icon: "🟢", msg: "[EXECUTED]" },
    SKIPPED_MET: {
      color: "text-cyber-yellow",
      icon: "🟡",
      msg: "[SKIPPED_MET] Allocation optimal. Drift < 1%.",
    },
    SKIPPED_GAS: {
      color: "text-cyber-red",
      icon: "🔴",
      msg: "[SKIPPED_GAS] Rebalance blocked. Gas fee > expected yield.",
    },
  };
  const c = cfg[state] ?? cfg.SKIPPED_MET;
  return (
    <div className={`${c.color}`}>
      <span className="text-neutral-600">{time}</span> {c.icon} {c.msg}{" "}
      <span className="text-neutral-500">
        · {signal} · conv {score.toFixed(2)}
      </span>
    </div>
  );
}

function AllocationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { time: string; target: number; current: number; signal: string };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-cyber-purple/40 bg-black/90 px-3 py-2 text-xs shadow-neon-purple">
      <div className="text-neutral-400">{p.time}</div>
      <div className="text-cyber-purple">AI target: {p.target}% mETH</div>
      <div className="text-neon">current: {p.current}% mETH</div>
      <div className="text-neutral-300">signal: {p.signal}</div>
    </div>
  );
}
