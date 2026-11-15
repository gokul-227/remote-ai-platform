import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CURRENCIES,
  FUNCTIONS,
  INDUSTRIES,
  JOB_TYPES,
  LANGUAGES,
  PERIODS,
  POSTED,
  REGIONS,
  SENIORITY,
  SORTS,
  WORKPLACE,
  activeCount,
  chips,
  clearAll,
  facetCount,
  localUtcOffset,
  toggle,
  withValue,
  type Facets,
  type Filters,
  type ListKey,
  type Option,
} from "@/lib/jobFilters";
import { cx, Ic } from "./rap_kit";

const BL = "#175CD3";

/**
 * Job search filters. Quick chips + "All filters" on every size; the full
 * panel is a sidebar on desktop (xl), a collapsible side panel on tablet
 * (md–xl) and a bottom sheet on phones (< md).
 */
export function JobFilterChips({
  value,
  onChange,
  facets,
  open,
  onOpen,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  facets?: Facets;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const n = activeCount(value);
  const quick: { label: string; on: boolean; toggle: () => void }[] = [
    {
      label: "Remote",
      on: !!value.workplace?.includes("remote"),
      toggle: () => onChange(toggle(value, "workplace", "remote")),
    },
    {
      label: "Past week",
      on: value.posted_within === "7d",
      toggle: () => onChange(withValue(value, "posted_within", value.posted_within === "7d" ? undefined : "7d")),
    },
    {
      label: "Has salary",
      on: value.has_salary === "true",
      toggle: () => onChange(withValue(value, "has_salary", value.has_salary ? undefined : "true")),
    },
    {
      label: "Easy Apply",
      on: value.apply === "platform",
      toggle: () => onChange(withValue(value, "apply", value.apply === "platform" ? undefined : "platform")),
    },
    {
      label: "Visa sponsorship",
      on: value.visa_sponsorship === "true",
      toggle: () => onChange(withValue(value, "visa_sponsorship", value.visa_sponsorship ? undefined : "true")),
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Quick filters">
        <button
          type="button"
          onClick={() => onOpen(!open)}
          aria-expanded={open}
          aria-controls="job-filters-panel"
          className={cx(
            "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold xl:hidden",
            n ? "border-[#175CD3] bg-[#175CD3] text-white" : "border-slate-400 text-slate-700 hover:bg-slate-50",
          )}
        >
          <Ic n="filter" s={14} />
          All filters{n ? ` (${n})` : ""}
        </button>
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            aria-pressed={q.on}
            onClick={q.toggle}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold",
              q.on
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-slate-400 text-slate-600 hover:bg-slate-50",
            )}
          >
            {q.label}
            {q.label === "Easy Apply" && facetCount(facets, "apply", "platform") != null
              ? ` (${facetCount(facets, "apply", "platform")})`
              : ""}
          </button>
        ))}
      </div>
      <ActiveChips value={value} onChange={onChange} />
    </div>
  );
}

export function ActiveChips({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const list = chips(value);
  if (!list.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {list.map((c) => (
        <li key={`${c.key}:${c.value}`}>
          <button
            type="button"
            onClick={() => onChange(c.remove(value))}
            aria-label={`Remove filter ${c.label}`}
            className="flex items-center gap-1 rounded-full bg-[#E8F0FC] px-3 py-1 text-xs font-semibold text-[#175CD3] hover:bg-[#D6E4FA]"
          >
            {c.label} <span aria-hidden>×</span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => onChange(clearAll(value))}
          className="px-2 py-1 text-xs font-bold text-slate-600 underline"
        >
          Clear all
        </button>
      </li>
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-slate-200 py-3">
      <legend className="mb-1 text-sm font-bold text-slate-800">{title}</legend>
      {children}
    </fieldset>
  );
}

function Checks({
  name,
  options,
  value,
  onChange,
  facets,
  facetKey = name,
}: {
  name: ListKey;
  options: Option[];
  value: Filters;
  onChange: (f: Filters) => void;
  facets?: Facets;
  facetKey?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((o) => {
        const n = facetCount(facets, facetKey, o.value);
        const checked = !!value[name]?.includes(o.value);
        return (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(toggle(value, name, o.value))}
              className="h-4 w-4 accent-[#175CD3]"
            />
            <span className={cx("flex-1", n === 0 && !checked && "text-slate-400")}>{o.label}</span>
            {n != null && <span className="text-xs text-slate-500">{n.toLocaleString()}</span>}
          </label>
        );
      })}
    </div>
  );
}

function Radios({
  name,
  options,
  value,
  onChange,
  facets,
}: {
  name: "posted_within" | "sort";
  options: Option[];
  value: Filters;
  onChange: (f: Filters) => void;
  facets?: Facets;
}) {
  const current = value[name] ?? (name === "sort" ? "recent" : "");
  const all = name === "posted_within" ? [{ value: "", label: "Any time" }, ...options] : options;
  return (
    <div className="flex flex-col gap-1">
      {all.map((o) => {
        const n = o.value ? facetCount(facets, name, o.value) : undefined;
        return (
          <label key={o.value || "any"} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name={`jf-${name}`}
              checked={current === o.value}
              onChange={() => onChange(withValue(value, name, o.value || undefined))}
              className="h-4 w-4 accent-[#175CD3]"
            />
            <span className="flex-1">{o.label}</span>
            {n != null && <span className="text-xs text-slate-500">{n.toLocaleString()}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** Dynamic multi-select for open-ended values (companies, skills, countries, sources). */
function FacetPicker({
  name,
  value,
  onChange,
  facets,
  placeholder,
  facetKey = name,
}: {
  name: ListKey;
  value: Filters;
  onChange: (f: Filters) => void;
  facets?: Facets;
  placeholder: string;
  facetKey?: string;
}) {
  const [text, setText] = useState("");
  const selected = value[name] ?? [];
  const top = (facets?.[facetKey] ?? []).map((x) => String(x.value)).filter((v) => !selected.includes(v));
  const add = (v: string) => {
    const clean = name === "country" ? v.trim().toUpperCase().slice(0, 2) : v.trim();
    if (clean) onChange(toggle(value, name, clean));
    setText("");
  };
  return (
    <div className="flex flex-col gap-1">
      {[...selected, ...top.slice(0, 8)].map((v) => {
        const n = facetCount(facets, facetKey, v);
        return (
          <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={() => onChange(toggle(value, name, v))}
              className="h-4 w-4 accent-[#175CD3]"
            />
            <span className="flex-1 truncate">{v}</span>
            {n != null && <span className="text-xs text-slate-500">{n.toLocaleString()}</span>}
          </label>
        );
      })}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="mt-1 h-8 rounded-md border border-slate-300 px-2 text-sm"
      />
    </div>
  );
}

export function JobFilterPanel({
  value,
  onChange,
  facets,
  total,
  open,
  onClose,
  onSave,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  facets?: Facets;
  total?: number;
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Phone bottom sheet: move focus into the dialog.
    if (window.matchMedia?.("(max-width: 767px)").matches) ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const tz = localUtcOffset();
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden />}
      <div
        id="job-filters-panel"
        ref={ref}
        tabIndex={-1}
        role="region"
        aria-label="Job filters"
        data-open={open ? "true" : "false"}
        className={cx(
          open ? "flex" : "hidden",
          "xl:flex",
          // phone: bottom sheet
          "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl outline-none",
          // tablet: collapsible side panel; desktop: sidebar
          "md:static md:z-auto md:max-h-none md:rounded-lg md:border md:border-slate-200 md:shadow-none",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="font-bold">Filters</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChange(clearAll(value))}
              className="text-sm font-bold text-slate-600 underline"
            >
              Clear all
            </button>
            <button type="button" onClick={onClose} aria-label="Close filters" className="p-1 xl:hidden">
              <Ic n="x" s={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          <Section title="Sort by">
            <Radios name="sort" options={SORTS} value={value} onChange={onChange} />
          </Section>
          <Section title="Date posted">
            <Radios name="posted_within" options={POSTED} value={value} onChange={onChange} facets={facets} />
          </Section>
          <Section title="Workplace type">
            <Checks name="workplace" options={WORKPLACE} value={value} onChange={onChange} facets={facets} />
          </Section>
          <Section title="Location">
            <Checks name="region" options={REGIONS} value={value} onChange={onChange} facets={facets} />
            <div className="mt-2">
              <FacetPicker
                name="country"
                value={value}
                onChange={onChange}
                facets={facets}
                placeholder="Country code, e.g. DE"
              />
            </div>
            <input
              defaultValue={value.location ?? ""}
              key={value.location ?? ""}
              onBlur={(e) => onChange(withValue(value, "location", e.target.value.trim() || undefined))}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  onChange(withValue(value, "location", e.currentTarget.value.trim() || undefined));
              }}
              placeholder="City, e.g. Berlin"
              aria-label="City"
              className="mt-2 h-8 w-full rounded-md border border-slate-300 px-2 text-sm"
            />
          </Section>
          <Section title="Experience level">
            <Checks name="seniority" options={SENIORITY} value={value} onChange={onChange} facets={facets} />
          </Section>
          <Section title="Job type">
            <Checks name="job_type" options={JOB_TYPES} value={value} onChange={onChange} facets={facets} />
          </Section>
          <Section title="Salary">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={value.has_salary === "true"}
                onChange={() => onChange(withValue(value, "has_salary", value.has_salary ? undefined : "true"))}
                className="h-4 w-4 accent-[#175CD3]"
              />
              <span className="flex-1">Has salary</span>
              {facetCount(facets, "has_salary", true) != null && (
                <span className="text-xs text-slate-500">
                  {facetCount(facets, "has_salary", true)?.toLocaleString()}
                </span>
              )}
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["min_salary", "max_salary"] as const).map((k) => (
                <input
                  key={`${k}:${value[k] ?? ""}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  defaultValue={value[k] ?? ""}
                  onBlur={(e) => onChange(withValue(value, k, e.target.value || undefined))}
                  placeholder={k === "min_salary" ? "Min" : "Max"}
                  aria-label={k === "min_salary" ? "Minimum salary" : "Maximum salary"}
                  className="h-8 rounded-md border border-slate-300 px-2 text-sm"
                />
              ))}
              <select
                value={value.salary_currency ?? "USD"}
                onChange={(e) => onChange({ ...value, salary_currency: e.target.value })}
                aria-label="Salary currency"
                className="h-8 rounded-md border border-slate-300 px-1 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                value={value.salary_period ?? "year"}
                onChange={(e) => onChange({ ...value, salary_period: e.target.value })}
                aria-label="Salary period"
                className="h-8 rounded-md border border-slate-300 px-1 text-sm"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-slate-500">Only jobs stating a salary in this currency and period.</p>
          </Section>
          <Section title="Company">
            <FacetPicker name="company" value={value} onChange={onChange} facets={facets} placeholder="Add a company" />
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={value.verified === "true"}
                onChange={() => onChange(withValue(value, "verified", value.verified ? undefined : "true"))}
                className="h-4 w-4 accent-[#175CD3]"
              />
              Verified companies only
            </label>
          </Section>
          <Section title="Industry">
            <Checks name="industry" options={INDUSTRIES} value={value} onChange={onChange} facets={facets} />
          </Section>
          <Section title="Job function">
            <Checks name="job_function" options={FUNCTIONS} value={value} onChange={onChange} facets={facets} />
          </Section>
          <Section title="Skills">
            <FacetPicker name="skills" value={value} onChange={onChange} facets={facets} placeholder="Add a skill" />
          </Section>
          <Section title="How to apply">
            {(
              [
                ["platform", "Easy Apply on Remote AI Platform"],
                ["external", "On the company or job board site"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={value.apply === v}
                  onChange={() => onChange(withValue(value, "apply", value.apply === v ? undefined : v))}
                  className="h-4 w-4 accent-[#175CD3]"
                />
                <span className="flex-1">{label}</span>
                {facetCount(facets, "apply", v) != null && (
                  <span className="text-xs text-slate-500">{facetCount(facets, "apply", v)?.toLocaleString()}</span>
                )}
              </label>
            ))}
          </Section>
          <Section title="Visa sponsorship">
            {(
              [
                ["true", "Offers visa sponsorship"],
                ["false", "States no sponsorship"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={value.visa_sponsorship === v}
                  onChange={() =>
                    onChange(withValue(value, "visa_sponsorship", value.visa_sponsorship === v ? undefined : v))
                  }
                  className="h-4 w-4 accent-[#175CD3]"
                />
                <span className="flex-1">{label}</span>
                {facetCount(facets, "visa_sponsorship", v === "true") != null && (
                  <span className="text-xs text-slate-500">
                    {facetCount(facets, "visa_sponsorship", v === "true")?.toLocaleString()}
                  </span>
                )}
              </label>
            ))}
          </Section>
          <Section title="Time zone">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={value.tz != null}
                onChange={() => onChange(withValue(value, "tz", value.tz != null ? undefined : String(tz)))}
                className="h-4 w-4 accent-[#175CD3]"
              />
              Overlaps my hours (UTC{tz >= 0 ? "+" : ""}
              {tz}, ±3h)
            </label>
          </Section>
          <Section title="Language of posting">
            <Checks name="language" options={LANGUAGES} value={value} onChange={onChange} facets={facets} />
          </Section>
          <Section title="Job board">
            <FacetPicker name="source" value={value} onChange={onChange} facets={facets} placeholder="Add a source" />
          </Section>
        </div>
        <div className="flex gap-2 border-t border-slate-200 p-3">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              className="flex-1 rounded-full border px-3 py-2 text-sm font-bold"
              style={{ borderColor: BL, color: BL }}
            >
              Save this search
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full px-3 py-2 text-sm font-bold text-white xl:hidden"
            style={{ background: BL }}
          >
            Show {total != null ? total.toLocaleString() : ""} results
          </button>
        </div>
      </div>
    </>
  );
}
