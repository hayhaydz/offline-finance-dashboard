<script lang="ts">
	import { SettingsSectionNav } from '$lib/components/ui/index';

	let { data } = $props();
	const sections = [
		{ id: 'section-user-info', label: 'User Info' },
		{ id: 'section-session', label: 'Session' },
		{ id: 'section-rls', label: 'RLS' }
	];
</script>

<main>
		<SettingsSectionNav {sections} />

		<!-- USER INFO SECTION -->
	<section id="section-user-info" style="scroll-margin-top: 2.5rem;">
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
			<div class="flex justify-between my-1">
				<span><strong>Account created:</strong></span>
				<span>{data.user?.createdAt ? new Date(data.user.createdAt).toLocaleString() : 'N/A'}</span>
			</div>
		</div>
	</section>

	<!-- SESSION INFO SECTION -->
	<section id="section-session" style="scroll-margin-top: 2.5rem;">
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>SESSION INFORMATION</span>
		</div>
		<div class="bg-gray-50 p-4 border-b border-black">
			<div class="flex justify-between my-1">
				<span><strong>Session ID:</strong></span>
				<span>{data.session?.id || 'N/A'}</span>
			</div>
			<div class="flex justify-between my-1">
				<span><strong>Session token:</strong></span>
				<span>{data.session?.token ? data.session.token.substring(0, 16) + '...' : 'N/A'}</span>
			</div>
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

	<!-- SECURITY INFO SECTION -->
	<section id="section-rls" style="scroll-margin-top: 2.5rem;">
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>ROW-LEVEL SECURITY</span>
		</div>
		<div class="bg-gray-50 p-4">
			<h2 class="mt-0 mb-2">How Row-Level Security Works</h2>
			<ol class="leading-relaxed mb-4">
				<li>
					<strong>Session validation:</strong> Every request validates the session token and
					populates <code class="bg-gray-100 p-1 px-2 rounded font-mono">data.user</code> with the user's ID.
				</li>
				<li>
					<strong>Query filtering:</strong> All database queries include a
					<code class="bg-gray-100 p-1 px-2 rounded font-mono">where: eq(table.userId, data.user.id)</code> clause.
				</li>
				<li>
					<strong>Access validation:</strong> After retrieving data, we verify
					<code class="bg-gray-100 p-1 px-2 rounded font-mono">resource.userId === data.user.id</code> before allowing access.
				</li>
				<li>
					<strong>Generic errors:</strong> Access attempts return generic "not found" errors
					instead of revealing that other users' data exists.
				</li>
			</ol>

			<h2 class="mt-4 mb-2">Testing Multi-User Isolation</h2>
			<p>To test row-level security:</p>
			<ol class="leading-relaxed">
				<li>Register a second user (<a href="/register" class="text-blue-600 underline">/register</a>)</li>
				<li>Log in as the second user</li>
				<li>Notice you only see the second user's data</li>
				<li>Log out and log back in as the first user</li>
				<li>Notice you still only see the first user's data</li>
			</ol>
			<div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
				Users cannot access each other's data even if they guess URLs or IDs. Row-level
				security is enforced at the database query layer.
			</div>
		</div>
	</section>
</main>
