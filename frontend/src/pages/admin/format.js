// Shared date formatting for admin pages (all output en-PH).

export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium' });
}
