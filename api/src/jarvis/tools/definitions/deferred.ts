import { defineTool } from '../define-tool';

export const deferredTools = [
  defineTool({
    name: 'resource.allocate',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.resources) return 'Service ressources non disponible.';
      const alloc = await ctx.resources.allocateResource(sessionId, {
        resourceType: call.args.resourceType,
        resourceName: call.args.resourceName,
        allocatedHours: call.args.allocatedHours,
        allocationDate: call.args.allocationDate
          ? new Date(call.args.allocationDate)
          : new Date(),
        expiryDate: call.args.expiryDate
          ? new Date(call.args.expiryDate)
          : undefined,
      });
      if (!alloc) return "Échec de l'allocation.";
      return `Ressource allouée: ${alloc.resourceType}/${alloc.resourceName} — ${alloc.allocatedHours}h${alloc.expiryDate ? ` (expire: ${alloc.expiryDate.slice(0, 10)})` : ''}`;
    },
  }),
  defineTool({
    name: 'resource.capacity',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.resources) return 'Service ressources non disponible.';
      const capacities = await ctx.resources.getCapacity(
        sessionId,
        call.args.resourceType,
      );
      if (!capacities.length) return 'Aucune allocation active.';
      return capacities
        .map(
          (c) =>
            `${c.resourceType}/${c.resourceName}: ${c.totalUsed.toFixed(1)}/${c.totalAllocated.toFixed(1)}h utilisées (${c.utilizationPercentage.toFixed(0)}%)`,
        )
        .join('\n');
    },
  }),
  defineTool({
    name: 'resource.optimize',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env) => {
      const { ctx, sessionId } = env;
      if (!ctx.resources) return 'Service ressources non disponible.';
      const suggestions =
        await ctx.resources.suggestResourceOptimization(sessionId);
      if (!suggestions.length) return 'Aucune optimisation à suggérer.';
      return `${suggestions.length} suggestion(s):\n${suggestions.map((s) => `- ${s.resource}: ${s.suggestion}`).join('\n')}`;
    },
  }),
  defineTool({
    name: 'analytics.forecast',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.analytics) return 'Service analytics non disponible.';
      const metric = await ctx.analytics.saveForecast(
        sessionId,
        call.args.metricType,
        call.args.historicalData,
        call.args.forecast,
        call.args.accuracy,
      );
      if (!metric) return 'Échec de la sauvegarde des prévisions.';
      return `Prévisions sauvegardées: ${metric.metricType} — ${metric.forecast.length} point(s) de prévision (précision: ${(metric.accuracy * 100).toFixed(0)}%)`;
    },
  }),
  defineTool({
    name: 'analytics.trend',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.analytics) return 'Service analytics non disponible.';
      const trend = await ctx.analytics.analyzeHistoricalTrend(
        sessionId,
        call.args.metricType,
      );
      if (!trend)
        return `Pas assez de données pour analyser ${call.args.metricType}.`;
      const dirLabel =
        trend.direction === 'up'
          ? '↑ hausse'
          : trend.direction === 'down'
            ? '↓ baisse'
            : '→ stable';
      return `Tendance ${trend.metricType}: ${dirLabel} de ${Math.abs(trend.changePercent)}% — moy. récente: ${trend.recentAverage} vs historique: ${trend.historicalAverage}`;
    },
  }),
  defineTool({
    name: 'delegation.create',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.delegation) return 'Service délégation non disponible.';
      const d = await ctx.delegation.delegate(sessionId, {
        ...call.args,
        dueDate: call.args.dueDate ? new Date(call.args.dueDate) : undefined,
      });
      if (!d) return 'Impossible de créer la délégation.';
      return `OK. Tâche déléguée à ${d.delegateTo}: "${d.taskDescription}"`;
    },
  }),
  defineTool({
    name: 'delegation.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.delegation) return 'Service délégation non disponible.';
      const delegations = await ctx.delegation.list(sessionId, call.args);
      if (!delegations.length) return 'Aucune délégation.';
      return `${delegations.length} délégation(s):\n${delegations.map((d) => `- [${d.status}] → ${d.delegateTo}: ${d.taskDescription}`).join('\n')}`;
    },
  }),
  defineTool({
    name: 'delegation.escalate',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.delegation) return 'Service délégation non disponible.';
      const d = await ctx.delegation.escalate(
        sessionId,
        call.args.delegationId,
        call.args.escalateTo,
        call.args.reason,
      );
      if (!d) return "Impossible d'escalader la délégation.";
      return `OK. Escalade vers ${d.delegateTo}: "${d.taskDescription}"`;
    },
  }),
  defineTool({
    name: 'delegation.resolve',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.delegation) return 'Service délégation non disponible.';
      const d = await ctx.delegation.resolve(
        sessionId,
        call.args.delegationId,
        call.args.resolutionNote,
      );
      if (!d) return 'Impossible de résoudre la délégation.';
      return `OK. Délégation résolue: "${d.taskDescription}"`;
    },
  }),
  defineTool({
    name: 'reminder.create',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.reminders) return 'Service rappels non disponible.';
      const triggerAt = new Date(call.args.triggerAt);
      if (isNaN(triggerAt.getTime())) return 'Date de rappel invalide.';
      const r = await ctx.reminders.create(sessionId, {
        text: call.args.text,
        triggerAt,
        recurring: call.args.recurring,
        rrule: call.args.rrule,
      });
      if (!r) return 'Impossible de créer le rappel.';
      const when = new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: ctx.tz,
      }).format(triggerAt);
      return `OK. Rappel créé: "${r.text}" le ${when}`;
    },
  }),
  defineTool({
    name: 'reminder.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.reminders) return 'Service rappels non disponible.';
      const reminders = await ctx.reminders.list(sessionId, {
        done: call.args.done ?? false,
        limit: call.args.limit,
      });
      if (!reminders.length) return 'Aucun rappel.';
      return reminders
        .map((r, i) => {
          const when = new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: ctx.tz,
          }).format(new Date(r.triggerAt));
          return `#${i + 1} ${r.done ? '✓' : '⏰'} ${r.text} — ${when}`;
        })
        .join('\n');
    },
  }),
  defineTool({
    name: 'reminder.done',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.reminders) return 'Service rappels non disponible.';
      const reminders = await ctx.reminders.list(sessionId, {
        done: false,
        limit: 50,
      });
      const idx = call.args.ref - 1;
      const target = reminders[idx];
      if (!target) return `Rappel #${call.args.ref} introuvable.`;
      await ctx.reminders.markDone(sessionId, target.id);
      return `OK. Rappel marqué comme fait: "${target.text}"`;
    },
  }),
  defineTool({
    name: 'reminder.snooze',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.reminders) return 'Service rappels non disponible.';
      const reminders = await ctx.reminders.list(sessionId, {
        done: false,
        limit: 50,
      });
      const idx = call.args.ref - 1;
      const target = reminders[idx];
      if (!target) return `Rappel #${call.args.ref} introuvable.`;
      const until = new Date(call.args.until);
      if (isNaN(until.getTime())) return 'Date de snooze invalide.';
      await ctx.reminders.snooze(sessionId, target.id, until);
      const when = new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: ctx.tz,
      }).format(until);
      return `OK. Rappel reporté au ${when}: "${target.text}"`;
    },
  }),
  defineTool({
    name: 'reminder.delete',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.reminders) return 'Service rappels non disponible.';
      const reminders = await ctx.reminders.list(sessionId, {
        done: false,
        limit: 50,
      });
      const idx = call.args.ref - 1;
      const target = reminders[idx];
      if (!target) return `Rappel #${call.args.ref} introuvable.`;
      await ctx.reminders.delete(sessionId, target.id);
      return `OK. Rappel supprimé: "${target.text}"`;
    },
  }),
  defineTool({
    name: 'habit.create',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.habits) return 'Service habitudes non disponible.';
      const h = await ctx.habits.create(sessionId, {
        name: call.args.name,
        emoji: call.args.emoji,
        frequency: call.args.frequency,
      });
      if (!h) return "Impossible de créer l'habitude.";
      return `OK. Habitude créée: ${h.emoji ? `${h.emoji} ` : ''}${h.name} (${h.frequency})`;
    },
  }),
  defineTool({
    name: 'habit.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.habits) return 'Service habitudes non disponible.';
      const habits = await ctx.habits.list(
        sessionId,
        call.args.includeArchived ?? false,
      );
      if (!habits.length) return 'Aucune habitude enregistrée.';
      return habits
        .map((h, i) => {
          const today = h.loggedToday ? " ✓ (fait aujourd'hui)" : '';
          const streak = h.streak > 1 ? ` 🔥 ${h.streak}j` : '';
          return `#${i + 1} ${h.emoji ? `${h.emoji} ` : ''}${h.name}${today}${streak}`;
        })
        .join('\n');
    },
  }),
  defineTool({
    name: 'habit.log',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.habits) return 'Service habitudes non disponible.';
      const habits = await ctx.habits.list(sessionId);
      const idx = call.args.ref - 1;
      const target = habits[idx];
      if (!target) return `Habitude #${call.args.ref} introuvable.`;
      const date = call.args.date ?? new Date().toISOString().slice(0, 10);
      const updated = await ctx.habits.log(
        sessionId,
        target.id,
        date,
        call.args.note,
      );
      if (!updated) return "Impossible d'enregistrer le log.";
      const streakMsg =
        updated.streak > 1 ? ` 🔥 Série: ${updated.streak} jours!` : '';
      return `OK. "${updated.name}" — fait le ${date}.${streakMsg}`;
    },
  }),
  defineTool({
    name: 'habit.streak',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env) => {
      const { ctx, sessionId } = env;
      if (!ctx.habits) return 'Service habitudes non disponible.';
      const habits = await ctx.habits.list(sessionId);
      if (!habits.length) return 'Aucune habitude.';
      return habits
        .map((h) => {
          const bar =
            '█'.repeat(Math.min(h.streak, 10)) +
            '░'.repeat(Math.max(0, 10 - h.streak));
          return `${h.emoji ?? '•'} ${h.name}: ${bar} ${h.streak}j (total: ${h.totalLogs})`;
        })
        .join('\n');
    },
  }),
  defineTool({
    name: 'habit.archive',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.habits) return 'Service habitudes non disponible.';
      const habits = await ctx.habits.list(sessionId);
      const idx = call.args.ref - 1;
      const target = habits[idx];
      if (!target) return `Habitude #${call.args.ref} introuvable.`;
      await ctx.habits.archive(sessionId, target.id);
      return `OK. Habitude archivée: "${target.name}"`;
    },
  }),
  defineTool({
    name: 'expense.add',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.finance) return 'Service finance non disponible.';
      const e = await ctx.finance.addExpense(sessionId, call.args);
      if (!e) return 'Impossible de sauvegarder la dépense.';
      return `OK. Dépense ajoutée: ${e.amount} ${e.currency} — ${e.description} [${e.category}] le ${e.date}`;
    },
  }),
  defineTool({
    name: 'expense.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.finance) return 'Service finance non disponible.';
      const expenses = await ctx.finance.listExpenses(sessionId, call.args);
      if (!expenses.length) return 'Aucune dépense trouvée.';
      const total = expenses.reduce((s, e) => s + e.amount, 0);
      const lines = expenses.map(
        (e) =>
          `- ${e.date} | ${e.amount.toFixed(2)} ${e.currency} | ${e.category} | ${e.description}`,
      );
      return `${expenses.length} dépense(s) — Total: ${total.toFixed(2)} EUR\n${lines.join('\n')}`;
    },
  }),
  defineTool({
    name: 'expense.summary',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.finance) return 'Service finance non disponible.';
      const summary = await ctx.finance.summary(sessionId, call.args.period);
      const catLines = summary.byCategory.map(
        (c) => `- ${c.category}: ${c.amount.toFixed(2)} EUR (${c.count} dép.)`,
      );
      const budgetLines = summary.budgetStatus
        .filter((b) => b.limit > 0)
        .map((b) => {
          const bar = b.percent >= 100 ? '🔴' : b.percent >= 80 ? '🟠' : '🟢';
          return `  ${bar} ${b.category}: ${b.spent.toFixed(0)}/${b.limit.toFixed(0)} EUR (${b.percent}%)`;
        });
      const out = [
        `Résumé ${summary.period} — Total: ${summary.total.toFixed(2)} EUR`,
        ...catLines,
      ];
      if (budgetLines.length) out.push('Budgets:', ...budgetLines);
      return out.join('\n');
    },
  }),
  defineTool({
    name: 'budget.set',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.finance) return 'Service finance non disponible.';
      const b = await ctx.finance.setBudget(sessionId, call.args);
      if (!b) return 'Impossible de définir le budget.';
      return `OK. Budget défini: ${b.category} → ${b.limit} ${b.currency}/${b.period}`;
    },
  }),
  defineTool({
    name: 'budget.status',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.finance) return 'Service finance non disponible.';
      const summary = await ctx.finance.summary(
        sessionId,
        call.args.period ?? 'month',
      );
      if (!summary.budgetStatus.length) return 'Aucun budget configuré.';
      return summary.budgetStatus
        .map((b) => {
          const bar =
            b.percent >= 100
              ? '🔴 Dépassé'
              : b.percent >= 80
                ? '🟠 Attention'
                : '🟢 OK';
          return `${bar} ${b.category}: ${b.spent.toFixed(0)}/${b.limit.toFixed(0)} EUR (${b.percent}%)`;
        })
        .join('\n');
    },
  }),
];
