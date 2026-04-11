<script lang="ts">
	interface Section {
		id: string;
		label: string;
	}

	let {
		sections
	}: {
		sections: Section[];
	} = $props();

	let activeSection = $state<string>('');
	let navEl: HTMLElement | undefined = $state();

	$effect(() => {
		if (sections.length <= 1) return;

		activeSection = sections[0].id;

		const scrollRoot = navEl?.closest('.scrollable-content') ?? undefined;

		const observers: IntersectionObserver[] = [];

		for (const section of sections) {
			const el = document.getElementById(section.id);
			if (!el) continue;

			const observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							activeSection = section.id;
						}
					}
				},
				{
					root: scrollRoot,
					rootMargin: '-5% 0px -85% 0px'
				}
			);

			observer.observe(el);
			observers.push(observer);
		}

		return () => {
			for (const o of observers) o.disconnect();
		};
	});

	function scrollToSection(id: string) {
		const el = document.getElementById(id);
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		activeSection = id;
	}
</script>

{#if sections.length > 1}
	<div
		bind:this={navEl}
		class="flex items-center gap-4 bg-gray-100 border-b border-gray-400 px-2 py-1 sticky top-0 z-10"
	>
		{#each sections as section}
			<button
				class="bracket-link text-xs"
				class:bg-black={activeSection === section.id}
				class:text-white={activeSection === section.id}
				onclick={() => scrollToSection(section.id)}
			>
				{section.label}
			</button>
		{/each}
	</div>
{/if}
