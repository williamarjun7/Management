export interface CsvColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

export function exportCsv<T>(rows: T[], columns: CsvColumn<T>[], filename: string): void {
  const header = columns.map((c) => `"${c.label}"`).join(",");

  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = c.value(row);
          if (val == null) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    )
    .join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
