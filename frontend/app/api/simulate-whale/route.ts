import { NextResponse } from "next/server";
import { ethers } from "ethers";

/**
 * POST /api/simulate-whale  —  "Human Whale Attack (Trigger Drift)"
 * ------------------------------------------------------------------
 * The flawless-demo replacement for MetaMask. A hardcoded burner wallet (env)
 * directly deposits a large slug of mETH into the vault, instantly skewing the
 * mETH/USDY ratio. This fulfils the hackathon's "Human vs. AI" mechanism: the
 * human forces drift, and the autonomous Agent must wake up and self-correct
 * live on stage.
 *
 * Flow (against the mock tokens deployed by script/Deploy.s.sol):
 *   1. mint 500 mETH to the burner (MockERC20 exposes public `mint`)
 *   2. approve the vault to pull it
 *   3. call vault.deposit(mETH, 500e18)  — NO swap happens on deposit, by design
 *
 * Required env (frontend/.env.local):
 *   MANTLE_RPC_URL, WHALE_PRIVATE_KEY, VAULT_ADDRESS, METH_ADDRESS
 */

export const dynamic = "force-dynamic";

const VAULT_ABI = [
  "function deposit(address token, uint256 amount) external",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
];

export async function POST() {
  const rpcUrl = process.env.MANTLE_RPC_URL;
  const pk = process.env.WHALE_PRIVATE_KEY;
  const vaultAddr = process.env.VAULT_ADDRESS;
  const methAddr = process.env.METH_ADDRESS;

  if (!rpcUrl || !pk || !vaultAddr || !methAddr) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing env. Set MANTLE_RPC_URL, WHALE_PRIVATE_KEY, VAULT_ADDRESS, METH_ADDRESS in frontend/.env.local",
      },
      { status: 500 }
    );
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(pk, provider);

    const meth = new ethers.Contract(methAddr, ERC20_ABI, wallet);
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);

    const amount = ethers.parseUnits("500", 18); // 500 mETH whale slug

    // 1. Self-fund the burner from the mock faucet (testnet only).
    const mintTx = await meth.mint(wallet.address, amount);
    await mintTx.wait();

    // 2. Approve the vault to pull the deposit.
    const approveTx = await meth.approve(vaultAddr, amount);
    await approveTx.wait();

    // 3. Single-sided deposit — skews the ratio, triggers AI drift correction.
    const depositTx = await vault.deposit(methAddr, amount);
    const receipt = await depositTx.wait();

    return NextResponse.json({
      ok: true,
      message: "WHALE ATTACK EXECUTED — 500 mETH deposited. Vault ratio skewed.",
      txHash: receipt?.hash ?? depositTx.hash,
      whale: wallet.address,
      explorer: `https://explorer.sepolia.mantle.xyz/tx/${
        receipt?.hash ?? depositTx.hash
      }`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
