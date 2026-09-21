<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';

import BaseBadge from '@/shared/ui/BaseBadge.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import BaseCard from '@/shared/ui/BaseCard.vue';
import BaseInput from '@/shared/ui/BaseInput.vue';
import BaseSkeleton from '@/shared/ui/BaseSkeleton.vue';
import BaseTextarea from '@/shared/ui/BaseTextarea.vue';
import { useAppStore } from '@/stores/appStore';
import { useInboxZeroStore } from '@/stores/inboxZeroStore';
import { useStatusStore } from '@/stores/statusStore';

import type { InboxZeroStep } from '@/core/types/inbox-zero';

const app = useAppStore();
const inbox = useInboxZeroStore();
const status = useStatusStore();

const gmailConnected = computed(
  () => status.snapshot?.integrations.gmailConnected ?? false,
);

const totalPending = computed(() => {
  const c = inbox.session?.counts;
  if (!c) return 0;
  return Object.values(c).reduce((sum, v) => sum + (v?.pending ?? 0), 0);
});

const cleanupPending = computed(() => {
  const c = inbox.session?.counts;
  if (!c) return 0;
  return (c.ignore?.pending ?? 0) + (c.newsletters?.pending ?? 0);
});

const steps = computed(() => {
  const c = inbox.session?.counts;
  return [
    { step: 'urgent' as const, label: 'Urgent', hint: 'À traiter', count: c?.urgent?.pending ?? 0 },
    { step: 'quick_wins' as const, label: 'Quick wins', hint: 'Nettoyage', count: c?.quick_wins?.pending ?? 0 },
    { step: 'schedule' as const, label: 'Planifier', hint: 'Rappels', count: c?.schedule?.pending ?? 0 },
    { step: 'cleanup' as const, label: 'Cleanup', hint: 'Newsletters', count: cleanupPending.value },
    { step: 'done' as const, label: 'Terminé', hint: 'Inbox Zero', count: 0 },
  ];
});

const connectGoogle = () => {
  const url = app.jarvis.googleAuthUrl(app.sessionId);
  window.open(url, '_blank', 'noopener,noreferrer');
};

const setStep = async (step: InboxZeroStep) => {
  await inbox.setStep(step);
};

const onKeydown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  const tag = (target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === 'Escape') {
    if (inbox.messagePanel) inbox.closeMessage();
    else inbox.clearSelection();
    return;
  }

  if (event.key === 'j' || event.key === 'ArrowDown') {
    event.preventDefault();
    inbox.moveCursor(1);
    if (inbox.messagePanel) inbox.openCursorMessage();
    return;
  }

  if (event.key === 'k' || event.key === 'ArrowUp') {
    event.preventDefault();
    inbox.moveCursor(-1);
    if (inbox.messagePanel) inbox.openCursorMessage();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    inbox.openCursorMessage();
    return;
  }

  if (event.key === ' ') {
    event.preventDefault();
    inbox.toggleCursorSelection();
    return;
  }

  if (event.key === 'a') {
    event.preventDefault();
    inbox.selectAllVisible();
    return;
  }

  const applyAction = (action: 'mark_read_archive' | 'trash' | 'star') => {
    if (inbox.hasSelection) inbox.apply(action);
    else inbox.applyToCursor(action);
  };

  if (event.key === 'e') {
    event.preventDefault();
    applyAction('mark_read_archive');
    return;
  }

  if (event.key === 't') {
    event.preventDefault();
    applyAction('trash');
    return;
  }

  if (event.key === 's') {
    event.preventDefault();
    applyAction('star');
  }
};

onMounted(async () => {
  await status.refresh();
  await inbox.loadSession();
  if (!inbox.session?.scannedAt) await inbox.scan({ refresh: true });
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section class="flex h-[calc(100dvh-2rem)] flex-col gap-3">
    <!-- Header -->
    <header class="shrink-0 rounded-2xl border border-border/50 bg-card/60 glass px-5 py-4 shadow-soft">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-base font-semibold tracking-tight">Inbox Zero</h1>
          <p class="mt-0.5 text-sm text-muted-foreground">
            Scan → classification → traitement par lots → reprise.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <BaseBadge :tone="gmailConnected ? 'ok' : 'warn'" :dot="true">
              Gmail {{ gmailConnected ? 'connecté' : 'non connecté' }}
            </BaseBadge>
            <BaseBadge :tone="totalPending > 0 ? 'warn' : 'ok'" :dot="true">
              {{ totalPending }} à traiter
            </BaseBadge>
            <BaseBadge
              v-if="inbox.session?.scannedAt"
              tone="muted"
              :dot="true"
            >
              Scanné {{ new Date(inbox.session.scannedAt).toLocaleString() }}
            </BaseBadge>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <BaseButton variant="secondary" size="sm" :loading="inbox.busy" @click="inbox.loadSession">
            Reprendre
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            :loading="inbox.busy"
            @click="inbox.scan({ refresh: true })"
          >
            Scanner
          </BaseButton>
          <BaseButton v-if="!gmailConnected" variant="primary" size="sm" @click="connectGoogle">
            Connecter Google
          </BaseButton>
        </div>
      </div>
    </header>

    <!-- Steps -->
    <BaseCard class="shrink-0 p-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in steps"
          :key="s.step"
          type="button"
          class="group flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-left text-xs transition hover:bg-muted/40"
          :class="inbox.currentStep === s.step ? 'ring-1 ring-primary/20 bg-primary/10' : ''"
          @click="setStep(s.step)"
        >
          <span class="font-semibold">{{ s.label }}</span>
          <span class="text-muted-foreground/60">{{ s.hint }}</span>
          <span
            v-if="s.step !== 'done'"
            class="ml-1 rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground/70"
          >
            {{ s.count }}
          </span>
        </button>
      </div>
    </BaseCard>

    <!-- Main grid -->
    <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_320px]">
      <!-- List -->
      <BaseCard class="flex min-h-0 flex-col overflow-hidden">
        <!-- Actions bar -->
        <div class="shrink-0 border-b border-border/40 bg-background/30 px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground/70 hover:bg-muted/40"
                @click="inbox.selectAllVisible"
              >
                Tout sélectionner (A)
              </button>
              <button
                type="button"
                class="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground/70 hover:bg-muted/40"
                @click="inbox.clearSelection"
              >
                Clear (Esc)
              </button>
              <span class="text-xs text-muted-foreground/60">
                {{ inbox.selectedCount }} sélectionné(s)
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <BaseButton
                variant="secondary"
                size="sm"
                :disabled="!inbox.hasSelection"
                :loading="inbox.busy"
                @click="inbox.apply('mark_read_archive')"
              >
                Nettoyer (E)
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="!inbox.hasSelection"
                :loading="inbox.busy"
                @click="inbox.apply('star')"
              >
                ⭐ Star + archiver (S)
              </BaseButton>
              <BaseButton
                variant="danger"
                size="sm"
                :disabled="!inbox.hasSelection"
                :loading="inbox.busy"
                @click="inbox.apply('trash')"
              >
                Corbeille (T)
              </BaseButton>
              <BaseButton
                v-if="inbox.currentStep === 'cleanup'"
                variant="ghost"
                size="sm"
                :disabled="!inbox.hasSelection"
                :loading="inbox.busy"
                @click="inbox.apply('apply_recommended')"
              >
                Reco
              </BaseButton>
            </div>
          </div>

          <div v-if="inbox.currentStep === 'schedule'" class="mt-3 flex flex-wrap items-end gap-2">
            <BaseInput
              v-model="inbox.reminderWhen"
              label="Rappel"
              placeholder="demain 9h"
              hint="Ex: demain 9h, vendredi 14h, 21/04 10:30"
              class="min-w-[240px]"
            />
            <BaseInput
              v-model="inbox.reminderText"
              label="Texte (optionnel)"
              placeholder="Relancer le client…"
              class="min-w-[280px]"
            />
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="!inbox.hasSelection || !inbox.reminderWhen.trim()"
              :loading="inbox.busy"
              @click="
                inbox.apply('remind', {
                  reminderWhen: inbox.reminderWhen.trim(),
                  ...(inbox.reminderText.trim() ? { reminderText: inbox.reminderText.trim() } : {}),
                  archiveAfter: true,
                })
              "
            >
              Rappel + archiver
            </BaseButton>
          </div>
        </div>

        <!-- List body -->
        <div class="flex-1 overflow-y-auto px-4 py-4">
          <div v-if="inbox.busy && !inbox.session" class="space-y-3">
            <BaseSkeleton class="h-10 w-full" />
            <BaseSkeleton class="h-10 w-full" />
            <BaseSkeleton class="h-10 w-5/6" />
          </div>

          <div v-else-if="!gmailConnected" class="mx-auto max-w-md text-center">
            <div class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-muted ring-1 ring-primary/20">
              <span class="text-2xl font-bold text-gradient">Z</span>
            </div>
            <h2 class="text-base font-semibold tracking-tight">Connecte Gmail</h2>
            <p class="mt-1.5 text-sm text-muted-foreground">
              Inbox Zero utilise Gmail pour scanner, classer et archiver.
            </p>
            <div class="mt-5 flex justify-center gap-2">
              <BaseButton variant="primary" size="sm" @click="connectGoogle">
                Connecter Google
              </BaseButton>
              <BaseButton variant="secondary" size="sm" @click="status.refresh">
                Rafraîchir status
              </BaseButton>
            </div>
          </div>

          <div v-else-if="!inbox.filteredItems.length" class="py-10 text-center">
            <p class="text-sm font-medium">Rien à traiter ici.</p>
            <p class="mt-1 text-xs text-muted-foreground/60">
              Passe à l’étape suivante ou relance un scan.
            </p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in inbox.filteredItems"
              :key="item.messageId"
              class="group flex cursor-pointer gap-3 rounded-2xl border border-border/50 bg-card/30 p-3 transition hover:border-border/70 hover:bg-card/50"
              :class="inbox.cursorId === item.messageId ? 'ring-1 ring-primary/20 border-primary/40 bg-primary/5' : ''"
              @click="inbox.openMessage(item.messageId)"
            >
              <input
                type="checkbox"
                class="mt-1 size-4 accent-primary"
                :checked="inbox.isSelected(item.messageId)"
                @click.stop
                @change="inbox.toggleSelection(item.messageId)"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold tracking-tight">
                      {{ item.subject }}
                    </div>
                    <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
                      <span class="truncate">{{ item.from }}</span>
                      <button
                        v-if="item.suggested"
                        type="button"
                        class="rounded-full border border-border/60 bg-muted/20 px-2 py-0.5 text-[11px] hover:bg-muted/35"
                        @click.stop="inbox.applySuggested(item)"
                      >
                        {{ item.suggested.label }}
                      </button>
                      <span v-if="item.reason" class="truncate text-muted-foreground/50">
                        {{ item.reason }}
                      </span>
                    </div>
                  </div>
                  <div class="shrink-0 text-[11px] text-muted-foreground/60">
                    {{ new Date(item.date).toLocaleString() }}
                  </div>
                </div>
                <div class="mt-2 truncate text-xs text-muted-foreground/60">
                  {{ item.snippet }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </BaseCard>

      <!-- Sidebar -->
      <aside class="hidden space-y-3 lg:flex lg:flex-col">
        <BaseCard class="p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Raccourcis clavier
          </p>
          <div class="mt-3 space-y-1.5 text-xs text-muted-foreground/70">
            <div><span class="font-mono">J/K</span> naviguer</div>
            <div><span class="font-mono">Entrée</span> ouvrir</div>
            <div><span class="font-mono">Espace</span> sélectionner</div>
            <div><span class="font-mono">A</span> sélectionner tout</div>
            <div><span class="font-mono">E</span> nettoyer (lu + archiver)</div>
            <div><span class="font-mono">T</span> corbeille</div>
            <div><span class="font-mono">S</span> star + archiver</div>
            <div><span class="font-mono">Esc</span> fermer / clear</div>
          </div>
        </BaseCard>

        <BaseCard class="min-h-0 flex-1 overflow-hidden p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Historique
          </p>
          <div class="mt-3 min-h-0 space-y-2 overflow-y-auto pr-1">
            <div
              v-for="a in inbox.recentActions"
              :key="a.id"
              class="rounded-xl border border-border/50 bg-muted/10 px-3 py-2 text-xs"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium">{{ a.actionType }}</span>
                <span class="text-[11px] text-muted-foreground/60">
                  {{ new Date(a.createdAt).toLocaleTimeString() }}
                </span>
              </div>
              <div v-if="a.errorMessage" class="mt-1 text-red-300/80">
                {{ a.errorMessage }}
              </div>
            </div>
            <div
              v-if="!inbox.recentActions.length"
              class="py-4 text-center text-xs text-muted-foreground/50"
            >
              Aucun événement
            </div>
          </div>
        </BaseCard>
      </aside>
    </div>

    <!-- Message panel -->
    <div
      v-if="inbox.messagePanel"
      class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3"
      @click.self="inbox.closeMessage"
    >
      <BaseCard class="w-full max-w-3xl overflow-hidden">
	        <div class="flex items-start justify-between gap-3 border-b border-border/40 bg-background/30 px-5 py-4">
	          <div class="min-w-0">
	            <div class="truncate text-sm font-semibold tracking-tight">
	              {{ inbox.messagePanel.message.subject }}
	            </div>
	            <div class="mt-1 text-xs text-muted-foreground/70">
	              <span class="font-medium">{{ inbox.messagePanel.message.from }}</span>
	              <span class="mx-2 text-muted-foreground/40">·</span>
	              {{ new Date(inbox.messagePanel.message.date).toLocaleString() }}
	            </div>
	          </div>
	          <div class="flex shrink-0 flex-wrap items-center gap-2">
	            <BaseButton
	              variant="secondary"
	              size="sm"
	              :loading="inbox.busy"
	              @click="inbox.applyToCursor('mark_read_archive')"
	            >
	              Nettoyer (E)
	            </BaseButton>
	            <BaseButton
	              variant="danger"
	              size="sm"
	              :loading="inbox.busy"
	              @click="inbox.applyToCursor('trash')"
	            >
	              Corbeille (T)
	            </BaseButton>
	            <BaseButton
	              variant="ghost"
	              size="sm"
	              :loading="inbox.busy"
	              @click="inbox.applyToCursor('star')"
	            >
	              ⭐ Star + archiver (S)
	            </BaseButton>
	            <BaseButton variant="ghost" size="sm" @click="inbox.closeMessage">Fermer</BaseButton>
	          </div>
	        </div>

        <div class="grid gap-3 p-5 lg:grid-cols-[1fr_320px]">
          <div class="min-h-0">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Contenu
            </p>
            <pre class="mt-2 max-h-[52dvh] overflow-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-muted/10 p-3 text-xs text-muted-foreground/80">{{ inbox.messagePanel.message.bodyText }}</pre>
          </div>

          <div class="space-y-3">
            <BaseCard class="p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Réponse
                </p>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :loading="inbox.draftBusy"
                  @click="inbox.createDraftReply(inbox.messagePanel.message.id)"
                >
                  Draft
                </BaseButton>
              </div>
              <BaseTextarea
                v-model="inbox.replyText"
                class="mt-3"
                label="Message"
                placeholder="Ta réponse…"
              />
              <div class="mt-3 flex justify-end">
                <BaseButton
                  variant="primary"
                  size="sm"
                  :disabled="!inbox.replyText.trim()"
                  :loading="inbox.busy"
                  @click="inbox.sendReply(inbox.messagePanel.message.id)"
                >
                  Envoyer + archiver
                </BaseButton>
              </div>
            </BaseCard>

            <BaseCard class="p-4">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                Planifier
              </p>
              <div class="mt-3 space-y-2">
                <BaseInput
                  v-model="inbox.reminderWhen"
                  label="Quand"
                  placeholder="demain 9h"
                />
                <BaseInput
                  v-model="inbox.reminderText"
                  label="Texte (optionnel)"
                  placeholder="Relancer…"
                />
              </div>
              <div class="mt-3 flex justify-end">
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :disabled="!inbox.reminderWhen.trim()"
                  :loading="inbox.busy"
                  @click="inbox.createReminder(inbox.messagePanel.message.id)"
                >
                  Créer rappel + archiver
                </BaseButton>
              </div>
            </BaseCard>
          </div>
        </div>
      </BaseCard>
    </div>
  </section>
</template>
