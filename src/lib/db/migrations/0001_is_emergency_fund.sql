-- Migration: Replace goal_type enum with is_emergency_fund boolean
-- This migration preserves existing Emergency Fund goals by migrating them to isEmergencyFund = true

-- Step 1: Add is_emergency_fund column with default false
ALTER TABLE `goals` ADD COLUMN `is_emergency_fund` integer DEFAULT false NOT NULL;

-- Step 2: Migrate existing Emergency Fund goals to isEmergencyFund = true
UPDATE `goals` SET `is_emergency_fund` = 1 WHERE `goal_type` = 'emergency-fund';

-- Step 3: Drop the goal_type column (no longer needed)
ALTER TABLE `goals` DROP COLUMN `goal_type`;
