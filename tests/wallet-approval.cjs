// Exercise the actual AuthProvider bridge with isolated Privy hooks; never signs on chain.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/web/package.json'));
const React=r('react'),{renderToString}=r('react-dom/server'),ts=r('typescript');
let config,auth,logoutCalls=0,reject=false,chainSeen;
const wallet={address:'wallet'};
const external={address:"external"};let expectedWallet=wallet;
const hooks={
 toSolanaWalletConnectors:()=>({}),
 useCreateWallet:()=>({createWallet:async()=>{}}),useFundWallet:()=>({fundWallet:async()=>{}}),useExportWallet:()=>({exportWallet:async()=>{}}),
 useConnectedStandardWallets:()=>({wallets:[wallet,external]}),
 useStandardSignTransaction:()=>({signTransaction:async args=>{
  assert(config.solana.rpcs[args.chain]?.rpc,'Signing review needs an RPC client');
  assert(config.solana.rpcs[args.chain]?.rpcSubscriptions,'Signing review needs subscriptions configuration');
  assert.equal(args.wallet,expectedWallet);assert.deepEqual([...args.transaction],[1,2,3]);chainSeen=args.chain;
  if(reject)throw Error('User cancelled');return{signedTransaction:new Uint8Array([4,5,6])};
 }})
};
const privy={useConnectWallet:()=>({connectWallet(){}}),PrivyProvider:props=>{config=props.config;return props.children},usePrivy:()=>({ready:true,authenticated:true,user:{id:'test',linkedAccounts:[{type:'wallet',chainType:'solana',walletClientType:'privy',address:'wallet'}]},logout:async()=>{logoutCalls++},getAccessToken:async()=>null}),useLoginWithOAuth:()=>({initOAuth:async()=>{},loading:false})};
const mocks={'@/lib/wallet-rpc':{walletRpcs:{'solana:mainnet':{rpc:{},rpcSubscriptions:{}},'solana:devnet':{rpc:{},rpcSubscriptions:{}}}},'@privy-io/react-auth':privy,'@privy-io/react-auth/solana':hooks,'@/lib/api':{registerTokenGetter(){}},'./Modal':{Modal:()=>null}};
const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/components/AuthProvider.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:moduleObject,exports:moduleObject.exports,require:n=>mocks[n]??r(n),process:{env:{NEXT_PUBLIC_PRIVY_APP_ID:'test'}},console,Uint8Array,atob,btoa});
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
 assert.equal(logoutCalls,0);assert(auth.authenticated);
 console.log('PASS: mainnet/devnet approval clients, wallet selection, transaction byte roundtrip, cancellation without logout');
})().catch(e=>{console.error(e);process.exitCode=1});
