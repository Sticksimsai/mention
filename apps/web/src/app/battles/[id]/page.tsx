import { redirect } from "next/navigation";
export default function LegacyBattle({params}:{params:{id:string}}){ redirect(`/mentionmarkets/${encodeURIComponent(params.id)}`); }
