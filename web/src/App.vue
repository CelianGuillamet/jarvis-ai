<script setup lang="ts">
import { useRoute } from "vue-router";
const route = useRoute();
import AuthGate from "@/features/auth/AuthGate.vue";
import AppShell from "@/layouts/AppShell.vue";
import ToastViewport from "@/shared/ui/ToastViewport.vue";
</script>

<template>
  <RouterView v-if="route.name === 'deletion-status'" />
  <AuthGate v-else>
    <AppShell>
      <RouterView />
    </AppShell>
    <ToastViewport />
  </AuthGate>
</template>
