export function formatRelative(date: Date, now: number): string {
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 16) return "Less than 15s ago";
  if (seconds < 31) return "Less than 30s ago";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
