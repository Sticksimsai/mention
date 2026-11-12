-- Official prelaunch community. This does not launch a token or send funds.
-- Guarded: only seeds when the owner account exists (skipped on fresh databases).
INSERT INTO communities
  (id,name,ticker,ca,status,pfp_url,banner_url,details,owner_id,website,twitter_url,is_example,launched_via_tribes)
SELECT
  '54e0a99c-117a-4f96-8fe9-8e83a49075af','Mentions','MENTIONS',
  'BJUFxaSPF5S1K9rPayANzWQNjqkCjq3yWheKrMxdpump','approved',
  'https://getmentions.xyz/brand/mention-still.webp',
  'https://getmentions.xyz/brand/community-banner.svg',
  'The official Mentions community. Bringing back community-backed tokens. Prelaunch: the token is not trading yet.',
  'b4104538-3fc4-4e4c-b877-47590f603528',
  'https://getmentions.xyz/t/mentions','https://x.com/tradementions',false,false
WHERE EXISTS (SELECT 1 FROM users WHERE id='b4104538-3fc4-4e4c-b877-47590f603528')
  AND NOT EXISTS (SELECT 1 FROM communities WHERE id='54e0a99c-117a-4f96-8fe9-8e83a49075af');
--> statement-breakpoint
INSERT INTO community_members (community_id,user_id)
SELECT '54e0a99c-117a-4f96-8fe9-8e83a49075af','b4104538-3fc4-4e4c-b877-47590f603528'
WHERE EXISTS (SELECT 1 FROM communities WHERE id='54e0a99c-117a-4f96-8fe9-8e83a49075af')
  AND NOT EXISTS (SELECT 1 FROM community_members WHERE community_id='54e0a99c-117a-4f96-8fe9-8e83a49075af' AND user_id='b4104538-3fc4-4e4c-b877-47590f603528');
