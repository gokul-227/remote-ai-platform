import { buildInfo } from "@/lib/buildInfo";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(buildInfo());
}
