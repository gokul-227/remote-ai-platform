import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center text-[#1c1e21]">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-slate-600">This page doesn’t exist or is no longer available.</p>
      <Link href="/#jobs" className="mt-6 inline-flex rounded-full bg-[#0552CC] px-5 py-2.5 font-semibold text-white">
        Browse remote jobs
      </Link>
    </main>
  );
}
