export type TransactionType = 'arrival' | 'sale' | 'transfer' | 'expense'

export const getTransactionTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    arrival: 'Приход',
    sale: 'Продажа',
    transfer: 'Перевод',
    expense: 'Расход',
  }
  return labels[type] || type
}

export const getTransactionTypeBadgeColor = (type: string): string => {
  const colors: Record<string, string> = {
    arrival: 'bg-[#27AE60] text-white',
    sale: 'bg-[#2F80ED] text-white',
    transfer: 'bg-[#9B51E0] text-white',
    expense: 'bg-[#EB5757] text-white',
  }
  return colors[type] || 'bg-gray-100 text-gray-800'
}
