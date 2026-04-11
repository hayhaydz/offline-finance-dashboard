<script lang="ts">
	import ImportWizard from "$lib/components/import-wizard/import-wizard.svelte";

	let { data, form } = $props<{
		data: {
			user: { id: number; username: string };
			accounts: Array<{ id: number; slug: string; name: string; type: string }>;
			categories: Array<{ key: string; name: string }>;
		};
		form?: any;
	}>();
</script>

<main>
	<section>
		<div class="font-bold flex justify-between bg-gray-100 border-b border-black p-2">
			<span>SETTINGS / DATA MANAGEMENT</span>
		</div>

		<ImportWizard
			accounts={data.accounts}
			categories={data.categories}
			{form}
		/>
	</section>
</main>
