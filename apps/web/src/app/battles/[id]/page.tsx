import { redirect } from "next/navigation";
export default function LegacyBattle({params}:{params:{id:string}}){ redirect(`/arena/${encodeURIComponent(params.id)}`); }
