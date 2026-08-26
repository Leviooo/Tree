import { createRouter, createWebHistory } from 'vue-router'
import WordEditorView from '@/views/WordEditorView.vue'
import Test from '@/views/Test.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'index',
      component: Test,
    },
    {
      path: '/world',
      name: 'word-editor',
      component: WordEditorView,
    }
  ],
})

export default router
