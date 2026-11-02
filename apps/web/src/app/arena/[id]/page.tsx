import { redirect } from "next/navigation";
export default function LegacyArenaRound({params}:{params:{id:string}}){ redirect(`/mentionmarkets/${encodeURIComponent(params.id)}`); }
