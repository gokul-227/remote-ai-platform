export default function SecurityPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-[var(--text-main)] mb-6">Security</h1>
      <p className="text-[var(--text-main)] mb-4">
        If you believe you&apos;ve found a security vulnerability in Remote AI Platform, please report
        it to <a href="mailto:security@remoteaiplatform.com" className="underline hover:text-[#B54A2C]">security@remoteaiplatform.com</a>.
        Please include enough detail to reproduce the issue, and avoid accessing or modifying
        other users&apos; data beyond what&apos;s needed to demonstrate the vulnerability.
      </p>
      <p className="text-[var(--text-main)]">
        We aim to acknowledge reports promptly and will keep you updated as we investigate.
      </p>
    </div>
  );
}
