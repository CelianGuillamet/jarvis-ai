<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '@/stores/appStore';
import { useStatusStore } from '@/stores/statusStore';

const route = useRoute();
const app = useAppStore();
const status = useStatusStore();

type NavItem = {
  to: string;
  label: string;
  hint: string;
  icon: 'chat' | 'dashboard' | 'inbox' | 'settings';
};

const items: NavItem[] = [
  { to: '/chat', label: 'Chat', hint: 'Dialogue & actions', icon: 'chat' },
  { to: '/dashboard', label: 'Dashboard', hint: 'Focus & signaux', icon: 'dashboard' },
  { to: '/inbox-zero', label: 'Inbox Zero', hint: 'Email triage', icon: 'inbox' },
  { to: '/settings', label: 'Settings', hint: 'Session & config', icon: 'settings' },
];

const currentPath = computed(() => route.path);
const isActive = (to: string) => currentPath.value.startsWith(to);
const isOnline = computed(() => !!status.snapshot);
</script>

<template>
  <div class="min-h-dvh bg-background">
    <div
      class="relative mx-auto grid max-w-screen-xl grid-cols-1 gap-4 p-3 lg:grid-cols-[260px_1fr] lg:p-4"
    >
      <!-- Sidebar -->
      <aside
        class="flex flex-col rounded-2xl border border-border/50 bg-card/60 glass shadow-elevated lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]"
      >
        <!-- Brand -->
        <div class="flex items-center gap-3 px-4 pb-3 pt-4">
          <div class="relative shrink-0">
            <div
              class="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-muted ring-1 ring-primary/20"
            >
              <span class="text-sm font-bold text-gradient">J</span>
            </div>
            <span
              v-if="isOnline"
              class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-emerald-400"
              aria-label="Connecté"
            />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold tracking-tight">Jarvis</div>
            <div class="truncate text-xs text-muted-foreground">
              {{ app.sessionId || 'default' }}
            </div>
          </div>
        </div>

        <!-- Divider -->
        <div class="mx-4 mb-2 h-px bg-border/40" />

        <!-- Navigation -->
        <nav class="flex-1 space-y-0.5 px-2" role="navigation" aria-label="Navigation principale">
          <RouterLink
            v-for="item in items"
            :key="item.to"
            :to="item.to"
            class="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150"
            :class="
              isActive(item.to)
                ? 'bg-primary/10 text-foreground ring-1 ring-primary/15'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            "
            :aria-current="isActive(item.to) ? 'page' : undefined"
          >
            <!-- Left accent bar -->
            <Transition name="bar">
              <span
                v-if="isActive(item.to)"
                class="absolute left-0 h-5 w-0.5 rounded-r-full bg-primary"
                aria-hidden="true"
              />
            </Transition>

            <!-- Icon -->
            <span
              class="shrink-0 transition-opacity"
              :class="isActive(item.to) ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'"
              aria-hidden="true"
            >
              <svg
                v-if="item.icon === 'chat'"
                class="size-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-4 3V5z" />
              </svg>
              <svg
                v-else-if="item.icon === 'dashboard'"
                class="size-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              >
                <rect x="2" y="2" width="7" height="7" rx="1.5" />
                <rect x="11" y="2" width="7" height="7" rx="1.5" />
                <rect x="2" y="11" width="7" height="7" rx="1.5" />
                <rect x="11" y="11" width="7" height="7" rx="1.5" />
              </svg>
              <svg
                v-else-if="item.icon === 'inbox'"
                class="size-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 3h14v10l-3 3H6l-3-3V3z" />
                <path d="M3 10h4l2 2h2l2-2h4" />
              </svg>
              <svg
                v-else-if="item.icon === 'settings'"
                class="size-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              >
                <circle cx="10" cy="10" r="2.8" />
                <path
                  d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"
                />
              </svg>
            </span>

            <span class="font-medium">{{ item.label }}</span>
            <span
              class="ml-auto hidden text-xs text-muted-foreground/60 group-hover:block"
            >{{ item.hint }}</span>
          </RouterLink>
        </nav>

        <!-- Footer tip -->
        <div class="m-3 rounded-xl border border-border/40 bg-muted/20 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Astuce
          </p>
          <p class="mt-1 text-xs leading-relaxed text-muted-foreground/60">
            "Briefing du jour" · "Mes todos" · "Météo Paris"
          </p>
        </div>
      </aside>

      <!-- Main content -->
      <main class="min-w-0">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.bar-enter-active,
.bar-leave-active {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.bar-enter-from,
.bar-leave-to {
  transform: scaleY(0);
  opacity: 0;
}
</style>
