<script lang="ts">
	import Layout from "../../src/routes/+layout.svelte";
</script>

<!-- test fixture: renders the app layout with an empty default slot.
     data/user come from page state (mocked in the test), the layout's
     `data` prop only carries what page.data already provides. -->
<Layout
	data={{
		user: null,
		environment: { mode: "development", isProduction: false, hasEncryption: true }
	}}
>
	<span data-testid="page-content">content</span>
</Layout>
