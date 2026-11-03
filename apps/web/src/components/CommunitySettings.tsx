"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { communityHref } from "@mention/shared";
import Link from "next/link";
import { BannerEditor } from "./BannerEditor";
import type { ManagedCommunity } from "./Management";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/media";

const input = "mt-2 w-full rounded-xl border hairline bg-ink px-3 py-3 text-sm text-fg outline-none focus:border-volt/60 disabled:opacity-50";
export function CommunitySettings({ community: c }: { community: ManagedCommunity }) {
  const qc = useQueryClient();
  const initial = { name:c.name, details:c.details, pfpUrl:c.pfpUrl, bannerUrl:c.bannerUrl, website:c.website??"", twitterUrl:c.twitterUrl??"", telegram:c.telegram??"", xCommunityUrl:c.xCommunityUrl??"", postCooldownSecs:c.postCooldownSecs };
  const [values,setValues] = useState(initial);
  const [saved,setSaved] = useState(initial);
  const [imageBusy,setImageBusy] = useState(false);
  const [bannerBusy,setBannerBusy] = useState(false);
  const [imageError,setImageError] = useState("");
  const dirty = JSON.stringify(values)!==JSON.stringify(saved);
  const save = useMutation({
    mutationFn:(draft:typeof values)=>api(`/v1/communities/${c.id}`, {method:"PATCH",body:{...draft,pfpUrl:draft.pfpUrl||null,bannerUrl:draft.bannerUrl||null,website:draft.website||null,twitterUrl:draft.twitterUrl||null,telegram:draft.telegram||null,xCommunityUrl:draft.xCommunityUrl||null}}),
    onSuccess:(_,draft)=>{setSaved(draft);qc.invalidateQueries({queryKey:["manage"]});qc.invalidateQueries({queryKey:["community"]});qc.invalidateQueries({queryKey:["communities"]});}
  });
  function change<K extends keyof typeof values>(key:K,value:typeof values[K]) {setValues(v=>({...v,[key]:value}));save.reset();}
  async function upload(file:File) {
    setImageError("");setImageBusy(true);
    try {if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type))throw new Error("Choose a PNG, JPG, WebP or GIF.");const media=await uploadMedia(file);change("pfpUrl",media.url);}
    catch(e){setImageError(e instanceof Error?e.message:"Upload failed. Please try again.");}
    finally{setImageBusy(false);}
  }
  return <form onSubmit={e=>{e.preventDefault();if(dirty&&!imageBusy&&!bannerBusy&&!save.isPending)save.mutate({...values});}} className="space-y-6">
    <fieldset disabled={save.isPending} className="min-w-0 space-y-6">
      <section aria-labelledby="community-profile-title" className="space-y-5">
        <div><h3 id="community-profile-title" className="text-sm">Community profile</h3><p className="mt-2 text-xs leading-5 text-muted">Make it easy for people to recognise and understand your community.</p></div>
        <BannerEditor value={values.bannerUrl} onChange={url=>change("bannerUrl",url)} disabled={save.isPending} onBusyChange={setBannerBusy}/>
        <div className="rounded-xl border hairline bg-ink/40 p-4">
          <div className="flex flex-wrap items-center gap-4">
            {values.pfpUrl?<img src={values.pfpUrl} alt="Community image preview" className="h-16 w-16 shrink-0 rounded-2xl border hairline object-cover"/>:<div className="grid h-16 w-16 place-items-center rounded-2xl bg-raised text-volt">${c.ticker}</div>}
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">Community image</p><p className="mt-1 text-xs leading-5 text-muted">Square images work best. Images up to 2 MB; GIFs up to 8 MB.</p><label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border hairline px-3 py-2 text-xs hover:border-volt/50 focus-within:ring-2 focus-within:ring-volt">{imageBusy?"Uploading…":"Upload image"}<input aria-label="Upload community image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={imageBusy||save.isPending} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value="";}}/></label></div>
          </div>
          <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer hover:text-fg">Use an image link instead</summary><label className="mt-3 block">Image URL<input type="url" className={input} value={values.pfpUrl} disabled={imageBusy} onChange={e=>change("pfpUrl",e.target.value)} placeholder="https://…" maxLength={2000}/></label></details>
          {imageError&&<p role="alert" className="mt-2 text-xs text-down">{imageError}</p>}
        </div>
        <label className="block text-sm">Community name<input required className={input} maxLength={60} value={values.name} onChange={e=>change("name",e.target.value)}/></label>
        <label className="block text-sm">About<textarea className={input} rows={3} maxLength={2000} value={values.details} onChange={e=>change("details",e.target.value)} placeholder="What brings your community together?"/><span className="mt-1 block text-right text-[11px] text-muted">{values.details.length}/2000</span></label>
      </section>
      <details className="rounded-xl border hairline p-4">
        <summary className="cursor-pointer text-sm font-medium">Social links <span className="ml-2 text-xs font-normal text-muted">Optional</span></summary>
        <p className="mt-2 text-xs leading-5 text-muted">Add the places where your community connects.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{([
          ["twitterUrl","X profile","https://x.com/yourhandle"], ["telegram","Telegram","https://t.me/yourcommunity"],
          ["xCommunityUrl","X community","https://x.com/i/communities/…"], ["website","Website","https://yourwebsite.com"]
        ] as const).map(([key,label,placeholder])=><label key={key} className="block text-xs text-muted">{label}<input type="url" className={input} value={values[key]} maxLength={2000} placeholder={placeholder} readOnly={key==="website"&&c.launchedViaTribes} onChange={e=>change(key,e.target.value)}/>{key==="website"&&c.launchedViaTribes&&<span className="mt-2 block text-[11px]">Linked to your community page automatically.</span>}</label>)}</div>
      </details>
      <section aria-labelledby="posting-title" className="rounded-xl border hairline p-4">
        <h3 id="posting-title" className="text-sm">Posting pace</h3><p className="mt-2 text-xs leading-5 text-muted">Choose how long members wait between posts. Use a cooldown to reduce spam.</p>
        <div role="group" aria-label="Posting cooldown" className="mt-4 flex flex-wrap gap-2">{[[0,"Off"],[30,"30 seconds"],[60,"1 minute"],[300,"5 minutes"]].map(([seconds,label])=><button type="button" key={seconds} aria-pressed={values.postCooldownSecs===seconds} onClick={()=>change("postCooldownSecs",Number(seconds))} className={`rounded-lg border px-3 py-2 text-xs ${values.postCooldownSecs===seconds?"border-volt/50 bg-volt/10 text-volt":"hairline text-muted hover:text-fg"}`}>{label}</button>)}</div>
        <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">Custom duration</summary><label className="mt-3 block">Seconds between posts<input type="number" min={0} max={86400} step={1} required className={`${input} block max-w-44`} value={values.postCooldownSecs} onChange={e=>change("postCooldownSecs",Number(e.target.value))}/></label></details>
        <p className="mt-3 text-xs text-muted" aria-live="polite">{values.postCooldownSecs===0?"Members can post without a cooldown.":`Members wait ${values.postCooldownSecs} seconds between posts.`}</p>
      </section>
      <div className="rounded-xl bg-ink p-4 text-xs text-muted"><p className="font-medium text-fg">${c.ticker} · Token contract</p><p className="mt-2 break-all font-mono">{c.ca}</p><p className="mt-2">Your ticker and contract address cannot be changed here.</p><Link href={communityHref(c)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-volt">View community ↗</Link></div>
    </fieldset>
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border hairline bg-surface p-3 shadow-lg">
      <p aria-live="polite" className={`text-xs ${save.isError?"text-down":save.isSuccess?"text-volt":"text-muted"}`}>{save.isError?save.error.message:imageBusy||bannerBusy?"Finish your image upload before saving.":save.isSuccess?"Changes saved.":dirty?"You have unsaved changes.":"Your community is up to date."}</p>
      <div className="flex items-center gap-2"><button type="button" disabled={!dirty||save.isPending||imageBusy||bannerBusy} onClick={()=>{setValues({...saved});save.reset();setImageError("");}} className="rounded-lg px-3 py-2 text-xs text-muted hover:text-fg disabled:opacity-40">Reset changes</button><button type="submit" disabled={!dirty||save.isPending||imageBusy||bannerBusy} className="rounded-lg bg-volt px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-40">{save.isPending?"Saving…":"Save changes"}</button></div>
    </div>
  </form>;
}
