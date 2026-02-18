-- Initialize sortOrder for all active goals based on creation order
-- Run this on your development database to fix goal reordering
UPDATE goals SET sort_order =
  (SELECT row_number() OVER (ORDER BY created_at) - 1
   FROM goals g2
   WHERE g2.deleted_at IS NULL AND g2.id = goals.id)
WHERE deleted_at IS NULL;

-- Verify the result
SELECT id, name, sort_order, created_at FROM goals WHERE deleted_at IS NULL ORDER BY sort_order;
