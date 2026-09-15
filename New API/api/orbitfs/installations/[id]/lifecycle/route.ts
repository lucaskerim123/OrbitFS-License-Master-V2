import {httpError,loadInstallation,requireOrbitUser} from "@/lib/orbitfs-deployment";
import {deregisterOrbitfsInstallation,undeployOrbitfsPanel} from "@/lib/orbitfs-lifecycle";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {user}=await requireOrbitUser(req),{id}=await params,body=await req.json().catch(()=>({}));
    const install=await loadInstallation(id,user.id),action=String(body.action||"");
    if(action==="undeploy")return Response.json({installation:await undeployOrbitfsPanel(install)});
    if(action==="deregister")return Response.json({result:await deregisterOrbitfsInstallation(install,body.removePanel!==false)});
    throw Object.assign(new Error("Unsupported installation lifecycle action"),{status:400});
  }catch(e){return httpError(e)}
}
