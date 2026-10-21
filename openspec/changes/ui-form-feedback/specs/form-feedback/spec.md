# form-feedback Delta

## ADDED Requirements

### Requirement: Enhanced forms never fail silently
Every form using the shared enhance handler SHALL surface visible feedback for success, failure (4xx `fail()`), and error (thrown/5xx) outcomes, and SHALL follow action redirects via the framework's apply/update path.

#### Scenario: Action throws a 500
- **WHEN** an enhanced form's action throws
- **THEN** the form shows a failure message (no silent no-op)

#### Scenario: Action redirects
- **WHEN** an enhanced form's action returns a redirect
- **THEN** the client navigates to the redirect target

### Requirement: Destructive confirmations are typed and server-enforced
Goal archive/deletion confirmations SHALL require typing the target's name, enforced server-side (mismatch → `fail(400)`), with the failure rendered on the page.

#### Scenario: Wrong typed name
- **WHEN** the typed confirmation does not match the goal name
- **THEN** the archive action fails with a visible error and the goal is unchanged

### Requirement: Router state changes only via framework navigation
Client code SHALL NOT call `history.pushState` to change app URLs; pagination and filters SHALL use composables built on `goto`/SvelteKit navigation.

#### Scenario: Paginating budget history
- **WHEN** the user pages the budgets history table
- **THEN** the URL, router state, and loaded data agree on the requested page
