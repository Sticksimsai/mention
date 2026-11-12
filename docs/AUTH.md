# Sign-in and permissions

There are two ways to be signed in. They unlock different things.

| | Wallet session | X sign-in (Privy) |
|---|---|---|
| How | Connect a Solana wallet, sign a free message | "Sign in with X" |
| Launch a coin | Yes | Yes |
| Upload launch art, wallet previews | Yes | Yes |
| Join a community | No | Yes |
| Post and reply | No | Yes, after joining the community |
| Manage a community | No (sign in with X first) | Yes, as owner |

## Wallet sessions

- `POST /v1/wallet-auth/challenge` returns a one-time message for an address (5 minutes, single use).
- `POST /v1/wallet-auth/verify` checks the Ed25519 signature and returns a 12-hour session token.
- The token is accepted only by routes that use `requireAuthOrWallet`: `/v1/launch/*`,
  `POST /v1/media` and `/v1/wallet-rpc/*`. Every other route uses `requireAuth` and needs X.
- A wallet session can only fund a launch from the address that signed in.
- The session key is derived from `TOKEN_ENCRYPTION_KEY`; rotating it ends all wallet sessions.

Wallet accounts are ordinary rows in `users` with `privy_user_id = "wallet:<address>"`.

## From wallet to X

When someone who launched with a wallet later signs in with X in the same browser, the web
app calls `POST /v1/wallet-auth/claim`. Communities owned by that wallet account move to the
X account and the X account joins them, so the launcher can post in and manage what they launched.

## Posting

Posting or replying inside a community requires membership. The owner and staff are exempt.
Posts outside any community (the public feed) only require X sign-in.
