import type { Expense, Budget } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ExpenseRecord = {
  id: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  date: string;
  createdAt: string;
};

export type BudgetRecord = {
  id: string;
  category: string;
  limit: number;
  period: string;
  currency: string;
  spent: number;
  remaining: number;
  percent: number;
};

export type FinanceSummary = {
  period: string;
  total: number;
  currency: string;
  byCategory: Array<{ category: string; amount: number; count: number }>;
  budgetStatus: BudgetRecord[];
};

@Injectable()
export class JarvisFinanceService {
  private readonly logger = new Logger(JarvisFinanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async addExpense(
    sessionId: string,
    input: {
      amount: number;
      category: string;
      description: string;
      date?: string;
      currency?: string;
    },
  ): Promise<ExpenseRecord | null> {
    try {
      const date = input.date ?? new Date().toISOString().slice(0, 10);
      const e = await this.prisma.expense.create({
        data: {
          sessionId,
          amount: Math.abs(input.amount),
          currency: input.currency ?? 'EUR',
          category: input.category.toLowerCase().trim(),
          description: input.description.trim(),
          date,
        },
      });
      return this.mapExpense(e);
    } catch (err) {
      this.logger.error(`addExpense failed: ${err}`);
      return null;
    }
  }

  async listExpenses(
    sessionId: string,
    options?: { category?: string; from?: string; to?: string; limit?: number },
  ): Promise<ExpenseRecord[]> {
    try {
      const rows = await this.prisma.expense.findMany({
        where: {
          sessionId,
          ...(options?.category ? { category: options.category } : {}),
          ...(options?.from || options?.to
            ? {
                date: {
                  ...(options.from ? { gte: options.from } : {}),
                  ...(options.to ? { lte: options.to } : {}),
                },
              }
            : {}),
        },
        orderBy: { date: 'desc' },
        take: options?.limit ?? 30,
      });
      return rows.map((e) => this.mapExpense(e));
    } catch {
      return [];
    }
  }

  async summary(sessionId: string, period?: string): Promise<FinanceSummary> {
    const now = new Date();
    let from: string;
    let to: string;
    const label = period ?? 'month';

    if (label === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString().slice(0, 10);
    } else if (label === 'year') {
      from = `${now.getFullYear()}-01-01`;
    } else {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    to = now.toISOString().slice(0, 10);

    const [expenses, budgets] = await Promise.all([
      this.listExpenses(sessionId, { from, to, limit: 500 }),
      this.listBudgets(sessionId),
    ]);

    const byCategory = new Map<string, { amount: number; count: number }>();
    let total = 0;
    for (const e of expenses) {
      total += e.amount;
      const existing = byCategory.get(e.category) ?? { amount: 0, count: 0 };
      byCategory.set(e.category, {
        amount: existing.amount + e.amount,
        count: existing.count + 1,
      });
    }

    const budgetStatus: BudgetRecord[] = budgets.map((b) => {
      const spent = byCategory.get(b.category)?.amount ?? 0;
      const remaining = Math.max(0, b.limit - spent);
      const percent = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
      return { ...b, spent, remaining, percent };
    });

    return {
      period: label,
      total: Math.round(total * 100) / 100,
      currency: 'EUR',
      byCategory: [...byCategory.entries()]
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.amount - a.amount),
      budgetStatus,
    };
  }

  async setBudget(
    sessionId: string,
    input: {
      category: string;
      limit: number;
      period?: string;
      currency?: string;
    },
  ): Promise<BudgetRecord | null> {
    try {
      const category = input.category.toLowerCase().trim();
      const period = input.period ?? 'monthly';
      const b = await this.prisma.budget.upsert({
        where: { sessionId_category_period: { sessionId, category, period } },
        create: {
          sessionId,
          category,
          limit: input.limit,
          period,
          currency: input.currency ?? 'EUR',
        },
        update: { limit: input.limit },
      });
      return { ...this.mapBudget(b), spent: 0, remaining: b.limit, percent: 0 };
    } catch (err) {
      this.logger.error(`setBudget failed: ${err}`);
      return null;
    }
  }

  async listBudgets(sessionId: string): Promise<BudgetRecord[]> {
    try {
      const rows = await this.prisma.budget.findMany({
        where: { sessionId },
        orderBy: { category: 'asc' },
      });
      return rows.map((b) => ({
        ...this.mapBudget(b),
        spent: 0,
        remaining: b.limit,
        percent: 0,
      }));
    } catch {
      return [];
    }
  }

  private mapExpense(e: Expense): ExpenseRecord {
    return {
      id: e.id,
      amount: e.amount,
      currency: e.currency,
      category: e.category,
      description: e.description,
      date: e.date,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private mapBudget(
    b: Budget,
  ): Omit<BudgetRecord, 'spent' | 'remaining' | 'percent'> {
    return {
      id: b.id,
      category: b.category,
      limit: b.limit,
      period: b.period,
      currency: b.currency,
    };
  }
}
