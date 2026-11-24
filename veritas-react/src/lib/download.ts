export function downloadJson(name: string, data: unknown) {
  downloadFile(name, JSON.stringify(data, null, 2), "application/json");
}
export function downloadFile(name: string, text: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Avoid spreadsheet formula execution when a display name starts with =,+,-,@.
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
