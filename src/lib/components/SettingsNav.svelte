<script lang="ts">
	interface Props {
		current: 'profile' | 'security' | 'reference' | 'data';
	}

	let { current }: Props = $props();

	const tabs = [
		{ id: 'profile', label: 'Profile' },
		{ id: 'security', label: 'Security' },
		{ id: 'reference', label: 'Reference' },
		{ id: 'data', label: 'Data' }
	];
</script>

<nav class="flex justify-start gap-2 p-2 border-b border-black" aria-label="Settings navigation">
	{#each tabs as tab (tab.id)}
		<a
			href="/settings/{tab.id}"
			class="bracket-link text-xs"
			class:bg-gray-100={current === tab.id}
			class:font-bold={current === tab.id}
			aria-current={current === tab.id ? 'page' : undefined}
		>
			{tab.label}
		</a>
	{/each}
</nav>
