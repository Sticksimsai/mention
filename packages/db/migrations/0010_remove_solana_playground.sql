-- Remove only the original, unlaunched example community.
-- Existing foreign keys protect any financial/challenge records from deletion.
DELETE FROM communities
WHERE id = '568e5d5e-6c6a-4617-a557-c4dfc054134d'
  AND is_example = true
  AND launched_via_tribes = false
  AND ca = 'So11111111111111111111111111111111111111112';
