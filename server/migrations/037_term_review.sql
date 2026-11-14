-- Migration 037: the term for which a student has last been asked "which of last term's
-- courses did you pass?" (server/src/trailRoutes.ts, /trail/term-check). Asked once per term.
ALTER TABLE user_profiles ADD COLUMN term_reviewed TEXT;
