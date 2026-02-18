-- Initialize sortOrder for existing goals based on current order
-- This sets sortOrder to 0, 1, 2, etc. for active goals in order of creation
UPDATE goals 
SET sort_order = (
  SELECT row_number() OVER (ORDER BY created_at) - 1
  FROM goals as g2
  WHERE g2.deleted_at IS NULL AND g2.id = goals.id
)
WHERE deleted_at IS NULL;
