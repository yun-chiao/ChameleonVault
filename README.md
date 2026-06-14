<div align="center">

# ChameleonVault 🦎

### Autonomous AI x RWA Yield Vault on Mantle

**An ERC-8004 identity-gated AI agent that dynamically rebalances mETH & USDY — every decision benchmarked permanently on-chain.**

`Mantle Turing Test Hackathon 2026` · `Phase 2: AI Awakening` · `Track: AI x RWA`

[![Network](https://img.shields.io/badge/Network-Mantle%20Sepolia-00FF66?style=flat-square)](https://explorer.sepolia.mantle.xyz/)
[![Identity](https://img.shields.io/badge/Identity-ERC--8004-A855F7?style=flat-square)](#)
[![Contracts](https://img.shields.io/badge/Contracts-Foundry%20%2B%20OpenZeppelin-blue?style=flat-square)](#)
[![AI](https://img.shields.io/badge/AI-LLM%20Inference-orange?style=flat-square)](#)

</div>

---

## 🎯 The Pitch

Today's RWA yield products force users to babysit allocations, eat gas on every move, and trust opaque "strategies." **ChameleonVault flips this**: users make a **single-sided deposit** of `mETH` (liquid staking) or `USDY` (yield-bearing stablecoin) and then *do nothing*. A single autonomous **AI Agent** — provably gated by an **ERC-8004 Agent Identity NFT** — is the only actor allowed to rebalance the vault, abstracting all gas and swap complexity away from the depositor.

Crucially, the AI is held accountable through **Radical Transparency**: every single decision it makes is written **permanently on-chain** as a human-readable rationale, creating an immutable benchmark of its performance.

### Three core mechanisms demonstrated

| Mechanism | How we prove it |
|---|---|
| 🟢 **On-Chain Benchmarking** | `BenchmarkedStrategyExecuted(rationale)` is emitted on every rebalance — a permanent, queryable record of the AI's reasoning. |
| 🟣 **ERC-8004 Agent Identity** | `onlyAgent` modifier verifies `IERC8004.balanceOf(msg.sender) > 0` before any strategy executes. |
| ⚡ **Human vs. AI** | A live **"Whale Attack"** button lets a human skew the vault on stage, forcing the agent to wake up, detect the drift, and self-correct in real time. |

---

## 🏛️ Architecture

```
  Next.js War-Room  ──poll /status.json (5s)──►  status.json  ◄──write per tick──  Python AI Agent
        │                                                                              │  ① read on-chain balances + oracle
        │  click "Whale Attack"                                                        │  ② generate partner signals (mock)
        ▼                                                                              │  ③ LLM inference (Gemini/OpenAI)
  /api/simulate-whale  (burner wallet, ethers.js)                                      │  ④ drift + gas-vs-yield guards
        │  deposit(mETH, 500)                                                          │  ⑤ rebalance() on-chain
        ▼                                                                              ▼
                    ChameleonVault.sol   ·   Mantle Sepolia (Chain 5003)
                    ├─ MockERC20 (mETH / USDY)        ├─ MockPriceOracle
                    ├─ MockDEXRouter                  └─ MockAgentRegistry (ERC-8004)
```

| Path | Responsibility |
|------|----------------|
| `contracts/ChameleonVault.sol` | Core vault: `deposit`, `rebalance`, ERC-8004 `onlyAgent`, USDY-peg circuit breaker. |
| `contracts/interfaces/` · `contracts/mocks/` | `IERC8004` / oracle / router interfaces + self-contained testnet mocks. |
| `script/Deploy.s.sol` | One-shot deploy + wiring + seed liquidity. |
| `agent/agent.py` | The AI decision loop: state → signals → LLM → drift/gas guards → execute → `status.json`. |
| `frontend/app/page.tsx` | Single-page cyberpunk dashboard (Recharts + framer-motion). |
| `frontend/app/api/simulate-whale/route.ts` | Burner-wallet "Human Whale Attack" API route. |

---

## ✨ Highlights

- **End-to-end real loop** — on-chain reads, **real LLM inference**, real `rebalance` transactions, and a real whale deposit. Every action has a verifiable Mantle Explorer tx hash.
- **Permanent on-chain accountability** — the AI's natural-language rationale is etched on-chain via `BenchmarkedStrategyExecuted`.
- **Gas-vs-yield economic guard** — the agent refuses to trade when expected yield wouldn't beat the gas cost, protecting net returns (`SKIPPED_GAS`).
- **Zero-MetaMask, demo-proof Human vs. AI** — a server-side burner wallet triggers the confrontation, eliminating live wallet-connection failures.
- **Stability engineering for live judging** — LLM auto-fallback, dual EMA signal/target smoothing, and post-trade local state reconciliation keep the dashboard fluid and the narrative clean.
- **Pluggable by design** — `setWiring()` can swap the mock oracle / router / registry for real price feeds and a real ERC-8004 registry without touching the core vault.

---

## ⚙️ Tech Stack

**Contracts** Foundry · OpenZeppelin · Solidity 0.8.24
**Agent** Python 3.13 · web3.py · `openai` SDK (pointed at Google Gemini's OpenAI-compatible endpoint)
**Frontend** Next.js 15 (App Router) · Tailwind CSS · Recharts · framer-motion · lucide-react · ethers v6

---

## 🚀 Quick Start

### 1 · Smart contracts (Foundry)

```bash
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-git
forge build

# Deploy to Mantle Sepolia
export PRIVATE_KEY=0x...                       # deployer + agent owner (auto-registered as the agent)
export MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
forge script script/Deploy.s.sol:Deploy --rpc-url $MANTLE_RPC_URL --broadcast --legacy
```

Copy the printed addresses into `agent/.env` and `frontend/.env.local`.

### 2 · AI agent (Python)

```bash
cd agent
python3 -m venv .venv && source .venv/bin/activate   # Python 3.10+ required (web3 7.x)
pip install -r requirements.txt
cp .env.example .env        # fill in addresses + LLM key (see below)
python agent.py
```

> **LLM config** — works with OpenAI *or* Google Gemini (OpenAI-compatible). For Gemini set:
> `OPENAI_API_KEY=<gemini key>` · `OPENAI_MODEL=gemini-2.5-flash` · `OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`
> If the API is unavailable, the agent falls back to a deterministic decision so the demo never stalls.

### 3 · Frontend (Next.js 15)

```bash
cd frontend
npm install
cp .env.local.example .env.local   # burner key + VAULT/METH addresses
npm run dev                         # http://localhost:3000
```

The dashboard polls `frontend/public/status.json` (written by the agent) every 5 seconds. A seed file ships so the UI is populated before the agent's first tick.

---

## 📦 Deployed Contracts — Mantle Sepolia (Chain 5003)

| Contract | Address |
|---|---|
| **ChameleonVault** | `0xB35A0aEdB24716b0E5B8A8eC3D1BEb8381F97810` |
| mETH (MockERC20) | `0x204E187072dA8B25985AE5CdAaf6e475EA5D573c` |
| USDY (MockERC20) | `0xD20a141cd85f6d9622980600Df099c4bA6e54ddf` |
| MockPriceOracle | `0x0f5887ca68261285333E11E22fB34212782f37e4` |
| MockDEXRouter | `0x6d7C4d781FF85AcC773a4B18235BB0Fe885c1c7F` |
| MockAgentRegistry (ERC-8004) | `0x1d73BFf61397431aCF06c5Ed115215673F34A68B` |

🔎 Explorer: <https://explorer.sepolia.mantle.xyz/address/0xB35A0aEdB24716b0E5B8A8eC3D1BEb8381F97810>

---

## 🧠 How It Works

### Contract — `deposit` & `rebalance`
- **`deposit(token, amount)`** transfers the asset in and updates `vaultBalance` — **no swap on deposit**, so the user's footprint is a single ERC20 transfer. All rebalancing (and its gas/timing) is delegated to the AI.
- **`rebalance(tokenFrom, tokenTo, amountIn, rationale)`** is gated by `onlyAgent` (ERC-8004) and `whenUSDYPegHealthy` (reverts if USDY < $0.98). It executes a direct swap via the router (`amountOutMinimum = 0`), updates balances, and emits `BenchmarkedStrategyExecuted(rationale)` **last** — the permanent benchmark record.
- **Banned by design** (per track rules): no cooldowns, no max-swap limits, no global pause. The only safety rail is the USDY de-peg circuit breaker.

### Agent — the decision loop (every tick)
1. **State & oracle fetch** — reads balances + prices on-chain; falls back to `mETH=$1783.42 / USDY=$1.00` if stale (>1h) or unavailable.
2. **Ecosystem signals** — mocked, EMA-smoothed feeds from **Nansen, Bybit, Elfa AI, Z.ai, Orbit AI, BGA, Animoca**.
3. **LLM inference** — returns strict JSON: `{ Target_mETH_Ratio, Rationale_String, AI_Conviction_Score }`.
4. **Guards →** writes one of three states to `status.json`:
   - 🟢 **`EXECUTED`** — profitable; sends the `rebalance` tx and logs the rationale + tx hash.
   - 🟡 **`SKIPPED_MET`** — drift `< 1%`; allocation already optimal.
   - 🔴 **`SKIPPED_GAS`** — `gas > expected_7d_yield_gain`; trade isn't worth it, hold position.

### Frontend — the war room
A single cyberpunk page: identity header with the hidden Whale Attack button · merged **Portfolio + Allocation** panel (TVL + twin **CURRENT vs AI TARGET** gauges) · **Ecosystem Signals** grid · **Historical AI Target Allocation** area chart · auto-scrolling **Agent Status Terminal** · **On-Chain Benchmark Ledger** with Explorer proof links.
