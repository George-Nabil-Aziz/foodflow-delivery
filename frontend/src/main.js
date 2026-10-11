import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index.js';
import { useAuthStore } from './stores/auth.store.js';
import './assets/main.css';

const app = createApp(App);
app.use(createPinia());

// Restore the session before the first navigation, so a refresh on a guarded
// route does not bounce the user to login.
useAuthStore().restore();

app.use(router);
app.mount('#app');
