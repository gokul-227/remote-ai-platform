import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("card-enterprise overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
            {columns.map((col) => (
              <th key={col.key} className={cn("text-left font-medium text-[var(--text-light)] text-xs uppercase tracking-wide px-4 py-3", col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-b border-[var(--border-color)] last:border-b-0",
                onRowClick && "cursor-pointer hover:bg-[var(--bg-subtle)]"
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-3 align-middle text-[var(--text-main)]", col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
