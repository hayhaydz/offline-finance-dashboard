import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
    host: '0.0.0.0',
    hmr: {
      clientPort: 5173
    },
		watch: {
			ignored: [
				'**/node_modules/@node-rs/**',
				'**/VERSION_HISTORY.md',
				'**/docs/**',
				'**/.planning/**',
				'**/*.log'
			]
		}
	}
});
