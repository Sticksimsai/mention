"use client";
import { Shell } from "@/components/Shell";
import { CommunityDirectory,ManagementGate,Panel } from "@/components/Management";
export default function ManagePage(){return <Shell wide><header className="border-b hairline px-5 py-6"><p className="text-xs text-volt">COMMUNITY PORTAL</p><h1 className="mt-2 text-2xl font-semibold">Your token communities</h1><p className="mt-2 text-sm text-muted">Manage the people, posts and details behind your token.</p></header><ManagementGate><div className="p-5"><Panel title="Communities you manage" description="Each dashboard is restricted to its owner and site staff."><CommunityDirectory/></Panel></div></ManagementGate></Shell>}
