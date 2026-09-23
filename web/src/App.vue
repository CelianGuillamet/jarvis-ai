<script setup lang="ts">
import AuthGate from "@/features/auth/AuthGate.vue";
import AppShell from "@/layouts/AppShell.vue";
import ToastViewport from "@/shared/ui/ToastViewport.vue";
</script>

<template>
  <AuthGate>
    <AppShell>
      <RouterView />
    </AppShell>
    <ToastViewport />
  </AuthGate>
</template>
