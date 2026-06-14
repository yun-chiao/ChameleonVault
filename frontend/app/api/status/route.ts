import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * GET  /api/status  — returns the latest agent status snapshot.
 * POST /api/status  — the AI agent pushes a fresh snapshot here.
 *
 * On Render the agent and frontend are separate services with separate
 * filesystems, so the agent can't write `public/status.json` for the UI to
 * read. Instead the agent POSTs its status to this route, which keeps the
 * latest snapshot in a process-global (persists across requests because Render
 * runs a single long-lived Node process). The seed file ships so the dashboard
 * is populated before the agent's first push.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StatusStore = {
  latest: unknown;
  history: unknown[];
  ledger: unknown[];
};

function seed(): StatusStore {
  try {
    const p = join(process.cwd(), "public", "status.json");
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return { latest: {}, history: [], ledger: [] };
  }
}

const store = globalThis as unknown as { __chameleonStatus?: StatusStore };
if (!store.__chameleonStatus) store.__chameleonStatus = seed();

export async function GET() {
  return NextResponse.json(store.__chameleonStatus, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const secret = process.env.AGENT_PUSH_SECRET;
  if (secret && req.headers.get("x-agent-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    store.__chameleonStatus = (await req.json()) as StatusStore;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
