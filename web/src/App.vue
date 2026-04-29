<script setup lang="ts">
import AppShell from '@/layouts/AppShell.vue';
import ToastViewport from '@/shared/ui/ToastViewport.vue';
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
  <ToastViewport />
</template>
