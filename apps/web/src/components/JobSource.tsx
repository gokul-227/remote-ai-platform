import { jobSourceName, originalJobUrl } from "@/lib/jobSources";

export function JobSource({ source, url }: { source?: string | null; url?: string | null }) {
  const href = originalJobUrl(url);
  if (!href)
    return <span>{source === "DIRECT" ? "Posted on Remote AI Platform" : `Source: ${jobSourceName(source)}`}</span>;
  return (
    <span>
      Source:{" "}
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0552CC] underline">
        {jobSourceName(source)} — original listing
      </a>
    </span>
  );
}
