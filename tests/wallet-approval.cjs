// Exercise the actual AuthProvider bridge with isolated Privy hooks; never signs on chain.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/web/package.json'));
const React=r('react'),{renderToString}=r('react-dom/server'),ts=r('typescript');
let config,auth,logoutCalls=0,reject=false,chainSeen,signedIn=true,apiCalls=[],savedSession=null,signedMessage;
const wallet={address:'wallet'};
const external={address:"external"};let expectedWallet=wallet;
const hooks={
 toSolanaWalletConnectors:()=>({}),
 useCreateWallet:()=>({createWallet:async()=>{}}),useFundWallet:()=>({fundWallet:async()=>{}}),useExportWallet:()=>({exportWallet:async()=>{}}),
 useConnectedStandardWallets:()=>({wallets:[wallet,external]}),
 useStandardSignMessage:()=>({signMessage:async args=>{signedMessage=new TextDecoder().decode(args.message);assert.equal(args.wallet,external);return{signature:new Uint8Array(64).fill(7)}}}),
 useStandardSignTransaction:()=>({signTransaction:async args=>{
  assert(config.solana.rpcs[args.chain]?.rpc,'Signing review needs an RPC client');
  assert(config.solana.rpcs[args.chain]?.rpcSubscriptions,'Signing review needs subscriptions configuration');
  assert.equal(args.wallet,expectedWallet);assert.deepEqual([...args.transaction],[1,2,3]);chainSeen=args.chain;
  if(reject)throw Error('User cancelled');return{signedTransaction:new Uint8Array([4,5,6])};
 }})
};
const privy={useConnectWallet:()=>({connectWallet(){}}),PrivyProvider:props=>{config=props.config;return props.children},usePrivy:()=>({ready:true,authenticated:signedIn,user:signedIn?{id:'test',linkedAccounts:[{type:'wallet',chainType:'solana',walletClientType:'privy',address:'wallet'}]}:null,logout:async()=>{logoutCalls++},getAccessToken:async()=>null}),useLoginWithOAuth:()=>({initOAuth:async()=>{},loading:false})};
const mocks={'@/lib/wallet-rpc':{walletRpcs:{'solana:mainnet':{rpc:{},rpcSubscriptions:{}},'solana:devnet':{rpc:{},rpcSubscriptions:{}}}},'@privy-io/react-auth':privy,'@privy-io/react-auth/solana':hooks,'@/lib/api':{registerTokenGetter(){},api:async(path,opts)=>{apiCalls.push({path,opts});return path.endsWith('/challenge')?{address:'external',message:'sign in to launch'}:{address:'external',token:'wallet-token',expiresAt:Date.now()+3600000}}},'@/lib/wallet-session':{readWalletSession:()=>savedSession,saveWalletSession:v=>{savedSession=v},clearWalletSession:()=>{savedSession=null}},'./Modal':{Modal:()=>null}};
const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/components/AuthProvider.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:moduleObject,exports:moduleObject.exports,require:n=>mocks[n]??r(n),process:{env:{NEXT_PUBLIC_PRIVY_APP_ID:'test'}},console,Uint8Array,atob,btoa,TextEncoder,Boolean});
const {AuthProvider,useAuth}=moduleObject.exports;
function Probe(){auth=useAuth();return null}
renderToString(React.createElement(AuthProvider,null,React.createElement(Probe)));
(async()=>{
 assert(auth.authenticated);assert(auth.available);
 assert.equal(await auth.signTransaction('AQID'),'BAUG');assert.equal(chainSeen,'solana:mainnet');
 assert.equal(await auth.signDevnetTransaction('AQID'),'BAUG');assert.equal(chainSeen,'solana:devnet');
 expectedWallet=external;
 assert.equal(await auth.signTransaction('AQID','external'),'BAUG');
 await assert.rejects(auth.signTransaction('AQID','disconnected'),/Connect the wallet/);
 expectedWallet=wallet;
 reject=true;await assert.rejects(auth.signTransaction('AQID'),/cancelled/);
 assert.equal(logoutCalls,0);assert(auth.authenticated);assert(auth.canLaunch,'X sign-in can launch');assert.equal(auth.accountKey,'test');
 // Wallet-only visitor: no X sign-in, a free signature starts the session used for launching.
 signedIn=false;reject=false;renderToString(React.createElement(AuthProvider,null,React.createElement(Probe)));
 assert(!auth.authenticated);assert(!auth.canLaunch,'A connected wallet alone is not verified');assert.equal(auth.launchWalletAddress,'wallet','Defaults to the first connected wallet');
 await assert.rejects(auth.walletSignIn('disconnected'),/Connect your wallet/);assert.equal(apiCalls.length,0);
 await auth.walletSignIn('external');
 assert.deepEqual(apiCalls.map(c=>c.path),['/v1/wallet-auth/challenge','/v1/wallet-auth/verify']);assert(apiCalls.every(c=>c.opts.auth===false),'Wallet sign-in never sends another session token');
 assert.equal(signedMessage,'sign in to launch');assert.equal(apiCalls[1].opts.body.signature,Buffer.from(new Uint8Array(64).fill(7)).toString('base64'));assert.equal(savedSession.token,'wallet-token');
 expectedWallet=external;assert.equal(await auth.signTransaction('AQID','external'),'BAUG','Wallet-only visitors can approve with their connected wallet');
 console.log('PASS: mainnet/devnet approval clients, wallet selection, transaction byte roundtrip, cancellation without logout, wallet-only sign-in');
})().catch(e=>{console.error(e);process.exitCode=1});
