<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		PALETTE_COMMANDS,
		dynamicPaletteCommands,
		filterCommands,
	} from '$lib/utils/command-palette';
	import { captureFocus } from '$lib/utils/overlay-focus';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let query = $state('');
	let activeIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	const commands = $derived([...dynamicPaletteCommands(), ...PALETTE_COMMANDS]);
	const results = $derived(filterCommands(commands, query));

	// Keep the highlight inside the filtered list
	$effect(() => {
		if (activeIndex >= results.length) activeIndex = 0;
	});

	let restoreFocus: (() => void) | null = null;

	$effect(() => {
		if (open) {
			// a11y: remember the trigger, focus the input once mounted
			restoreFocus = captureFocus();
			query = '';
			activeIndex = 0;
			requestAnimationFrame(() => inputEl?.focus());
		}
	});

	function close() {
		open = false;
		restoreFocus?.();
		restoreFocus = null;
	}

	function run(cmd: (typeof commands)[number] | undefined) {
		if (!cmd) return;
		close();
		goto(cmd.href);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = (activeIndex + 1) % Math.max(results.length, 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex =
				(activeIndex - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			run(results[activeIndex]);
		}
	}

	function onWindowKeydown(e: KeyboardEvent) {
		// ⌘K / Ctrl+K toggles (and swallows the browser's own ⌘K)
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			open = !open;
			return;
		}
		onKeydown(e);
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<div class="fixed inset-0 z-50 no-print" role="dialog" aria-modal="true" aria-label="Command palette">
		<!-- click-away backdrop -->
		<button
			type="button"
			class="absolute inset-0 w-full h-full cursor-default bg-black/30"
			aria-label="Close command palette"
			onclick={close}
		></button>
		<div class="relative max-w-xl mx-auto mt-24 border border-black bg-white shadow-hard font-mono">
			<div class="border-b border-black p-2 flex items-center gap-2">
				<span class="text-xs font-bold">&gt;</span>
				<input
					bind:this={inputEl}
					bind:value={query}
					onkeydown={onKeydown}
					type="text"
					placeholder="type to jump…"
					aria-label="Command palette search"
					class="w-full text-sm outline-none bg-transparent"
				/>
				<button type="button" class="bracket-link text-xs" onclick={close}>[Esc]</button>
			</div>
			<ul role="listbox" aria-label="Commands" class="max-h-80 overflow-y-auto">
				{#each results as cmd, i (cmd.id)}
					<li role="option" aria-selected={i === activeIndex}>
						<button
							type="button"
							class="w-full text-left px-2 py-1 text-sm flex justify-between items-center {i === activeIndex ? 'bg-black text-white' : 'hover:bg-gray-100'}"
							onclick={() => run(cmd)}
							onpointerenter={() => (activeIndex = i)}
						>
							<span>{cmd.label}</span>
							<span class="text-[10px] {i === activeIndex ? 'text-gray-300' : 'text-gray-500'}">{cmd.section}</span>
						</button>
					</li>
				{/each}
				{#if results.length === 0}
					<li class="px-2 py-1 text-xs text-gray-500">no matches</li>
				{/if}
			</ul>
			<div class="border-t border-black px-2 py-1 text-[10px] text-gray-500 flex gap-3">
				<span>[↑↓] navigate</span>
				<span>[enter] open</span>
				<span>[esc] close</span>
				<span>[⌘K] toggle</span>
			</div>
		</div>
	</div>
{/if}
