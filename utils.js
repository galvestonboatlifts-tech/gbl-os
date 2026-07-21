export const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

export const dateText = (d) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString() : '—'

export const today = () => new Date().toISOString().slice(0, 10)

export const id = () => crypto.randomUUID()

export const statusTone = (status = '') => {
  if (/paid|accepted|complete|active/i.test(status)) return 'green'
  if (/overdue|declined|cancel|inactive/i.test(status)) return 'red'
  return 'amber'
}
