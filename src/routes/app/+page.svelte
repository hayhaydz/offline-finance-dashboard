<script lang="ts">
	import { redirect } from '@sveltejs/kit';
	import type { PageServerLoad } from './$types';
</script>

<svelte:server>
	export const load: PageServerLoad = async ({ locals }) => {
		if (!locals.user) {
			redirect(302, '/login');
		}

		// Redirect to /accounts (new route)
		redirect(302, '/accounts');
	};
</svelte:server>

<!-- Redirect handled server-side -->
<div class="max-w-[900px] mx-auto p-8">
	<p>Redirecting to Accounts...</p>
</div>
