export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    service: "remote-ai-platform-web",
    version: "0.1.0",
    git_sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "93896403d95d07367f71d68606a1b45efe1be131",
    environment: process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
  });
}
