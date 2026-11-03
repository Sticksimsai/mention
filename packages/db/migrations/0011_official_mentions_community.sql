-- Official prelaunch community. This does not launch a token or send funds.
INSERT INTO communities
  (id,name,ticker,ca,status,pfp_url,banner_url,details,owner_id,website,twitter_url,is_example,launched_via_tribes)
VALUES
  ('54e0a99c-117a-4f96-8fe9-8e83a49075af','Mentions','MENTIONS',
   'BJUFxaSPF5S1K9rPayANzWQNjqkCjq3yWheKrMxdpump','approved',
   'https://getmentions.xyz/brand/mention-still.webp',
   'https://getmentions.xyz/brand/community-banner.svg',
   'The official Mentions community. Bringing back community-backed tokens. Prelaunch: the token is not trading yet.',
   'b4104538-3fc4-4e4c-b877-47590f603528',
   'https://getmentions.xyz/t/mentions','https://x.com/tradementions',false,false);
--> statement-breakpoint
INSERT INTO community_members (community_id,user_id)
VALUES ('54e0a99c-117a-4f96-8fe9-8e83a49075af','b4104538-3fc4-4e4c-b877-47590f603528');
