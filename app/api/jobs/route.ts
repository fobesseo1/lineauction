import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local-only control for the daily runner. proxy.ts returns 404 for this route on the
// read-only public deployment; the guard below repeats that in case the proxy is bypassed.
const JOBS = ["onbid", "court"] as const;
type Job = (typeof JOBS)[number];
const readJson = async (path: string) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; } };
const readOnly = () => process.env.NEXT_PUBLIC_READ_ONLY_SITE === "1";

export async function GET() {
  if (readOnly()) return new Response("Not Found", { status: 404 });
  const [current, onbid, court, health, runs] = await Promise.all([
    readJson("data/daily/current.json"), readJson("data/daily/last-onbid.json"), readJson("data/daily/last-court.json"), readJson("data/daily/health.json"),
    readFile("data/daily/runs.jsonl", "utf8").catch(() => ""),
  ]);
  const recent = runs.trim().split("\n").filter(Boolean).slice(-10).map(line => JSON.parse(line)).reverse();
  return Response.json({ current, last: { onbid, court }, health, recent }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (readOnly()) return new Response("Not Found", { status: 404 });
  const { job } = (await request.json().catch(() => ({}))) as { job?: string };
  if (!JOBS.includes(job as Job)) return Response.json({ error: "unknown job" }, { status: 400 });
  // Detached so the run outlives this request; the runner itself refuses a second concurrent job.
  const child = spawn(process.execPath, ["scripts/daily/run.mjs", `--job=${job}`, "--trigger=manual"], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return Response.json({ started: true, job });
}
