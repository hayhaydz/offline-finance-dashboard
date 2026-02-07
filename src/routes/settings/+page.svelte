<script lang="ts">
	import { redirect } from '@sveltejs/kit';
	import type { PageServerLoad } from './$types';

	let { data } = $props();

	export const ssr = false;
</script>

<svelte:server>
	export const load: PageServerLoad = async ({ locals }) => {
		if (!locals.user) {
			redirect(302, '/login');
		}

		return {
			user: locals.user
		};
	};
</svelte:server>

<div class="max-w-[900px] mx-auto p-8">
	<header class="flex justify-between items-center border-b border-gray-300 pb-4 mb-8">
		<div>
			<h1 class="m-0">Settings</h1>
			<p class="mt-2 mb-0">Manage your application settings and preferences</p>
		</div>
	</header>

	<main>
		<!-- PROFILE SECTION -->
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>PROFILE</span>
			</div>
			<div class="border-b border-black p-2">
				<a href="/settings/profile" class="bracket-link">View Profile</a>
			</div>
		</section>

		<!-- APPEARANCE SECTION (Placeholder) -->
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>APPEARANCE</span>
			</div>
			<div class="border-b border-black p-2">
				<p class="text-gray-600 text-xs">Theme and display options (coming soon)</p>
			</div>
		</section>

		<!-- SECURITY SECTION (Placeholder) -->
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>SECURITY</span>
			</div>
			<div class="border-b border-black p-2">
				<p class="text-gray-600 text-xs">Password and authentication settings (coming soon)</p>
			</div>
		</section>

		<!-- DATA SECTION (Placeholder) -->
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>DATA</span>
			</div>
			<div class="border-b border-black p-2">
				<p class="text-gray-600 text-xs">Data management and export options (coming soon)</p>
			</div>
		</section>
	</main>
</div>
