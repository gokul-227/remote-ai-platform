import { cn } from "@/lib/cn";

export function MessageBubble({
  content,
  isOwn,
  timestamp,
}: {
  content: string;
  isOwn: boolean;
  timestamp: string;
}) {
  return (
    <div className={cn("flex flex-col max-w-[75%]", isOwn ? "items-end self-end" : "items-start self-start")}>
      <div
        className={cn(
          "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
          isOwn ? "bg-[var(--color-brand)] text-white dark:text-[#0B1E3D] rounded-br-sm" : "bg-[var(--bg-subtle)] text-[var(--text-main)] rounded-bl-sm"
        )}
      >
        {content}
      </div>
      <span className="text-[11px] text-[var(--text-light)] mt-1 px-1">
        {new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    </div>
  );
}
