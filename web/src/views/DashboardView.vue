<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import BaseBadge from '@/shared/ui/BaseBadge.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import BaseCard from '@/shared/ui/BaseCard.vue';
import BaseSkeleton from '@/shared/ui/BaseSkeleton.vue';
import ReminderWidget from '@/features/dashboard/components/ReminderWidget.vue';
import HabitWidget from '@/features/dashboard/components/HabitWidget.vue';
import { useChatStore } from '@/stores/chatStore';
import { useStatusStore } from '@/stores/statusStore';

const status = useStatusStore();
const chat = useChatStore();
const router = useRouter();

onMounted(async () => {
  await status.refresh();
});

const runPrompt = async (prompt: string) => {
  await router.push('/chat');
  await chat.send(prompt);
};

const openHref = (href: string) => {
  window.open(href, '_blank', 'noopener,noreferrer');
};

type MetricConfig = {
  key: keyof NonNullable<typeof status.snapshot>['metrics'];
  label: string;
  icon: string;
  color: string;
};

const metricConfigs: MetricConfig[] = [
  { key: 'openTodos', label: 'Todos ouverts', icon: 'check', color: 'text-blue-400' },
  { key: 'openShopping', label: 'Courses', icon: 'cart', color: 'text-emerald-400' },
  { key: 'notesTotal', label: 'Notes', icon: 'note', color: 'text-violet-400' },
  { key: 'unreadEmails', label: 'Emails non lus', icon: 'mail', color: 'text-amber-400' },
  { key: 'upcomingReminders', label: 'Rappels (24h)', icon: 'bell', color: 'text-orange-400' },
  { key: 'habitsLoggedToday', label: 'Habitudes faites', icon: 'habit', color: 'text-pink-400' },
];
</script>

<template>
  <section class="space-y-4">
    <!-- Header -->
    <header
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 glass px-5 py-4 shadow-soft"
    >
      <div class="min-w-0">
        <h1 class="text-base font-semibold tracking-tight">Dashboard</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Focus instantané — intégrations, métriques, suggestions.
        </p>
      </div>
      <BaseButton
        variant="secondary"
        size="sm"
        :loading="status.busy"
        @click="status.refresh"
      >
        <svg
          class="size-3.5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1.5 8A6.5 6.5 0 0 1 13.5 4.5M14.5 8A6.5 6.5 0 0 1 2.5 11.5" />
          <path d="M13.5 1.5v3h-3M2.5 14.5v-3h3" />
        </svg>
        Sync
      </BaseButton>
    </header>

    <!-- Metrics grid -->
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <template v-if="!status.snapshot && status.busy">
        <BaseCard v-for="i in 4" :key="i" class="p-4">
          <BaseSkeleton class="h-4 w-3/4" />
          <BaseSkeleton class="mt-3 h-8 w-1/2" />
        </BaseCard>
      </template>
      <template v-else>
        <BaseCard
          v-for="m in metricConfigs"
          :key="m.key"
          class="flex items-center gap-3 p-4 transition hover:border-border/70"
        >
          <div
            class="grid shrink-0 place-items-center rounded-xl bg-muted/50 p-2.5"
            :class="m.color"
          >
            <svg class="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="m.icon === 'check'" d="M3 10.5L7.5 15 17 5.5" />
              <path v-else-if="m.icon === 'cart'" d="M2 2h2l2.5 10h8L17 6H5.5M8 17.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zM15 17.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z" />
              <path v-else-if="m.icon === 'note'" d="M13 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7L13 3zM13 3v4h4" />
              <path v-else-if="m.icon === 'mail'" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5zM2 5l8 7 8-7" />
              <path v-else-if="m.icon === 'bell'" d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5H2.5L4 11V8a6 6 0 0 1 6-6zM8 17a2 2 0 0 0 4 0" />
              <path v-else-if="m.icon === 'habit'" d="M5 10l3 3 7-7M3 17h14" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-xs text-muted-foreground">{{ m.label }}</p>
            <p class="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">
              {{ status.snapshot?.metrics[m.key] ?? '—' }}
            </p>
          </div>
        </BaseCard>
      </template>
    </div>

    <!-- Main grid -->
    <div class="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <!-- Focus -->
      <BaseCard class="p-5">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Focus
        </p>
        <div class="mt-4 space-y-3">
          <!-- Next event -->
          <div class="rounded-xl border border-border/50 bg-muted/20 p-3.5">
            <p class="text-[11px] font-medium text-muted-foreground/60">Prochain rendez-vous</p>
            <p
              class="mt-1 font-semibold"
              :class="status.snapshot?.focus.nextEvent ? 'text-foreground' : 'text-muted-foreground/40'"
            >
              {{ status.snapshot?.focus.nextEvent?.title ?? '—' }}
            </p>
            <p v-if="status.snapshot?.focus.nextEvent?.when" class="mt-0.5 text-xs text-muted-foreground/70">
              {{ status.snapshot.focus.nextEvent.when }}
            </p>
          </div>

          <!-- Active mission -->
          <div class="rounded-xl border border-border/50 bg-muted/20 p-3.5">
            <p class="text-[11px] font-medium text-muted-foreground/60">Mission active</p>
            <p
              class="mt-1 font-semibold"
              :class="status.snapshot?.focus.activeMission ? 'text-foreground' : 'text-muted-foreground/40'"
            >
              {{ status.snapshot?.focus.activeMission?.objective ?? '—' }}
            </p>
            <p v-if="status.snapshot?.focus.activeMission?.nextStep" class="mt-0.5 text-xs text-muted-foreground/70">
              {{ status.snapshot.focus.activeMission.nextStep }}
            </p>
          </div>

          <!-- Top email -->
          <div class="rounded-xl border border-border/50 bg-muted/20 p-3.5">
            <p class="text-[11px] font-medium text-muted-foreground/60">Email prioritaire</p>
            <p
              class="mt-1 font-semibold"
              :class="status.snapshot?.focus.topUnreadEmail ? 'text-foreground' : 'text-muted-foreground/40'"
            >
              {{ status.snapshot?.focus.topUnreadEmail?.subject ?? '—' }}
            </p>
            <p v-if="status.snapshot?.focus.topUnreadEmail?.from" class="mt-0.5 text-xs text-muted-foreground/70">
              {{ status.snapshot.focus.topUnreadEmail.from }}
            </p>
          </div>
        </div>
      </BaseCard>

      <div class="space-y-4">
        <!-- Integrations -->
        <BaseCard class="p-5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Intégrations
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <BaseBadge
              :tone="status.snapshot?.integrations.googleConnected ? 'ok' : 'warn'"
              :dot="true"
            >
              Google
            </BaseBadge>
            <BaseBadge
              :tone="status.snapshot?.integrations.calendarConnected ? 'ok' : 'warn'"
              :dot="true"
            >
              Calendar
            </BaseBadge>
            <BaseBadge
              :tone="status.snapshot?.integrations.gmailConnected ? 'ok' : 'warn'"
              :dot="true"
            >
              Gmail
            </BaseBadge>
            <BaseBadge tone="muted" :dot="false">
              {{ status.snapshot?.providers.web || 'web —' }}
            </BaseBadge>
          </div>
        </BaseCard>

        <!-- Quick actions -->
        <BaseCard class="p-5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Actions rapides
          </p>
          <div v-if="status.busy && !status.snapshot" class="mt-3 space-y-2">
            <BaseSkeleton class="h-9 w-full" />
            <BaseSkeleton class="h-9 w-full" />
          </div>
          <div v-else class="mt-3 space-y-1.5">
            <button
              v-for="qa in status.snapshot?.quickActions ?? []"
              :key="qa.title"
              type="button"
              class="flex w-full items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-left text-xs transition hover:bg-muted/50 disabled:opacity-50"
              :disabled="!qa.enabled || (!qa.prompt && !qa.href)"
              @click="
                qa.href
                  ? openHref(qa.href)
                  : qa.prompt
                    ? runPrompt(qa.prompt)
                    : undefined
              "
            >
              <span class="font-medium">{{ qa.title }}</span>
              <span v-if="qa.badge" class="text-muted-foreground/60">{{ qa.badge }}</span>
            </button>
            <div
              v-if="!(status.snapshot?.quickActions?.length)"
              class="py-4 text-center text-xs text-muted-foreground/40"
            >
              Aucune action disponible
            </div>
          </div>
        </BaseCard>

        <!-- Suggestions proactives -->
        <BaseCard class="p-5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Suggestions
          </p>
          <div
            v-if="!(status.snapshot?.proactiveSuggestions?.length)"
            class="mt-3 py-3 text-center text-sm text-muted-foreground/50"
          >
            Rien d'urgent pour l'instant.
          </div>
          <div v-else class="mt-3 space-y-2">
            <div
              v-for="s in status.snapshot?.proactiveSuggestions ?? []"
              :key="s.title + (s.prompt ?? '')"
              class="rounded-xl border border-border/50 bg-muted/20 p-3"
            >
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold">{{ s.title }}</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">{{ s.detail }}</p>
                </div>
                <BaseBadge
                  :tone="s.tone === 'critical' ? 'critical' : s.tone === 'warn' ? 'warn' : 'ok'"
                >
                  {{ s.tone }}
                </BaseBadge>
              </div>
              <div v-if="s.prompt || s.href" class="mt-2.5 flex flex-wrap gap-2">
                <BaseButton
                  v-if="s.prompt"
                  size="sm"
                  variant="secondary"
                  @click="runPrompt(s.prompt)"
                >
                  Lancer
                </BaseButton>
                <BaseButton
                  v-if="s.href"
                  size="sm"
                  variant="ghost"
                  @click="openHref(s.href)"
                >
                  Ouvrir
                </BaseButton>
              </div>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- Reminders + Habits -->
    <div class="grid gap-4 lg:grid-cols-2">
      <ReminderWidget
        :reminders="status.snapshot?.upcomingReminders ?? []"
        :loading="status.busy"
      />
      <HabitWidget
        :habits="status.snapshot?.habits ?? []"
        :loading="status.busy"
      />
    </div>
  </section>
</template>
