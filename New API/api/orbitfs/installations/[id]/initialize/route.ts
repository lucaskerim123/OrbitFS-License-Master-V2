import {httpError,initializeSupabaseDatabase,loadInstallation,requireOrbitUser} from "@/lib/orbitfs-deployment";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{const {user}=await requireOrbitUser(req),{id}=await params;const install=await loadInstallation(id,user.id);return Response.json({installation:await initializeSupabaseDatabase(install)})}catch(e){return httpError(e)}}
