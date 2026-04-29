<template>
  <div class="flex h-[70dvh] flex-col items-center justify-center text-center">
    <div
      class="mb-6 grid size-16 place-items-center rounded-2xl border border-border/50 bg-card/60 glass text-2xl shadow-soft"
    >
      404
    </div>
    <h1 class="text-lg font-semibold tracking-tight">Page introuvable</h1>
    <p class="mt-2 text-sm text-muted-foreground">Cette vue n'existe pas.</p>
    <RouterLink
      to="/chat"
      class="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110 active:scale-95"
    >
      Ouvrir le chat
    </RouterLink>
  </div>
</template>
