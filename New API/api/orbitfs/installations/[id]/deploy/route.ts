import {licenseDb} from "@/lib/license-api";
import {latestPanelMetadata} from "@/lib/panel-release";
import {deployPanel,httpError,loadInstallation,requireOrbitUser,type DeployAction} from "@/lib/orbitfs-deployment";
import {reconcileOrbitfsInstallation} from "@/lib/orbitfs-lifecycle";

const allowed=new Set(["deploy","update","rollback","redeploy"]);

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {user}=await requireOrbitUser(req),{id}=await params,body=await req.json().catch(()=>({}));
    const action=String(body.action||"deploy") as DeployAction;
    if(!allowed.has(action))throw Object.assign(new Error("Unsupported deployment action"),{status:400});
    let install=await loadInstallation(id,user.id);
    const {data:vercel}=await licenseDb().from("orbitfs_provider_connections").select("status,metadata").eq("auth_user_id",user.id).eq("provider","vercel").maybeSingle();
    if(!vercel||vercel.status!=="connected"||vercel.metadata?.api_ready!==true)throw Object.assign(new Error("Vercel API access is not ready. Connect a Full Account Access Vercel token in step 3 before deploying."),{status:409});
    install=await reconcileOrbitfsInstallation(install);
    let version=body.version?String(body.version):undefined;
    if(action==="update"&&!version)version=(await latestPanelMetadata("update")).version;
    if(action==="redeploy"&&!install.release_version)throw Object.assign(new Error("The Panel is not currently deployed. Use Deploy to create a new Vercel project."),{status:409});
    return Response.json({installation:await deployPanel(install,action,version)});
  }catch(e){return httpError(e)}
}
