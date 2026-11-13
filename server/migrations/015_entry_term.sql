-- Migration 015: Add entry_term to user_profiles.
-- Some students start in semester 1, others in semester 2.
ALTER TABLE user_profiles ADD COLUMN entry_term TEXT DEFAULT '1';
