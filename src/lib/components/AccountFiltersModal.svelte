<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { formatAccountType } from '$lib/utils/currency';

	interface Props {
		open: boolean;
		onClose: () => void;
		institutions: string[];
	}

	let { open, onClose, institutions }: Props = $props();

	// Local state for pending changes
	let filters = $state({
		type: page.url.searchParams.get('type')?.split(',').filter(Boolean) || [] as string[],
		category: page.url.searchParams.get('category') || '',
		taxWrapper: page.url.searchParams.get('taxWrapper')?.split(',').filter(Boolean) || [] as string[],
		liquidity: page.url.searchParams.get('liquidity')?.split(',').filter(Boolean) || [] as string[],
		status: page.url.searchParams.get('status') || '',
		exclusion: page.url.searchParams.get('exclusion') || '',
		institution: page.url.searchParams.get('institution')?.split(',').filter(Boolean) || [] as string[],
		stale: page.url.searchParams.get('stale') || ''
	});

	// Accordion state
	let openSections = $state<Record<string, boolean>>({
		status: false,
		networth: false,
		category: false,
		type: true,
		wrapper: false,
		liquidity: false,
		institution: false,
		integrity: false
	});

	function toggleSection(section: string) {
		openSections[section] = !openSections[section];
	}

	// Initialize state when modal opens
	$effect(() => {
		if (open) {
			filters = {
				type: page.url.searchParams.get('type')?.split(',').filter(Boolean) || [],
				category: page.url.searchParams.get('category') || '',
				taxWrapper: page.url.searchParams.get('taxWrapper')?.split(',').filter(Boolean) || [],
				liquidity: page.url.searchParams.get('liquidity')?.split(',').filter(Boolean) || [],
				status: page.url.searchParams.get('status') || '',
				exclusion: page.url.searchParams.get('exclusion') || '',
				institution: page.url.searchParams.get('institution')?.split(',').filter(Boolean) || [],
				stale: page.url.searchParams.get('stale') || ''
			};
		}
	});

	function applyFilters() {
		const url = new URL(page.url);
		Object.entries(filters).forEach(([key, value]) => {
			if (Array.isArray(value)) {
				if (value.length > 0) url.searchParams.set(key, value.join(','));
				else url.searchParams.delete(key);
			} else {
				if (value) url.searchParams.set(key, value);
				else url.searchParams.delete(key);
			}
		});
		goto(url.toString());
		onClose();
	}

	function clearAll() {
		filters = {
			type: [], category: '', taxWrapper: [], liquidity: [],
			status: '', exclusion: '', institution: [], stale: ''
		};
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) onClose();
		if (e.key === 'Enter' && open) applyFilters();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleBackdropKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) onClose();
	}

	function toggleFilter(key: keyof typeof filters, value: string) {
		const current = filters[key];
		if (Array.isArray(current)) {
			if (value === '') {
				// "All" clicked
				(filters[key] as string[]) = [];
			} else {
				if (current.includes(value)) {
					(filters[key] as string[]) = current.filter(v => v !== value);
				} else {
					(filters[key] as string[]) = [...current, value];
				}
			}
		} else {
			filters[key] = (filters[key] === value ? '' : value) as any;
		}
	}

	function handleFilterKeydown(e: KeyboardEvent, key: keyof typeof filters, value: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			toggleFilter(key, value);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
		onclick={handleBackdropClick}
		onkeydown={handleBackdropKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="filter-modal-title"
		tabindex="-1"
	>
		<div
			class="bg-white border-2 border-black shadow-[8px_8px_0_rgba(0,0,0,0.3)] w-full max-w-md flex flex-col max-h-[90vh]"
			onclick={(e) => e.stopPropagation()}
			role="presentation"
		>
			<!-- Header -->
			<div class="bg-black text-white px-3 py-2 flex justify-between items-center font-bold">
				<span id="filter-modal-title" class="tracking-tighter">FILTER_SYSTEM // SELECT_CRITERIA</span>
				<button type="button" class="hover:bg-red-600 px-1" onclick={onClose}>[X]</button>
			</div>

			<!-- Scrollable Accordion List -->
			<div class="flex-1 overflow-y-auto border-b border-black">
				
				<!-- 01_STATUS -->
				<button class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('status')}>
					<span>01_Account_Status</span>
					<span>{openSections.status ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.status ? '1fr' : '0fr'};">
					<div class="min-h-0 border-b border-black divide-y divide-gray-100">
						{#each [{ v: '', l: 'All Accounts' }, { v: 'open', l: 'Open Only' }, { v: 'closed', l: 'Closed Only' }] as opt}
							<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50 group" onclick={() => toggleFilter('status', opt.v)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'status', opt.v)}>
								<span class="font-bold font-mono">{filters.status === opt.v ? '[X]' : '[ ]'}</span>
								<span class={filters.status === opt.v ? 'font-bold' : ''}>{opt.l}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- 02_NETWORTH -->
				<button class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('networth')}>
					<span>02_Net_Worth_Exposure</span>
					<span>{openSections.networth ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.networth ? '1fr' : '0fr'};">
					<div class="min-h-0 border-b border-black divide-y divide-gray-100">
						{#each [{ v: '', l: 'All (Inc. Excluded)' }, { v: 'included', l: 'Included Only' }, { v: 'excluded', l: 'Excluded Only' }] as opt}
							<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('exclusion', opt.v)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'exclusion', opt.v)}>
								<span class="font-bold font-mono">{filters.exclusion === opt.v ? '[X]' : '[ ]'}</span>
								<span class={filters.exclusion === opt.v ? 'font-bold' : ''}>{opt.l}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- 03_CATEGORY -->
				<button class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('category')}>
					<span>03_Category</span>
					<span>{openSections.category ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.category ? '1fr' : '0fr'};">
					<div class="min-h-0 border-b border-black divide-y divide-gray-100">
						{#each [{ v: '', l: 'All Categories' }, { v: 'asset', l: 'Assets' }, { v: 'liability', l: 'Liabilities' }] as opt}
							<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('category', opt.v)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'category', opt.v)}>
								<span class="font-bold font-mono">{filters.category === opt.v ? '[X]' : '[ ]'}</span>
								<span class={filters.category === opt.v ? 'font-bold' : ''}>{opt.l}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- 04_TYPE -->
				<button type="button" class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('type')}>
					<span>04_Account_Type (Multi)</span>
					<span>{openSections.type ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.type ? '1fr' : '0fr'};">
					<div class="min-h-0 border-b border-black divide-y divide-gray-100">
						<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('type', '')} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'type', '')}>
							<span class="font-bold font-mono">{filters.type.length === 0 ? '[X]' : '[ ]'}</span>
							<span class={filters.type.length === 0 ? 'font-bold' : ''}>All Types</span>
						</div>
						{#each ['current', 'savings', 'investment', 'credit-card', 'loan', 'mortgage'] as type}
							<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('type', type)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'type', type)}>
								<span class="font-bold font-mono">{filters.type.includes(type) ? '[X]' : '[ ]'}</span>
								<span class={filters.type.includes(type) ? 'font-bold' : ''}>{formatAccountType(type)}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- 05_WRAPPER -->
				<button type="button" class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('wrapper')}>
					<span>05_Tax_Wrapper (Multi)</span>
					<span>{openSections.wrapper ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.wrapper ? '1fr' : '0fr'};">
					<div class="min-h-0 border-b border-black divide-y divide-gray-100">
						<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('taxWrapper', '')} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'taxWrapper', '')}>
							<span class="font-bold font-mono">{filters.taxWrapper.length === 0 ? '[X]' : '[ ]'}</span>
							<span class={filters.taxWrapper.length === 0 ? 'font-bold' : ''}>All Wrappers</span>
						</div>
						{#each [{ v: 'none', l: 'None' }, { v: 'isa', l: 'ISA' }, { v: 'lisa', l: 'LISA' }] as opt}
							<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('taxWrapper', opt.v)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'taxWrapper', opt.v)}>
								<span class="font-bold font-mono">{filters.taxWrapper.includes(opt.v) ? '[X]' : '[ ]'}</span>
								<span class={filters.taxWrapper.includes(opt.v) ? 'font-bold' : ''}>{opt.l}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- 06_LIQUIDITY -->
				<button type="button" class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('liquidity')}>
					<span>06_Liquidity_Status (Multi)</span>
					<span>{openSections.liquidity ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.liquidity ? '1fr' : '0fr'};">
					<div class="min-h-0 border-b border-black divide-y divide-gray-100">
						<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('liquidity', '')} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'liquidity', '')}>
							<span class="font-bold font-mono">{filters.liquidity.length === 0 ? '[X]' : '[ ]'}</span>
							<span class={filters.liquidity.length === 0 ? 'font-bold' : ''}>Any Liquidity</span>
						</div>
						{#each [{ v: 'instant', l: 'Instant Access' }, { v: 'delayed', l: 'Delayed' }, { v: 'locked', l: 'Locked' }] as opt}
							<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('liquidity', opt.v)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'liquidity', opt.v)}>
								<span class="font-bold font-mono">{filters.liquidity.includes(opt.v) ? '[X]' : '[ ]'}</span>
								<span class={filters.liquidity.includes(opt.v) ? 'font-bold' : ''}>{opt.l}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- 07_INSTITUTION -->
				<button type="button" class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('institution')}>
					<span>07_Financial_Institution (Multi)</span>
					<span>{openSections.institution ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.institution ? '1fr' : '0fr'};">
					<div class="min-h-0 border-b border-black divide-y divide-gray-100">
						<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('institution', '')} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'institution', '')}>
							<span class="font-bold font-mono">{filters.institution.length === 0 ? '[X]' : '[ ]'}</span>
							<span class={filters.institution.length === 0 ? 'font-bold' : ''}>All Institutions</span>
						</div>
						{#each institutions as inst}
							{#if inst}
								<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('institution', inst)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'institution', inst)}>
									<span class="font-bold font-mono">{filters.institution.includes(inst) ? '[X]' : '[ ]'}</span>
									<span class={filters.institution.includes(inst) ? 'font-bold' : ''}>{inst}</span>
								</div>
							{/if}
						{/each}
					</div>
				</div>

				<!-- 08_INTEGRITY -->
				<button class="w-full text-left font-bold bg-gray-100 p-2 border-b border-black flex justify-between items-center uppercase text-xs" onclick={() => toggleSection('integrity')}>
					<span>08_Data_Integrity</span>
					<span>{openSections.integrity ? '[-]' : '[+]'}</span>
				</button>
				<div class="grid transition-all duration-200 overflow-hidden" style="grid-template-rows: {openSections.integrity ? '1fr' : '0fr'};">
					<div class="min-h-0 divide-y divide-gray-100">
						{#each [{ v: '', l: 'Any Data Age' }, { v: 'no', l: 'Up to Date Only' }, { v: 'yes', l: 'Stale Data Only (>30d)' }] as opt}
							<div class="p-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onclick={() => toggleFilter('stale', opt.v)} role="button" tabindex="0" onkeydown={(e) => handleFilterKeydown(e, 'stale', opt.v)}>
								<span class="font-bold font-mono">{filters.stale === opt.v ? '[X]' : '[ ]'}</span>
								<span class={filters.stale === opt.v ? 'font-bold' : ''}>{opt.l}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Footer Actions -->
			<div class="p-3 bg-gray-50 flex flex-col gap-2">
				<button type="button" class="w-full bg-black text-white font-bold py-2 border-2 border-black hover:bg-white hover:text-black transition-all" onclick={applyFilters}>
					APPLY_FILTERS
				</button>
				<div class="flex gap-2">
					<button type="button" class="flex-1 border border-black py-1 text-xs font-bold hover:bg-black hover:text-white transition-colors" onclick={clearAll}>
						CLEAR_ALL
					</button>
					<button type="button" class="flex-1 border border-black py-1 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors" onclick={onClose}>
						CANCEL
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
