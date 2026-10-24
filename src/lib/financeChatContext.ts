// Shapes P&L data for the chat prompt. Shared by src/lib/chat.ts (live data, built
// in the browser) and api/chat.ts (demo fixtures, built on the server), so both
// send the model the same thing. No Vite-only imports: the serverless function
// imports this file too.

import type { MonthlyPnl, Transaction } from '../types'

export interface ChatTransaction {
  date: string; type: string; amount: number; category: string; description: string; clientName: string
}

export interface ChatMonth {
  month: string; income: number; expenses: number; netProfit: number   // month: 'January 2025'
}

export interface ChatYear {
  year: number; income: number; expenses: number; netProfit: number
}

// Whatever goes into the prompt leaves our infrastructure for Anthropic's, so only
// what a question about the numbers needs is kept: no notes, payment methods,
// reference numbers or ids. The totals come from the database, so the model can
// quote them instead of adding up rows itself, which it does unreliably.
export function financeChatContext(
  transactions: Transaction[],
  years: MonthlyPnl[],
): { transactions: ChatTransaction[]; months: ChatMonth[]; years: ChatYear[] } {
  return {
    transactions: transactions.map(({ date, type, amount, category, description, clientName }) =>
      ({ date, type, amount, category, description, clientName })),
    months: years.flatMap(y => y.months
      .filter(m => m.income > 0 || m.expenses > 0)
      .map(m => ({ month: `${m.month} ${y.year}`, income: m.income, expenses: m.expenses, netProfit: m.netProfit }))),
    years: years.map(y => ({
      year: y.year, income: y.total.income, expenses: y.total.expenses, netProfit: y.total.netProfit,
    })),
  }
}
