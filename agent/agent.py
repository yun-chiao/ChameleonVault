#!/usr/bin/env python3
"""
ChameleonVault — Autonomous AI Rebalancing Agent
=================================================
Mantle Turing Test Hackathon 2026 · Phase 2: AI Awakening · Track: AI x RWA

This agent is the brain of ChameleonVault. It runs on a fixed cadence
(assumed to be orchestrated by the "Byreal Skills CLI" / OpenClaw infra) and:

  1. Reads on-chain vault state (mETH / USDY balances) + oracle prices.
  2. Mocks a grid of ecosystem signals from hackathon partners
     (Nansen, Bybit, Elfa AI, Z.ai/Orbit, Animoca/BGA).
  3. Performs REAL LLM inference (OpenAI) to decide a Target_mETH_Ratio,
     a human-readable rationale, and an AI conviction score.
  4. Runs a drift + gas-vs-yield profitability check.
  5. If profitable, sends ChameleonVault.rebalance() on-chain and records the
     rationale as a permanent on-chain benchmark.
  6. Writes a `status.json` snapshot (latest + 20-tick history) consumed by the
     cyberpunk frontend dashboard.

Design philosophy: no TWAP, no slippage math, no fee compounding. Just a clean,
transparent AI decision loop with gas-aware profitability gating.
"""

import json
import os
import random
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

# OpenAI SDK (>=1.0 style client).
try:
    from openai import OpenAI
except Exception:  # pragma: no cover - allows dry runs without the package
    OpenAI = None

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration (env-driven so the same file runs locally + on Byreal infra)
# ---------------------------------------------------------------------------
RPC_URL = os.getenv("MANTLE_RPC_URL", "https://rpc.sepolia.mantle.xyz")
PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY", "")
VAULT_ADDRESS = os.getenv("VAULT_ADDRESS", "")
METH_ADDRESS = os.getenv("METH_ADDRESS", "")
USDY_ADDRESS = os.getenv("USDY_ADDRESS", "")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
# Optional: point the OpenAI client at an OpenAI-compatible endpoint.
# For Google Gemini, set:
#   OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
#   OPENAI_API_KEY=<your Gemini API key>
#   OPENAI_MODEL=gemini-2.5-flash
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")

LOOP_INTERVAL_SECONDS = int(os.getenv("LOOP_INTERVAL_SECONDS", "180"))

# Where the frontend reads agent state from. Defaults to the Next.js public dir.
STATUS_PATH = Path(
    os.getenv("STATUS_JSON_PATH", "../frontend/public/status.json")
).resolve()

# --- Demo constants -------------------------------------------------------
DEFAULT_METH_PRICE = 1783.42        # oracle fallback price
DEFAULT_USDY_PRICE = 1.00           # oracle fallback price
STALE_AFTER_SECONDS = 3600          # oracle staleness threshold
ESTIMATED_GAS_USD = float(os.getenv("ESTIMATED_GAS_USD", "0.05"))  # mocked gas cost per rebalance (Mantle L2 is cheap)
DRIFT_THRESHOLD = 0.01              # 1% — below this we skip (SKIPPED_MET)
ANNUAL_YIELD_SPREAD = 0.04          # assumed 4% APY edge captured by rebalancing
HISTORY_LEN = 20                    # keep the last N ticks

# ---------------------------------------------------------------------------
# Minimal ABIs (only what we touch)
# ---------------------------------------------------------------------------
VAULT_ABI = json.loads(
    """
[
  {"type":"function","name":"getVaultState","stateMutability":"view","inputs":[],
   "outputs":[{"name":"methQty","type":"uint256"},{"name":"usdyQty","type":"uint256"},
              {"name":"methPrice","type":"uint256"},{"name":"usdyPrice","type":"uint256"}]},
  {"type":"function","name":"rebalance","stateMutability":"nonpayable",
   "inputs":[{"name":"tokenFrom","type":"address"},{"name":"tokenTo","type":"address"},
             {"name":"amountIn","type":"uint256"},{"name":"rationale","type":"string"}],
   "outputs":[]}
]
"""
)

# ---------------------------------------------------------------------------
# Web3 wiring
# ---------------------------------------------------------------------------
w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = w3.eth.account.from_key(PRIVATE_KEY) if PRIVATE_KEY else None
vault = (
    w3.eth.contract(address=Web3.to_checksum_address(VAULT_ADDRESS), abi=VAULT_ABI)
    if VAULT_ADDRESS
    else None
)

def _build_llm_client():
    """OpenAI-compatible client. If OPENAI_BASE_URL is set (e.g. Gemini's
    OpenAI-compatible endpoint), route requests there; otherwise use OpenAI."""
    if not (OpenAI and OPENAI_API_KEY):
        return None
    if OPENAI_BASE_URL:
        return OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
    return OpenAI(api_key=OPENAI_API_KEY)


openai_client = _build_llm_client()


# ===========================================================================
# 1. STATE & ORACLE FETCH
# ===========================================================================
def fetch_vault_state():
    """Read balances + oracle prices on-chain, with a safe demo fallback.

    Returns a dict with mETH_qty, USDY_qty, meth_price, usdy_price,
    total_vault_usd, current_meth_ratio.
    """
    meth_qty, usdy_qty = 0.0, 0.0
    meth_price, usdy_price = DEFAULT_METH_PRICE, DEFAULT_USDY_PRICE

    try:
        meth_raw, usdy_raw, meth_px_raw, usdy_px_raw = vault.functions.getVaultState().call()
        # Token balances are 18-decimals; oracle prices are 1e8.
        meth_qty = meth_raw / 1e18
        usdy_qty = usdy_raw / 1e18
        oracle_meth = meth_px_raw / 1e8
        oracle_usdy = usdy_px_raw / 1e8

        # Guard against a zeroed / stale oracle — fall back to demo prices.
        if oracle_meth > 0 and oracle_usdy > 0:
            meth_price, usdy_price = oracle_meth, oracle_usdy
        else:
            print("[oracle] zero price -> using fallback demo prices")
    except Exception as exc:  # network error / not deployed yet
        print(f"[oracle] read failed ({exc}); using fallback demo state")
        # Provide a plausible demo vault so the dashboard is never empty.
        meth_qty, usdy_qty = 10.0, 20000.0

    meth_usd = meth_qty * meth_price
    usdy_usd = usdy_qty * usdy_price
    total = meth_usd + usdy_usd
    ratio = (meth_usd / total) if total > 0 else 0.0

    return {
        "mETH_qty": meth_qty,
        "USDY_qty": usdy_qty,
        "meth_price": meth_price,
        "usdy_price": usdy_price,
        "meth_usd": meth_usd,
        "usdy_usd": usdy_usd,
        "total_vault_usd": total,
        "current_meth_ratio": ratio,
    }


# ===========================================================================
# 2. MOCK ECOSYSTEM SIGNALS (hackathon partners)
# ===========================================================================
# Smoothing factor: how much of the new random draw bleeds into the signal each
# tick (0..1). Lower => more inertia => the market "regime" drifts slowly instead
# of teleporting, so the AI's target stops oscillating wildly between ticks.
SIGNAL_INERTIA = float(os.getenv("SIGNAL_INERTIA", "0.35"))
# Probability that a categorical signal *changes* on a given tick.
CATEGORICAL_FLIP_PROB = float(os.getenv("CATEGORICAL_FLIP_PROB", "0.25"))

# Persisted across ticks to give the mocked market a sense of continuity.
_last_signals: dict | None = None

# How fast the *effective* allocation target chases the LLM's wish (0..1).
# Lower => the portfolio glides toward the AI's target over several ticks rather
# than teleporting (e.g. 0.90 -> 0.35 in one step), which looks far more natural.
TARGET_INERTIA = float(os.getenv("TARGET_INERTIA", "0.5"))
_last_target: float | None = None


def _smooth_target(llm_target: float) -> float:
    """EMA-smooth the AI's requested allocation so moves are gradual, not jumpy."""
    global _last_target
    if _last_target is None:
        _last_target = llm_target
    else:
        _last_target = round(
            _last_target * (1 - TARGET_INERTIA) + llm_target * TARGET_INERTIA, 4
        )
    return _last_target


def _smooth_categorical(prev, choices):
    """Mostly keep the previous category; occasionally flip to a new one."""
    if prev is None or random.random() < CATEGORICAL_FLIP_PROB:
        return random.choice(choices)
    return prev


def generate_signals():
    """Random-but-realistic partner signals with inertia.

    Numeric signals mean-revert via an EMA toward a fresh random target so they
    wander smoothly; categorical signals usually persist and only occasionally
    flip. This keeps the live demo from looking jittery while still evolving.
    """
    global _last_signals
    prev = _last_signals

    nansen_target = random.uniform(-20, 25)
    bybit_target = random.uniform(-0.02, 0.03)
    if prev is None:
        nansen = nansen_target
        bybit = bybit_target
    else:
        nansen = prev["nansen_smart_money_flow"] * (1 - SIGNAL_INERTIA) + nansen_target * SIGNAL_INERTIA
        bybit = prev["bybit_mnt_funding"] * (1 - SIGNAL_INERTIA) + bybit_target * SIGNAL_INERTIA

    signals = {
        "nansen_smart_money_flow": round(nansen, 1),                        # %
        "bybit_mnt_funding": round(bybit, 4),                               # %
        "elfa_sentiment": _smooth_categorical(
            prev and prev["elfa_sentiment"], ["Risk-On", "Risk-On", "Neutral", "Risk-Off"]
        ),
        "zai_predictive_spread": _smooth_categorical(
            prev and prev["zai_predictive_spread"], ["Widening", "Stable", "Tightening"]
        ),
        "orbit_volatility_regime": _smooth_categorical(
            prev and prev["orbit_volatility_regime"], ["Low", "Elevated", "High"]
        ),
        "bga_sustainability_index": _smooth_categorical(
            prev and prev["bga_sustainability_index"], ["High", "High", "Medium"]
        ),
        "animoca_macro_risk": _smooth_categorical(
            prev and prev["animoca_macro_risk"], ["Low", "Moderate", "Elevated"]
        ),
    }
    _last_signals = signals
    return signals


def dominant_signal(signals):
    """Pick the single most 'newsworthy' signal to surface on the chart tooltip."""
    if abs(signals["nansen_smart_money_flow"]) >= 15:
        return f"Nansen flow {signals['nansen_smart_money_flow']:+.1f}%"
    if signals["elfa_sentiment"] == "Risk-Off":
        return "Elfa sentiment Risk-Off"
    if signals["zai_predictive_spread"] == "Widening":
        return "Z.ai spread Widening"
    if signals["orbit_volatility_regime"] == "High":
        return "Orbit vol High"
    return f"Elfa {signals['elfa_sentiment']}"


# ===========================================================================
# 3. REAL AI INFERENCE (OpenAI)
# ===========================================================================
SYSTEM_PROMPT = """You are CHAMELEON, an autonomous on-chain portfolio manager for an \
AI x RWA vault on Mantle. You allocate between two assets:
  - mETH  : Mantle liquid-staking ETH (growth / risk asset)
  - USDY  : Ondo yield-bearing US-dollar stablecoin (defensive / yield asset)

You receive live ecosystem intelligence from hackathon partners:
  - Nansen  : smart-money net flow (%)
  - Bybit   : MNT perp funding rate (%)
  - Elfa AI : aggregated social sentiment
  - Z.ai    : predictive yield-spread direction
  - Orbit AI: volatility regime
  - BGA     : sustainability index
  - Animoca : macro risk

Decide a TARGET allocation to mETH (0.0 - 1.0). Be decisive but risk-aware:
risk-on signals (positive Nansen flow, Risk-On sentiment, tightening spreads,
low vol) justify a HIGHER mETH ratio; risk-off signals justify rotating into USDY.

Respond with ONLY a strict JSON object, no markdown, of the exact shape:
{"Target_mETH_Ratio": <float 0..1>, "Rationale_String": "<one concise sentence \
citing the specific signals that drove the decision>", "AI_Conviction_Score": <float 0..1>}"""


def static_fallback_decision(state, signals):
    """Deterministic fallback so the live demo never stalls on an API outage."""
    bullish = (
        signals["nansen_smart_money_flow"] > 0
        and signals["elfa_sentiment"] == "Risk-On"
    )
    target = 0.65 if bullish else 0.45
    rationale = (
        f"[FALLBACK] Nansen flow {signals['nansen_smart_money_flow']:+.1f}% and "
        f"Elfa '{signals['elfa_sentiment']}' -> target mETH {target:.0%}."
    )
    return {
        "Target_mETH_Ratio": target,
        "Rationale_String": rationale,
        "AI_Conviction_Score": 0.55,
    }


def _extract_json(raw: str) -> dict:
    """Parse a JSON object out of an LLM response, tolerating markdown fences
    (Gemini in particular likes to wrap output in ```json ... ```)."""
    text = (raw or "").strip()
    if text.startswith("```"):
        # drop the opening fence (``` or ```json) and the trailing fence
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.strip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    # last resort: slice from the first { to the last }
    if not text.lstrip().startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1:
            text = text[start : end + 1]
    return json.loads(text)


def _call_llm(user_payload, use_response_format: bool):
    kwargs = dict(
        model=OPENAI_MODEL,
        temperature=0.4,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Current vault + live partner signals:\n"
                    + json.dumps(user_payload, indent=2)
                    + "\nReturn your allocation decision as strict JSON."
                ),
            },
        ],
    )
    if use_response_format:
        kwargs["response_format"] = {"type": "json_object"}
    return openai_client.chat.completions.create(**kwargs)


def get_ai_decision(state, signals):
    """Call the LLM and parse its JSON decision; fall back to static on failure.

    Works with OpenAI and with OpenAI-compatible providers (e.g. Gemini via
    OPENAI_BASE_URL). If the provider rejects `response_format`, we retry once
    without it and parse JSON out of the raw text.
    """
    if openai_client is None:
        print("[ai] LLM not configured -> static fallback")
        return static_fallback_decision(state, signals)

    user_payload = {
        "current_meth_ratio": round(state["current_meth_ratio"], 4),
        "total_vault_usd": round(state["total_vault_usd"], 2),
        "signals": signals,
    }

    try:
        try:
            resp = _call_llm(user_payload, use_response_format=True)
        except Exception as exc:
            # Some providers reject response_format=json_object; retry plainly.
            print(f"[ai] response_format unsupported ({exc}); retrying plain")
            resp = _call_llm(user_payload, use_response_format=False)

        raw = resp.choices[0].message.content
        decision = _extract_json(raw)

        # Validate + clamp.
        target = float(decision["Target_mETH_Ratio"])
        decision["Target_mETH_Ratio"] = max(0.0, min(1.0, target))
        decision["AI_Conviction_Score"] = max(
            0.0, min(1.0, float(decision.get("AI_Conviction_Score", 0.5)))
        )
        decision["Rationale_String"] = str(decision.get("Rationale_String", "")).strip()
        return decision
    except Exception as exc:
        print(f"[ai] inference failed ({exc}) -> static fallback")
        return static_fallback_decision(state, signals)


# ===========================================================================
# 4. DRIFT & PROFITABILITY CHECK
# ===========================================================================
def evaluate_trade(state, decision):
    """Decide whether to execute. Returns (verdict, plan).

    verdict in {EXECUTE, SKIPPED_MET, SKIPPED_GAS}.
    plan carries the swap legs (token_from, token_to, amount_in_usd) when EXECUTE.
    """
    current = state["current_meth_ratio"]
    target = decision["Target_mETH_Ratio"]
    total = state["total_vault_usd"]
    drift = abs(target - current)

    # --- drift gate -------------------------------------------------------
    if drift < DRIFT_THRESHOLD:
        return "SKIPPED_MET", {
            "drift": drift,
            "message": "Allocation optimal. Drift < 1%.",
        }

    trade_size_usd = drift * total

    # --- gas-vs-yield gate -----------------------------------------------
    # Expected edge from capturing ~4% APY differential on the rebalanced size,
    # measured over a 7-day horizon (the cadence we expect to revisit).
    expected_7d_yield_gain = trade_size_usd * ANNUAL_YIELD_SPREAD * (7.0 / 365.0)

    if ESTIMATED_GAS_USD > expected_7d_yield_gain:
        return "SKIPPED_GAS", {
            "drift": drift,
            "trade_size_usd": trade_size_usd,
            "expected_7d_yield_gain": expected_7d_yield_gain,
            "gas_usd": ESTIMATED_GAS_USD,
            "message": f"Rebalance blocked. Gas (${ESTIMATED_GAS_USD:.2f}) > "
            f"expected 7d yield (${expected_7d_yield_gain:.2f}).",
        }

    # --- profitable: figure out direction --------------------------------
    if target > current:
        # need MORE mETH -> sell USDY into mETH
        token_from, token_to = USDY_ADDRESS, METH_ADDRESS
    else:
        token_from, token_to = METH_ADDRESS, USDY_ADDRESS

    return "EXECUTE", {
        "drift": drift,
        "trade_size_usd": trade_size_usd,
        "expected_7d_yield_gain": expected_7d_yield_gain,
        "token_from": token_from,
        "token_to": token_to,
    }


# ===========================================================================
# 5. EXECUTION
# ===========================================================================
def execute_rebalance(state, plan, rationale):
    """Send ChameleonVault.rebalance() on-chain. Returns the tx hash hex or None."""
    if vault is None or account is None:
        print("[exec] no signer/vault configured -> simulating tx hash")
        return "0xSIMULATED" + os.urandom(28).hex()

    token_from = Web3.to_checksum_address(plan["token_from"])
    token_to = Web3.to_checksum_address(plan["token_to"])

    # Convert the USD trade size into `amountIn` of the SOLD token (18 decimals).
    price_from = state["meth_price"] if token_from.lower() == METH_ADDRESS.lower() else state["usdy_price"]
    amount_in = int((plan["trade_size_usd"] / price_from) * 1e18)

    try:
        tx = vault.functions.rebalance(token_from, token_to, amount_in, rationale).build_transaction(
            {
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address),
                "gas": 500_000,
                "gasPrice": w3.eth.gas_price,
                "chainId": w3.eth.chain_id,
            }
        )
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        print(f"[exec] rebalance sent: {tx_hash.hex()}")
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return tx_hash.hex()
    except Exception as exc:
        print(f"[exec] transaction failed: {exc}")
        return None


# ===========================================================================
# 6. STATUS OUTPUT (latest + rolling history)
# ===========================================================================
def load_status():
    """Load existing status.json (preserving history) or seed a fresh structure."""
    if STATUS_PATH.exists():
        try:
            return json.loads(STATUS_PATH.read_text())
        except Exception:
            pass
    return {"latest": {}, "history": [], "ledger": []}


def write_status(status, state, signals, decision, verdict, detail, tx_hash):
    now = datetime.now(timezone.utc)
    ts_iso = now.isoformat()

    status["latest"] = {
        "state": verdict,
        "rationale": decision["Rationale_String"]
        if verdict == "EXECUTE"
        else detail.get("message", decision["Rationale_String"]),
        "txHash": tx_hash,
        "timestamp": ts_iso,
        "target_meth_ratio": decision["Target_mETH_Ratio"],
        "current_meth_ratio": round(state["current_meth_ratio"], 4),
        "ai_conviction_score": decision["AI_Conviction_Score"],
        "total_vault_usd": round(state["total_vault_usd"], 2),
        "meth_qty": round(state["mETH_qty"], 6),
        "usdy_qty": round(state["USDY_qty"], 2),
        "meth_price": state["meth_price"],
        "usdy_price": state["usdy_price"],
        "signals": signals,
    }

    # Rolling 20-tick history for the allocation Area Chart.
    status.setdefault("history", []).append(
        {
            "timestamp": ts_iso,
            "target_meth_ratio": decision["Target_mETH_Ratio"],
            "current_meth_ratio": round(state["current_meth_ratio"], 4),
            "AI_Conviction_Score": decision["AI_Conviction_Score"],
            "dominant_signal": dominant_signal(signals),
            "state": verdict,
        }
    )
    status["history"] = status["history"][-HISTORY_LEN:]

    # On-chain benchmark ledger (only successful executions).
    if verdict == "EXECUTE" and tx_hash:
        status.setdefault("ledger", []).insert(
            0,
            {
                "timestamp": ts_iso,
                "action": f"{_sym(detail['token_from'])} -> {_sym(detail['token_to'])}",
                "amount_usd": round(detail["trade_size_usd"], 2),
                "rationale": decision["Rationale_String"],
                "txHash": tx_hash,
            },
        )
        status["ledger"] = status["ledger"][:50]

    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(status, indent=2))
    print(f"[status] wrote {STATUS_PATH} ({verdict})")


def _sym(addr):
    if addr and addr.lower() == METH_ADDRESS.lower():
        return "mETH"
    if addr and addr.lower() == USDY_ADDRESS.lower():
        return "USDY"
    return "?"


# ===========================================================================
# MAIN LOOP
# ===========================================================================
def tick():
    status = load_status()

    state = fetch_vault_state()
    signals = generate_signals()
    decision = get_ai_decision(state, signals)
    decision["Target_mETH_Ratio"] = _smooth_target(decision["Target_mETH_Ratio"])
    verdict, detail = evaluate_trade(state, decision)

    print(
        f"[tick] ratio={state['current_meth_ratio']:.3f} "
        f"target={decision['Target_mETH_Ratio']:.3f} "
        f"conviction={decision['AI_Conviction_Score']:.2f} -> {verdict}"
    )

    tx_hash = None
    if verdict == "EXECUTE":
        tx_hash = execute_rebalance(state, detail, decision["Rationale_String"])
        if tx_hash is None:
            verdict = "SKIPPED_GAS"  # treat a failed send as a no-op for the UI
            detail = {"message": "Execution reverted on-chain; holding position."}
        else:
            # The mocked DEX swap is value-preserving (no slippage/fees), so a
            # successful rebalance lands the vault EXACTLY on the target ratio.
            # We compute the post-trade state locally instead of re-reading from
            # the RPC, which often returns stale balances right after the receipt
            # (that lag is what made CURRENT look "stuck" far from TARGET).
            state = _apply_target_locally(state, decision["Target_mETH_Ratio"])
            print(
                f"[exec] post-trade ratio={state['current_meth_ratio']:.3f} "
                f"(target {decision['Target_mETH_Ratio']:.3f})"
            )

    write_status(status, state, signals, decision, verdict, detail, tx_hash)


def _apply_target_locally(state, target_ratio):
    """Return a copy of `state` rebalanced to `target_ratio` (value-preserving).

    Used to reflect a just-executed rebalance immediately, so the dashboard's
    CURRENT bar snaps onto the TARGET instead of showing stale RPC balances.
    """
    total = state["total_vault_usd"]
    meth_usd = target_ratio * total
    usdy_usd = (1.0 - target_ratio) * total
    new_state = dict(state)
    new_state.update(
        {
            "current_meth_ratio": target_ratio,
            "meth_usd": meth_usd,
            "usdy_usd": usdy_usd,
            "mETH_qty": meth_usd / state["meth_price"] if state["meth_price"] else 0.0,
            "USDY_qty": usdy_usd / state["usdy_price"] if state["usdy_price"] else 0.0,
        }
    )
    return new_state


def main():
    print("=" * 64)
    print(" CHAMELEON AGENT online · root@byreal-skills:~/chameleon-agent")
    print(f" RPC={RPC_URL}  VAULT={VAULT_ADDRESS or '(unset)'}")
    provider = "gemini" if "generativelanguage.googleapis" in OPENAI_BASE_URL else (
        "openai-compatible" if OPENAI_BASE_URL else "openai"
    )
    print(f" model={OPENAI_MODEL}  provider={provider}  interval={LOOP_INTERVAL_SECONDS}s")
    print("=" * 64)

    while True:
        try:
            tick()
        except Exception:
            print("[fatal] unhandled error in tick:")
            traceback.print_exc()
        time.sleep(LOOP_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
