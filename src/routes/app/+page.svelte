<script lang="ts">
	import { page } from '$app/stores';
	let { data } = $props();
</script>

<div class="max-w-[900px] mx-auto p-8">
	<header class="flex justify-between items-center border-b border-gray-300 pb-4 mb-8">
		<div>
			<h1 class="m-0">Offline Finance Dashboard</h1>
			<p class="mt-2 mb-0">Welcome, <strong>{data.user?.username}</strong>! (User ID: {data.user?.id})</p>
		</div>
		<nav>
			<form method="POST" action="/logout?/logout">
				<button type="submit" class="p-2 px-4 bg-black text-white border-none cursor-pointer">Log Out</button>
			</form>
		</nav>
	</header>

	<main>
		<section class="mb-8">
			<h2 class="mb-2">Your Session</h2>
			<div class="bg-gray-50 p-4 rounded my-4">
				<p class="my-1"><strong>Username:</strong> {data.user?.username}</p>
				<p class="my-1"><strong>User ID:</strong> {data.user?.id}</p>
				<p class="my-1">
					<strong>Session created:</strong>
					{data.session?.createdAt ? new Date(data.session.createdAt).toLocaleString() : 'N/A'}
				</p>
				<p class="my-1">
					<strong>Last activity:</strong>
					{data.session?.lastActivity
						? new Date(data.session.lastActivity).toLocaleString()
						: 'N/A'}
				</p>
			</div>
		</section>

		<section class="mb-8">
			<h2 class="mb-2">Multi-User Security</h2>
			<p>
				This application supports multiple users with complete data isolation. Each user can only
				access their own data, enforced by row-level security.
			</p>
			<ul class="leading-relaxed">
				<li>All database queries filter by <code class="bg-gray-100 p-1 px-2 rounded font-mono">user_id</code></li>
				<li>Sessions are isolated per user</li>
				<li>Cross-user data access is blocked at the query layer</li>
			</ul>
		</section>

		<section class="mb-8">
			<h2 class="mb-2">Phase 1 Complete</h2>
			<p>The Secure Foundation phase is complete. You can now:</p>
			<ul class="leading-relaxed">
				<li>Register new users with username/password and TOTP MFA</li>
				<li>Log in with multi-factor authentication</li>
				<li>Maintain secure sessions with HTTP-only cookies</li>
				<li>Log out and invalidate sessions</li>
				<li>Experience complete data isolation between users</li>
			</ul>
			<p>
				<a href="/app/users" class="text-blue-600 underline">View Multi-User Demo</a>
				to see row-level security in action.
			</p>
			<p class="mt-8">
				<em>Next phases will add account management, net worth tracking, and more.</em>
			</p>
		</section>
	</main>
</div>
