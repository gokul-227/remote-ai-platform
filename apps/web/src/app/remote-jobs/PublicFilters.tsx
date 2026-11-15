import Link from "next/link";
import {
  JOB_TYPES,
  POSTED,
  REGIONS,
  SENIORITY,
  SORTS,
  WORKPLACE,
  chips,
  toQueryString,
  type Filters,
} from "@/lib/jobFilters";
import { API_URL, type PublicJob } from "@/lib/site";

/** Up to `limit` jobs for public filters (same names as the API), and the total. */
export async function fetchFilteredJobs(f: Filters, limit = 30): Promise<{ jobs: PublicJob[]; total: number }> {
  const qs = toQueryString(f);
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs?${qs}${qs ? "&" : ""}limit=${limit}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return { jobs: [], total: 0 };
    const jobs: PublicJob[] = await res.json();
    return { jobs, total: Number(res.headers.get("x-total-count")) || jobs.length };
  } catch {
    return { jobs: [], total: 0 };
  }
}

const selectCls = "h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm";

function Select({
  name,
  label,
  options,
  value,
  any,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value?: string;
  any: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {label}
      <select name={name} defaultValue={value ?? ""} className={selectCls}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Plain GET form: works without JavaScript, every result URL is shareable. */
export function PublicFilterForm({ value }: { value: Filters }) {
  const active = chips(value);
  return (
    <form
      method="get"
      action="/remote-jobs"
      role="search"
      aria-label="Filter remote jobs"
      className="mt-6 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">
          Keywords
          <input
            name="q"
            defaultValue={value.query ?? ""}
            placeholder='Title, skill or company — "exact phrase"'
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
          />
        </label>
        <Select
          name="workplace"
          label="Workplace"
          options={WORKPLACE}
          value={value.workplace?.[0]}
          any="Any workplace"
        />
        <Select name="region" label="Location" options={REGIONS} value={value.region?.[0]} any="Anywhere" />
        <Select name="posted_within" label="Date posted" options={POSTED} value={value.posted_within} any="Any time" />
        <Select name="seniority" label="Experience" options={SENIORITY} value={value.seniority?.[0]} any="Any level" />
        <Select name="job_type" label="Job type" options={JOB_TYPES} value={value.job_type?.[0]} any="Any type" />
        <Select
          name="sort"
          label="Sort"
          options={SORTS.filter((o) => o.value !== "recent")}
          value={value.sort}
          any="Most recent"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="has_salary" value="true" defaultChecked={value.has_salary === "true"} />
          Has salary
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="visa_sponsorship"
            value="true"
            defaultChecked={value.visa_sponsorship === "true"}
          />
          Visa sponsorship
        </label>
        <button type="submit" className="ml-auto h-10 rounded-full bg-brand px-6 text-sm font-bold text-white">
          Show jobs
        </button>
        {active.length > 0 && (
          <Link href="/remote-jobs" className="text-sm font-bold text-slate-600 underline">
            Clear all
          </Link>
        )}
      </div>
    </form>
  );
}
