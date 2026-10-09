import { OnbidSource } from "@/lib/api/onbid/client";
import { getCollectorEnv } from "@/lib/env/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { collectProperties } from "@/lib/services/property-service";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!isCronAuthorized(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = getCollectorEnv();
    const result = await collectProperties(new OnbidSource(config), config);
    return Response.json(result, { status: result.complete ? 200 : 503 });
  } catch {
    return Response.json(
      { error: "Collection configuration or execution failed" },
      { status: 503 },
    );
  }
}
export const POST = GET;
