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
			user: locals.user,
			session: locals.session
		};
	};
</svelte:server>

<div class="max-w-[900px] mx-auto p-8">
	<header class="flex justify-between items-center border-b border-gray-300 pb-4 mb-8">
		<div>
			<h1 class="m-0">Profile</h1>
			<p class="mt-2 mb-0">Your account information and session details</p>
		</div>
		<a href="/accounts" class="bracket-link">Back to Accounts</a>
	</header>

	<main>
		<!-- USER INFO SECTION -->
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>USER INFORMATION</span>
			</div>
			<div class="bg-gray-50 p-4 border-b border-black">
				<div class="flex justify-between my-1">
					<span><strong>Username:</strong></span>
					<span>{data.user?.username}</span>
				</div>
				<div class="flex justify-between my-1">
					<span><strong>User ID:</strong></span>
					<span>{data.user?.id}</span>
				</div>
			</div>
		</section>

		<!-- SESSION INFO SECTION -->
		<section class="mb-8">
			<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
				<span>SESSION INFORMATION</span>
			</div>
			<div class="bg-gray-50 p-4 border-b border-black">
				<div class="flex justify-between my-1">
					<span><strong>Session created:</strong></span>
					<span>{data.session?.createdAt ? new Date(data.session.createdAt).toLocaleString() : 'N/A'}</span>
				</div>
				<div class="flex justify-between my-1">
					<span><strong>Last activity:</strong></span>
					<span>{data.session?.lastActivity ? new Date(data.session.lastActivity).toLocaleString() : 'N/A'}</span>
				</div>
			</div>
		</section>
	</main>
</div>
