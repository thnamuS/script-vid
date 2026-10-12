export function formatDate(value: string, includeTime = true) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(date)
}
