## ADDED Requirements

### Requirement: Recurring transaction patterns are detected and surfaced in the ledger
The transaction ledger SHALL display passive inline notes for any transaction patterns detected as recurring — same description, similar amounts, and monthly cadence across 3 or more occurrences.

#### Scenario: Recurring pattern note shown when pattern is detected
- **WHEN** a transaction description appears 3 or more times with amounts within ±10% of each other and at least 2 inter-occurrence gaps in the 28–35 day range
- **THEN** a one-line note is displayed above the ledger: `"<Description>" appears monthly (~£X.XX). Last entry: <Date>.`

#### Scenario: Multiple patterns shown as separate notes
- **WHEN** more than one recurring pattern is detected for the account
- **THEN** each pattern is shown as a separate note line above the ledger

#### Scenario: Pattern detection covers full transaction history, not just current page
- **WHEN** recurring patterns are computed
- **THEN** the detection query runs over all transactions for the account (not limited to the paginated ledger view)

#### Scenario: Short or empty descriptions are excluded from detection
- **WHEN** a transaction description is empty or 3 characters or fewer
- **THEN** it is excluded from recurring pattern detection regardless of amount or date patterns

#### Scenario: No notes shown when no patterns are detected
- **WHEN** no recurring patterns are found for the account
- **THEN** no recurring note section is rendered in the ledger

#### Scenario: Pattern amounts are displayed in pounds, rounded to 2 decimal places
- **WHEN** a recurring note is rendered
- **THEN** the representative amount is shown as `~£X.XX` (derived from the median or most recent matching transaction, divided by 100)
