import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'labs',
      component: () => import('./views/LabSelectorView.vue'),
    },
    {
      path: '/labs/seclab',
      name: 'seclab',
      component: () => import('./views/SecLabWorkspace.vue'),
    },
    {
      path: '/labs/pwnhub',
      name: 'pwnhub',
      component: () => import('./views/PwnHubWorkspace.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
