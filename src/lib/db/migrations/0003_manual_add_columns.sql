-- Add new columns to accounts table
ALTER TABLE accounts ADD COLUMN minimumPaymentType text DEFAULT 'flat' NOT NULL;
ALTER TABLE accounts ADD COLUMN minimumPaymentFlat integer DEFAULT 0 NOT NULL;
ALTER TABLE accounts ADD COLUMN minimumPaymentPercentage integer DEFAULT 0 NOT NULL;
ALTER TABLE accounts ADD COLUMN creditLimit integer;
ALTER TABLE accounts ADD COLUMN originalPrincipal integer;