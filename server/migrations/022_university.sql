-- Migration 022: remember which university a student chose at onboarding.
-- The id matches client/src/data/universities.ts (e.g. 'ru', 'cmu').
-- Everyone onboarded before this was a Ramkhamhaeng student.
ALTER TABLE user_profiles ADD COLUMN university_id TEXT;
UPDATE user_profiles SET university_id = 'ru' WHERE onboarded = 1;
