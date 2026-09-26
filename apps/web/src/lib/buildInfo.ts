// Build provenance, inlined at build time by the deploy workflow. Unknown
// values are reported as "unknown" rather than a guessed SHA, so a missing
// injection is visible instead of silently claiming an old commit.
export function buildInfo() {
  return {
    service: "remote-ai-platform-web",
    version: "0.1.0",
    git_sha: process.env.NEXT_PUBLIC_BUILD_SHA || "unknown",
    environment: process.env.NEXT_PUBLIC_DEPLOY_ENV || "unknown",
    build_time: process.env.NEXT_PUBLIC_BUILD_TIME || "unknown",
    deployment_id: process.env.NEXT_PUBLIC_DEPLOYMENT_ID || "unknown",
    timestamp: new Date().toISOString(),
  };
}
