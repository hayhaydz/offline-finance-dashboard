
### Requirement: Inactivity logout fires exactly once at the configured timeout
The client session timer SHALL fire expiry exactly once per session when the configured inactivity timeout elapses without activity, SHALL re-arm when the timeout setting changes, and SHALL treat clicks, key presses, and form submissions as activity. Expiry SHALL both end the session and trigger data sealing: the DataKey is wiped from memory and the app returns to sealed state as part of the same single expiry event.

#### Scenario: Idle expiry
- **WHEN** no activity occurs for the configured timeout
- **THEN** exactly one expiry event fires, the user is logged out, and the app is sealed (data key wiped, subsequent data requests route to the unlock ceremony)

#### Scenario: Timeout change re-arms
- **WHEN** the user changes their inactivity timeout mid-session
- **THEN** the running timer reschedules to the new deadline

### Requirement: Expiry never races in-flight form posts
While a form submission is in flight, expiry SHALL be deferred until the post settles, then fire if still past deadline — the user SHALL never lose a submitted action to a logout race. Form posts SHALL NOT reset the idle timer; only pointer and keyboard interaction constitute activity. The deferred expiry SHALL seal (wipe the DataKey) after the post completes, in the same ordering as the logout.

#### Scenario: Post in flight at deadline
- **WHEN** the deadline passes while a form post is in flight
- **THEN** logout and sealing are deferred until the post completes and its response is handled

#### Scenario: Posts do not extend the session
- **WHEN** submissions occur but no pointer or keyboard activity has happened for the configured timeout
- **THEN** expiry fires after the latest post settles, despite the posting, and seals the app

### Requirement: Expiry warning shows a countdown
The pre-expiry warning SHALL display a live countdown during its final phase with "stay signed in" and "log out" actions.

#### Scenario: Countdown
- **WHEN** the session is within the warning window
- **THEN** a visible countdown ticks down and "stay signed in" extends the session without navigation

### Requirement: Server-side expiry redirects with reason and return URL
When the server rejects a request due to session expiry or sealed state, the user SHALL be redirected to the unlock ceremony with a stated reason, and after a successful unlock SHALL return to the URL they were on (no silent redirects).

#### Scenario: Expired mid-navigation
- **WHEN** a navigation request is rejected as session-expired
- **THEN** the unlock page renders a "session expired" message and successful unlock returns to the original URL

#### Scenario: Sealed request mid-navigation
- **WHEN** a navigation request arrives while the app is sealed (e.g. after server restart)
- **THEN** the unlock page renders with a stated reason and successful unlock returns to the original URL
