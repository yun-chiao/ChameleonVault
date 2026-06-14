import { NextResponse } from "next/server";

/**
 * POST /api/simulate-whale  —  "Human Whale Attack (Trigger Drift)"
 * Burner wallet mints + approves + deposits 500 mETH to skew the vault ratio,
 * forcing the AI agent to detect drift and self-correct live.
 *
 * Required env: MANTLE_RPC_URL, WHALE_PRIVATE_KEY, VAULT_ADDRESS, METH_ADDRESS
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const VAULT_ABI = ["function deposit(address token, uint256 amount) external"];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
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
          "Missing env. Set MANTLE_RPC_URL, WHALE_PRIVATE_KEY, VAULT_ADDRESS, METH_ADDRESS.",
      },
      { status: 500 }
    );
  }

  try {
    // Dynamic import keeps ethers in the Node runtime (see serverExternalPackages).
    const { ethers } = await import("ethers");

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: true,
    });
    const wallet = new ethers.Wallet(pk, provider);

    const meth = new ethers.Contract(methAddr, ERC20_ABI, wallet);
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);

    const amount = ethers.parseUnits("500", 18); // 500 mETH whale slug

    const mintTx = await meth.mint(wallet.address, amount);
    await mintTx.wait(1);

    const approveTx = await meth.approve(vaultAddr, amount);
    await approveTx.wait(1);

    const depositTx = await vault.deposit(methAddr, amount);
    const receipt = await depositTx.wait(1);

    const txHash = receipt?.hash ?? depositTx.hash;

    return NextResponse.json({
      ok: true,
      message: "WHALE ATTACK EXECUTED — 500 mETH deposited. Vault ratio skewed.",
      txHash,
      whale: wallet.address,
      explorer: `https://explorer.sepolia.mantle.xyz/tx/${txHash}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[simulate-whale]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
