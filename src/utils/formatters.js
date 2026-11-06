export function formatClock(iso) {
  if (!iso) return 'No alerts yet';
  const date = new Date(iso);
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}
