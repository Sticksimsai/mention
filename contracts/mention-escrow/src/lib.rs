use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked}};
use anchor_spl::token_2022::spl_token_2022::{extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions}, state::Mint as SplMint};
// DEVELOPMENT ID ONLY. No mainnet deployment is authorized by this source file.
declare_id!("8ZM7gXJo4xxdD9DJcXvMFby66ioCv3QW5w5yDo9sBQNM");
const OPEN: u8 = 0;
const A_WINS: u8 = 1;
const B_WINS: u8 = 2;
const REFUND: u8 = 3;
const GRACE: i64 = 900;

#[program]
pub mod mention_escrow {
 use super::*;
 pub fn initialize_reserve(ctx: Context<InitializeReserve>, purchased:u64) -> Result<()> {
  safe_mint(&ctx.accounts.mint)?;
  // The launch builder includes creation, exact-token buy and this instruction atomically.
  // Enforce the observed starting balance, cap and split again on-chain.
  require!(purchased>=2&&purchased<=ctx.accounts.mint.supply/50,EscrowError::InvalidReserve);
  require!(ctx.accounts.source.amount==purchased,EscrowError::InvalidReserve);
  let amount=purchased/2;
  let reserve=&mut ctx.accounts.reserve;
  reserve.owner=ctx.accounts.owner.key();reserve.mint=ctx.accounts.mint.key();
  reserve.token_program=ctx.accounts.token_program.key();reserve.vault=ctx.accounts.vault.key();
  reserve.purchased=purchased;reserve.deposited=amount;reserve.bump=ctx.bumps.reserve;
  token_interface::transfer_checked(CpiContext::new(ctx.accounts.token_program.to_account_info(),TransferChecked {
   from:ctx.accounts.source.to_account_info(),mint:ctx.accounts.mint.to_account_info(),to:ctx.accounts.vault.to_account_info(),authority:ctx.accounts.owner.to_account_info()
  }),amount,ctx.accounts.mint.decimals)?;
  ctx.accounts.vault.reload()?;
  require!(ctx.accounts.vault.amount==amount,EscrowError::TransferMismatch);Ok(())
 }
 pub fn initialize(ctx: Context<Initialize>, nonce: [u8;32], terms: Terms) -> Result<()> {
  let now=Clock::get()?.unix_timestamp;
  terms.validate(now)?;
  require_keys_neq!(ctx.accounts.owner_a.key(),terms.owner_b,EscrowError::InvalidTerms);
  require_keys_neq!(ctx.accounts.mint_a.key(),ctx.accounts.mint_b.key(),EscrowError::InvalidTerms);
  safe_mint(&ctx.accounts.mint_a)?;safe_mint(&ctx.accounts.mint_b)?;
  let r=&mut ctx.accounts.round;
  r.owner_a=ctx.accounts.owner_a.key();r.owner_b=terms.owner_b;
  r.beneficiary_a=terms.beneficiary_a;r.beneficiary_b=terms.beneficiary_b;
  r.mint_a=ctx.accounts.mint_a.key();r.mint_b=ctx.accounts.mint_b.key();
  r.token_program_a=ctx.accounts.token_program_a.key();r.token_program_b=ctx.accounts.token_program_b.key();
  r.vault_a=ctx.accounts.vault_a.key();r.vault_b=ctx.accounts.vault_b.key();
  r.oracle=terms.oracle;r.pool_a=terms.pool_a;r.pool_b=terms.pool_b;r.rules_hash=terms.rules_hash;
  r.nonce=nonce;r.bump=ctx.bumps.round;r.amount_a=terms.amount_a;r.amount_b=terms.amount_b;
  r.start=terms.start;r.end=terms.start.checked_add(terms.duration).ok_or(EscrowError::Overflow)?;
  r.deadline=r.end.checked_add(GRACE).ok_or(EscrowError::Overflow)?;
  r.status=OPEN;r.funded_b=false;r.claimed_a=false;r.claimed_b=false;
  token_interface::transfer_checked(CpiContext::new(ctx.accounts.token_program_a.to_account_info(),TransferChecked {
   from:ctx.accounts.source_a.to_account_info(),mint:ctx.accounts.mint_a.to_account_info(),to:ctx.accounts.vault_a.to_account_info(),authority:ctx.accounts.owner_a.to_account_info()
  }),terms.amount_a,ctx.accounts.mint_a.decimals)?;
  ctx.accounts.vault_a.reload()?;
  require!(ctx.accounts.vault_a.amount==terms.amount_a,EscrowError::TransferMismatch);
  Ok(())
 }
 pub fn initialize_from_reserve(ctx: Context<InitializeFromReserve>, nonce: [u8;32], terms: Terms) -> Result<()> {
  let now=Clock::get()?.unix_timestamp;
  terms.validate(now)?;
  require_keys_neq!(ctx.accounts.owner_a.key(),terms.owner_b,EscrowError::InvalidTerms);
  require_keys_neq!(ctx.accounts.mint_a.key(),ctx.accounts.mint_b.key(),EscrowError::InvalidTerms);
  safe_mint(&ctx.accounts.mint_a)?;safe_mint(&ctx.accounts.mint_b)?;
  let r=&mut ctx.accounts.round;
  r.owner_a=ctx.accounts.owner_a.key();r.owner_b=terms.owner_b;
  r.beneficiary_a=terms.beneficiary_a;r.beneficiary_b=terms.beneficiary_b;
  r.mint_a=ctx.accounts.mint_a.key();r.mint_b=ctx.accounts.mint_b.key();
  r.token_program_a=ctx.accounts.token_program_a.key();r.token_program_b=ctx.accounts.token_program_b.key();
  r.vault_a=ctx.accounts.vault_a.key();r.vault_b=ctx.accounts.vault_b.key();
  r.oracle=terms.oracle;r.pool_a=terms.pool_a;r.pool_b=terms.pool_b;r.rules_hash=terms.rules_hash;
  r.nonce=nonce;r.bump=ctx.bumps.round;r.amount_a=terms.amount_a;r.amount_b=terms.amount_b;
  r.start=terms.start;r.end=terms.start.checked_add(terms.duration).ok_or(EscrowError::Overflow)?;
  r.deadline=r.end.checked_add(GRACE).ok_or(EscrowError::Overflow)?;
  r.status=OPEN;r.funded_b=false;r.claimed_a=false;r.claimed_b=false;
  let mint_key=ctx.accounts.mint_a.key();
  let seeds:&[&[u8]]=&[b"reserve",mint_key.as_ref(),&[ctx.accounts.reserve.bump]];
  token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program_a.to_account_info(),TransferChecked {
   from:ctx.accounts.reserve_vault.to_account_info(),mint:ctx.accounts.mint_a.to_account_info(),to:ctx.accounts.vault_a.to_account_info(),authority:ctx.accounts.reserve.to_account_info()
  },&[seeds]),terms.amount_a,ctx.accounts.mint_a.decimals)?;
  ctx.accounts.vault_a.reload()?;
  require!(ctx.accounts.vault_a.amount==terms.amount_a,EscrowError::TransferMismatch);
  Ok(())
 }
 pub fn accept(ctx: Context<Accept>) -> Result<()> {
  let r=&mut ctx.accounts.round;
  require!(r.status==OPEN&&!r.funded_b&&Clock::get()?.unix_timestamp<r.start,EscrowError::NotOpen);
  safe_mint(&ctx.accounts.mint_b)?;
  let before=ctx.accounts.vault_b.amount;
  token_interface::transfer_checked(CpiContext::new(ctx.accounts.token_program_b.to_account_info(),TransferChecked {
   from:ctx.accounts.source_b.to_account_info(),mint:ctx.accounts.mint_b.to_account_info(),to:ctx.accounts.vault_b.to_account_info(),authority:ctx.accounts.owner_b.to_account_info()
  }),r.amount_b,ctx.accounts.mint_b.decimals)?;
  ctx.accounts.vault_b.reload()?;
  require!(ctx.accounts.vault_b.amount.checked_sub(before)==Some(r.amount_b),EscrowError::TransferMismatch);
  r.funded_b=true;Ok(())
 }
 pub fn accept_from_reserve(ctx: Context<AcceptFromReserve>) -> Result<()> {
  let r=&mut ctx.accounts.round;
  require!(r.status==OPEN&&!r.funded_b&&Clock::get()?.unix_timestamp<r.start,EscrowError::NotOpen);
  safe_mint(&ctx.accounts.mint_b)?;
  let before=ctx.accounts.vault_b.amount;
  let mint_key=ctx.accounts.mint_b.key();
  let seeds:&[&[u8]]=&[b"reserve",mint_key.as_ref(),&[ctx.accounts.reserve.bump]];
  token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program_b.to_account_info(),TransferChecked {
   from:ctx.accounts.reserve_vault.to_account_info(),mint:ctx.accounts.mint_b.to_account_info(),to:ctx.accounts.vault_b.to_account_info(),authority:ctx.accounts.reserve.to_account_info()
  },&[seeds]),r.amount_b,ctx.accounts.mint_b.decimals)?;
  ctx.accounts.vault_b.reload()?;
  require!(ctx.accounts.vault_b.amount.checked_sub(before)==Some(r.amount_b),EscrowError::TransferMismatch);
  r.funded_b=true;Ok(())
 }
 // The named oracle attests finalized USD micro-unit totals. This is a trust boundary,
 // not an on-chain proof of trading volume. Both parties approve this key in Terms.
 pub fn settle(ctx: Context<Settle>, volume_a:u128,volume_b:u128,complete:bool,evidence_hash:[u8;32])->Result<()> {
  let r=&mut ctx.accounts.round;let now=Clock::get()?.unix_timestamp;
  require!(r.status==OPEN&&r.funded_b&&now>=r.end&&now<r.deadline,EscrowError::NotSettleable);
  require!(evidence_hash!=[0;32],EscrowError::InvalidEvidence);
  r.volume_a=volume_a;r.volume_b=volume_b;r.evidence_hash=evidence_hash;
  r.status=if !complete||volume_a==volume_b{REFUND}else if volume_a>volume_b{A_WINS}else{B_WINS};Ok(())
 }
 // Anyone can trigger timeout; no oracle or administrator can prevent this refund.
 pub fn expire(ctx:Context<Expire>)->Result<()> {
  let r=&mut ctx.accounts.round;let now=Clock::get()?.unix_timestamp;
  require!(r.status==OPEN&&((!r.funded_b&&now>=r.start)||now>=r.deadline),EscrowError::NotExpired);
  r.status=REFUND;Ok(())
 }
 // Each vault can be claimed exactly once. Recipient is derived from stored terms.
 pub fn claim(ctx:Context<Claim>,side:u8)->Result<()> {
  let r=&mut ctx.accounts.round;require!(side<=1,EscrowError::InvalidSide);
  require!(r.status!=OPEN,EscrowError::NotSettleable);
  let is_a=side==0;
  let (mint,program,vault,amount,claimed)=if is_a{(r.mint_a,r.token_program_a,r.vault_a,r.amount_a,r.claimed_a)}else{(r.mint_b,r.token_program_b,r.vault_b,r.amount_b,r.claimed_b)};
  require!(!claimed&&(is_a||r.funded_b),EscrowError::AlreadyClaimed);
  require_keys_eq!(ctx.accounts.mint.key(),mint,EscrowError::WrongAccount);
  require_keys_eq!(ctx.accounts.token_program.key(),program,EscrowError::WrongAccount);
  require_keys_eq!(ctx.accounts.vault.key(),vault,EscrowError::WrongAccount);
  let recipient=match r.status{A_WINS=>r.beneficiary_a,B_WINS=>r.beneficiary_b,REFUND=>if is_a{r.owner_a}else{r.owner_b},_=>return err!(EscrowError::NotSettleable)};
  require_keys_eq!(ctx.accounts.destination.owner,recipient,EscrowError::WrongRecipient);
  if is_a{r.claimed_a=true}else{r.claimed_b=true};
  let seeds:&[&[u8]]=&[b"round",r.owner_a.as_ref(),&r.nonce,&[r.bump]];
  token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),TransferChecked {
   from:ctx.accounts.vault.to_account_info(),mint:ctx.accounts.mint.to_account_info(),to:ctx.accounts.destination.to_account_info(),authority:r.to_account_info()
  },&[seeds]),amount,ctx.accounts.mint.decimals)?;Ok(())
 }
}

fn safe_mint(mint:&InterfaceAccount<Mint>)->Result<()> {
 require!(mint.freeze_authority.is_none(),EscrowError::UnsafeMint);
 let info=mint.to_account_info();let data=info.try_borrow_data()?;
 let state=StateWithExtensions::<SplMint>::unpack(&data).map_err(|_|error!(EscrowError::UnsafeMint))?;
 for extension in state.get_extension_types().map_err(|_|error!(EscrowError::UnsafeMint))? {
  require!(matches!(extension,ExtensionType::MetadataPointer|ExtensionType::TokenMetadata),EscrowError::UnsafeMint);
 }
 Ok(())
}
#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub struct Terms {
 pub owner_b:Pubkey,pub beneficiary_a:Pubkey,pub beneficiary_b:Pubkey,pub oracle:Pubkey,pub pool_a:Pubkey,pub pool_b:Pubkey,
 pub rules_hash:[u8;32],pub amount_a:u64,pub amount_b:u64,pub start:i64,pub duration:i64,
}
impl Terms {pub fn validate(&self,now:i64)->Result<()> {
 require!([600,1800,3600].contains(&self.duration)&&self.start%60==0&&self.start>=now.checked_add(60).ok_or(EscrowError::Overflow)?&&self.start<=now.checked_add(86400).ok_or(EscrowError::Overflow)?,EscrowError::InvalidTerms);
 require!(self.amount_a>0&&self.amount_b>0&&self.rules_hash!=[0;32]&&self.pool_a!=self.pool_b,EscrowError::InvalidTerms);
 for key in [self.owner_b,self.beneficiary_a,self.beneficiary_b,self.oracle,self.pool_a,self.pool_b] {require!(key!=Pubkey::default(),EscrowError::InvalidTerms);}
 Ok(())
}}
#[account]
#[derive(InitSpace)]
pub struct Round {
 pub owner_a:Pubkey,pub owner_b:Pubkey,pub beneficiary_a:Pubkey,pub beneficiary_b:Pubkey,
 pub mint_a:Pubkey,pub mint_b:Pubkey,pub token_program_a:Pubkey,pub token_program_b:Pubkey,pub vault_a:Pubkey,pub vault_b:Pubkey,
 pub oracle:Pubkey,pub pool_a:Pubkey,pub pool_b:Pubkey,pub nonce:[u8;32],pub rules_hash:[u8;32],pub evidence_hash:[u8;32],
 pub amount_a:u64,pub amount_b:u64,pub start:i64,pub end:i64,pub deadline:i64,pub volume_a:u128,pub volume_b:u128,
 pub status:u8,pub bump:u8,pub funded_b:bool,pub claimed_a:bool,pub claimed_b:bool,
}
#[derive(Accounts)]
#[instruction(nonce:[u8;32])]
pub struct Initialize<'info> {
 #[account(mut)] pub owner_a:Signer<'info>,
 #[account(init,payer=owner_a,space=8+Round::INIT_SPACE,seeds=[b"round",owner_a.key().as_ref(),&nonce],bump)] pub round:Box<Account<'info,Round>>,
 #[account(mint::token_program=token_program_a)] pub mint_a:InterfaceAccount<'info,Mint>,
 #[account(mint::token_program=token_program_b)] pub mint_b:InterfaceAccount<'info,Mint>,
 #[account(mut,token::mint=mint_a,token::authority=owner_a,token::token_program=token_program_a)] pub source_a:InterfaceAccount<'info,TokenAccount>,
 #[account(init,payer=owner_a,associated_token::mint=mint_a,associated_token::authority=round,associated_token::token_program=token_program_a)] pub vault_a:InterfaceAccount<'info,TokenAccount>,
 #[account(init,payer=owner_a,associated_token::mint=mint_b,associated_token::authority=round,associated_token::token_program=token_program_b)] pub vault_b:InterfaceAccount<'info,TokenAccount>,
 pub token_program_a:Interface<'info,TokenInterface>,pub token_program_b:Interface<'info,TokenInterface>,
 pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
#[instruction(nonce:[u8;32])]
pub struct InitializeFromReserve<'info> {
 #[account(mut)] pub owner_a:Signer<'info>,
 #[account(init,payer=owner_a,space=8+Round::INIT_SPACE,seeds=[b"round",owner_a.key().as_ref(),&nonce],bump)] pub round:Box<Account<'info,Round>>,
 #[account(mint::token_program=token_program_a)] pub mint_a:Box<InterfaceAccount<'info,Mint>>,
 #[account(mint::token_program=token_program_b)] pub mint_b:Box<InterfaceAccount<'info,Mint>>,
 #[account(seeds=[b"reserve",mint_a.key().as_ref()],bump=reserve.bump,constraint=reserve.owner==owner_a.key(),constraint=reserve.mint==mint_a.key(),constraint=reserve.token_program==token_program_a.key(),constraint=reserve.vault==reserve_vault.key())] pub reserve:Box<Account<'info,Reserve>>,
 #[account(mut,token::mint=mint_a,token::authority=reserve,token::token_program=token_program_a)] pub reserve_vault:Box<InterfaceAccount<'info,TokenAccount>>,
 #[account(init,payer=owner_a,associated_token::mint=mint_a,associated_token::authority=round,associated_token::token_program=token_program_a)] pub vault_a:Box<InterfaceAccount<'info,TokenAccount>>,
 #[account(init,payer=owner_a,associated_token::mint=mint_b,associated_token::authority=round,associated_token::token_program=token_program_b)] pub vault_b:Box<InterfaceAccount<'info,TokenAccount>>,
 pub token_program_a:Interface<'info,TokenInterface>,pub token_program_b:Interface<'info,TokenInterface>,
 pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
pub struct Accept<'info> {
 pub owner_b:Signer<'info>,
 #[account(mut,seeds=[b"round",round.owner_a.as_ref(),&round.nonce],bump=round.bump,has_one=owner_b,has_one=mint_b,has_one=vault_b,has_one=token_program_b)] pub round:Box<Account<'info,Round>>,
 #[account(mint::token_program=token_program_b)] pub mint_b:InterfaceAccount<'info,Mint>,
 #[account(mut,token::mint=mint_b,token::authority=owner_b,token::token_program=token_program_b)] pub source_b:InterfaceAccount<'info,TokenAccount>,
 #[account(mut,token::mint=mint_b,token::authority=round,token::token_program=token_program_b)] pub vault_b:InterfaceAccount<'info,TokenAccount>,
 pub token_program_b:Interface<'info,TokenInterface>,
}
#[derive(Accounts)]
pub struct AcceptFromReserve<'info> {
 pub owner_b:Signer<'info>,
 #[account(mut,seeds=[b"round",round.owner_a.as_ref(),&round.nonce],bump=round.bump,has_one=owner_b,has_one=mint_b,has_one=vault_b,has_one=token_program_b)] pub round:Box<Account<'info,Round>>,
 #[account(mint::token_program=token_program_b)] pub mint_b:Box<InterfaceAccount<'info,Mint>>,
 #[account(seeds=[b"reserve",mint_b.key().as_ref()],bump=reserve.bump,constraint=reserve.owner==owner_b.key(),constraint=reserve.mint==mint_b.key(),constraint=reserve.token_program==token_program_b.key(),constraint=reserve.vault==reserve_vault.key())] pub reserve:Box<Account<'info,Reserve>>,
 #[account(mut,token::mint=mint_b,token::authority=reserve,token::token_program=token_program_b)] pub reserve_vault:Box<InterfaceAccount<'info,TokenAccount>>,
 #[account(mut,token::mint=mint_b,token::authority=round,token::token_program=token_program_b)] pub vault_b:Box<InterfaceAccount<'info,TokenAccount>>,
 pub token_program_b:Interface<'info,TokenInterface>,
}
#[derive(Accounts)]
pub struct Settle<'info> {
 pub oracle:Signer<'info>,
 #[account(mut,seeds=[b"round",round.owner_a.as_ref(),&round.nonce],bump=round.bump,has_one=oracle)] pub round:Box<Account<'info,Round>>,
}
#[derive(Accounts)]
pub struct Expire<'info> {
 #[account(mut,seeds=[b"round",round.owner_a.as_ref(),&round.nonce],bump=round.bump)] pub round:Box<Account<'info,Round>>,
}
#[derive(Accounts)]
pub struct Claim<'info> {
 #[account(mut,seeds=[b"round",round.owner_a.as_ref(),&round.nonce],bump=round.bump)] pub round:Box<Account<'info,Round>>,
 #[account(mint::token_program=token_program)] pub mint:InterfaceAccount<'info,Mint>,
 #[account(mut,token::mint=mint,token::authority=round,token::token_program=token_program)] pub vault:InterfaceAccount<'info,TokenAccount>,
 #[account(mut,token::mint=mint,token::token_program=token_program)] pub destination:InterfaceAccount<'info,TokenAccount>,
 pub token_program:Interface<'info,TokenInterface>,
}
#[error_code]
pub enum EscrowError {
 #[msg("Invalid fixed matchup terms")] InvalidTerms,
 #[msg("Arithmetic overflow")] Overflow,
 #[msg("This mint has unsupported authority or extensions")] UnsafeMint,
 #[msg("Transfer did not deliver the exact stake")] TransferMismatch,
 #[msg("Funding has closed or opponent already funded")] NotOpen,
 #[msg("Settlement or claim is not available")] NotSettleable,
 #[msg("Evidence hash is required")] InvalidEvidence,
 #[msg("Refund deadline has not arrived")] NotExpired,
 #[msg("Invalid vault side")] InvalidSide,
 #[msg("Stake was already claimed or never funded")] AlreadyClaimed,
 #[msg("Wrong mint, vault or token program")] WrongAccount,
 #[msg("Destination does not belong to the beneficiary")] WrongRecipient,
 #[msg("Invalid reserve purchase amount or starting balance")] InvalidReserve,
}

// One reserve per mint. There is no generic withdraw or administrator drain instruction.
// Owner signatures approve each wager; refunds go to the stored depositor as in normal rounds.
#[account]
#[derive(InitSpace)]
pub struct Reserve {
 pub owner:Pubkey,pub mint:Pubkey,pub token_program:Pubkey,pub vault:Pubkey,
 pub purchased:u64,pub deposited:u64,pub bump:u8,
}
#[derive(Accounts)]
pub struct InitializeReserve<'info> {
 #[account(mut)] pub owner:Signer<'info>,
 #[account(mint::token_program=token_program)] pub mint:Box<InterfaceAccount<'info,Mint>>,
 #[account(init,payer=owner,space=8+Reserve::INIT_SPACE,seeds=[b"reserve",mint.key().as_ref()],bump)] pub reserve:Box<Account<'info,Reserve>>,
 #[account(mut,associated_token::mint=mint,associated_token::authority=owner,associated_token::token_program=token_program)] pub source:Box<InterfaceAccount<'info,TokenAccount>>,
 #[account(init,payer=owner,associated_token::mint=mint,associated_token::authority=reserve,associated_token::token_program=token_program)] pub vault:Box<InterfaceAccount<'info,TokenAccount>>,
 pub token_program:Interface<'info,TokenInterface>,
 pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>,
}
