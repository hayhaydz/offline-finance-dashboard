### Requirement: Ledger honours type and month query prefilters
The account detail ledger SHALL accept `type` and `month` query params, filtering the displayed transactions accordingly, with the active filter visibly indicated and clearable; params SHALL NOT persist in stored state.

#### Scenario: Type prefilter from an alert link
- **WHEN** the ledger loads with `?type=transfer_in&month=2026-09`
- **THEN** only that month's `transfer_in` rows display, month totals remain the full month's totals, and the filter chip offers clearing

#### Scenario: Invalid filter values ignored
- **WHEN** the ledger loads with `?type=not-a-type`
- **THEN** the param is ignored and the unfiltered month renders
