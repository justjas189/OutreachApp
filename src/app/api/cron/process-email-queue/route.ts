import { getCronSecret } from "@/lib/env";
import { processEmailQueue } from "@/lib/email-queue/worker";
import { secureStringsEqual } from "@/lib/security/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let expected: string;
  try {
    expected = `Bearer ${getCronSecret()}`;
  } catch {
    return Response.json({ error: "Queue worker is not configured." }, { status: 503 });
  }
  const provided = request.headers.get("authorization") ?? "";
  if (!secureStringsEqual(provided, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processEmailQueue();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Email queue worker failed without exposing provider credentials.");
    return Response.json({ error: "Queue processing failed." }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
