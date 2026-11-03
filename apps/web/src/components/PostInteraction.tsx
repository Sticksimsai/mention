"use client";
import { useEffect,useRef,useState } from 'react';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { PostView } from '@mention/shared';
import {TickerTextarea,TickerText} from './TickerText';
import { api } from '@/lib/api';
import { XVerifiedBadge } from './XVerifiedBadge';
import { AttachmentPicker,CommunitySticker,emptyAttachments } from './PostAttachments';

export function QuotedPost({post}:{post:PostView|null|undefined}){
 if(!post)return <div className="mt-3 rounded-xl border hairline p-4 text-sm text-muted">This post is no longer available.</div>;
 return <Link href={`/post/${encodeURIComponent(post.id)}`} className="mt-3 block overflow-hidden rounded-xl border hairline p-4 transition hover:bg-raised">
  <div className="flex items-center gap-2">{post.author.pfpUrl&&<img src={post.author.pfpUrl} className="h-6 w-6 rounded-full" alt=""/>}<strong className="user-display-name truncate">{post.author.name}</strong>{post.author.verified&&<XVerifiedBadge/>}</div><p className="mt-1 text-xs text-muted">@{post.author.username}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{post.content}</p>{post.mediaUrl&&<img src={post.mediaUrl} className="mt-3 max-h-56 rounded-lg" alt="Quoted attachment"/>}{post.sticker&&<CommunitySticker sticker={post.sticker} small/>}
 </Link>;
}
export function PostInteraction({post,mode,onClose}:{post:PostView;mode:'quote'|'reply';onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [content,setContent]=useState('');const [attachments,setAttachments]=useState(emptyAttachments);const [mediaBusy,setMediaBusy]=useState(false);const qc=useQueryClient();
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const submit=useMutation({mutationFn:()=>mode==='reply'?api<{id?:string}>(`/v1/posts/${encodeURIComponent(post.id)}/replies`,{method:'POST',body:{content:content.trim(),mediaUrl:attachments.mediaUrl||null,stickerId:attachments.sticker?.id,stickerMediaId:attachments.stickerMediaId}}):api<{id:string}>('/v1/posts',{method:'POST',body:{content:content.trim(),quotePostId:post.id,communityId:attachments.sticker?post.communityId||undefined:undefined,stickerId:attachments.sticker?.id,stickerMediaId:attachments.stickerMediaId,mediaUrl:attachments.mediaUrl||null,crosspostToX:false}}),onSuccess:()=>{qc.invalidateQueries({queryKey:['feed']});qc.invalidateQueries({queryKey:['post',post.id]});qc.invalidateQueries({queryKey:['replies',post.id]});}});
 return <dialog ref={dialog} onCancel={e=>{if(mediaBusy||submit.isPending)e.preventDefault();else onClose();}} aria-labelledby="post-dialog-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border hairline bg-ink p-5 text-fg shadow-2xl backdrop:bg-black/70">
  <div className="flex items-center justify-between"><h2 id="post-dialog-title" className="text-base font-semibold">{mode==='quote'?'Quote post':'Reply'}</h2><button disabled={mediaBusy||submit.isPending} onClick={onClose} aria-label="Close composer" className="rounded-lg px-3 py-2 text-muted hover:bg-surface">✕</button></div>
  {submit.isSuccess?<div className="py-8"><p className="text-sm text-volt">{mode==='quote'?'Your quote was posted.':'Your reply was posted.'}</p><Link href={`/post/${encodeURIComponent(submit.data?.id??post.id)}`} onClick={onClose} className="mt-4 inline-block text-sm underline">{mode==='quote'?'View your quote':'View conversation'}</Link><button onClick={onClose} className="ml-5 text-sm text-muted">Done</button></div>:<><p className="mt-2 text-xs text-muted">{mode==='reply'?`Replying to @${post.author.username} on Mentions`:'Add your take. This quote will appear on Mentions and your profile.'}</p><div className="mt-4"><TickerTextarea autoFocus value={content} onChange={setContent} maxLength={2000} rows={4} placeholder={mode==='quote'?'Add your take…':'Post your reply…'}/></div>
  <AttachmentPicker communityId={post.communityId||undefined} value={attachments} onChange={setAttachments} onBusyChange={setMediaBusy}/>
  <QuotedPost post={post}/>{submit.error&&<p role="alert" className="mt-3 text-xs text-down">{submit.error.message}</p>}<div className="mt-4 flex items-center justify-between"><span className="text-xs text-muted">{content.length}/2000</span><button onClick={()=>submit.mutate()} disabled={(!content.trim()&&!attachments.mediaUrl&&!attachments.sticker)||submit.isPending||mediaBusy} className="rounded-full bg-volt px-5 py-2 text-sm font-semibold text-ink disabled:opacity-40">{submit.isPending?'Posting…':mode==='quote'?'Post quote':'Reply'}</button></div></>}
 </dialog>;
}
