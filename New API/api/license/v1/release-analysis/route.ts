import {licenseDb} from "@/lib/license-api";
import {authorizeReleasePublisher} from "@/lib/engine-release";
import {authorizePanelReleasePublisher} from "@/lib/panel-release";
import {getOrbitfsReleaseBundle} from "@/lib/orbitfs-release-bundle";

export const runtime="nodejs";
const MAX_ANALYSIS_BYTES=256*1024;

async function authorize(req:Request,kind:string){
  return kind==="panel"?authorizePanelReleasePublisher(req):kind==="engine"?authorizeReleasePublisher(req):{ok:false as const,status:400,error:"Release analysis kind must be panel or engine",code:"RELEASE_ANALYSIS_KIND_INVALID"};
}

export async function POST(req:Request){
  try{
    const body=await req.json().catch(()=>({}));
    const kind=String(body.kind||"").trim().toLowerCase();
    const auth=await authorize(req,kind);
    if(!auth.ok)return Response.json({error:auth.error,code:auth.code},{status:auth.status});
    const action=String(body.action||"submit").trim().toLowerCase();
    const db=licenseDb();

    if(action==="reference"){
      const channel=String(body.channel||"update").trim().toLowerCase()==="base"?"base":"update";
      const field=kind==="panel"?"base_source_commit":"engine_source_commit";
      let query=db.from("orbitfs_release_bundles").select(`version,${field},published_at,status`).in("status",["published","superseded"]).not(field,"is",null).order("published_at",{ascending:false,nullsFirst:false}).limit(1);
      if(kind==="panel")query=query.eq("channel",channel);
      const {data,error}=await query;
      if(error)throw error;
      const row=(data||[])[0] as any;
      return Response.json({ok:true,kind,channel,version:row?.version||null,sourceCommit:row?.[field]||null},{headers:{"cache-control":"no-store"}});
    }

    if(action!=="submit")return Response.json({error:"Unsupported release analysis action",code:"RELEASE_ANALYSIS_ACTION_INVALID"},{status:400});
    const version=String(body.version||"").trim(),sourceCommit=String(body.sourceCommit||"").trim(),analysis=body.analysis;
    if(!version||!sourceCommit||!analysis||typeof analysis!=="object"||Array.isArray(analysis))return Response.json({error:"Version, source commit and analysis object are required",code:"RELEASE_ANALYSIS_INVALID"},{status:400});
    if(Buffer.byteLength(JSON.stringify(analysis),"utf8")>MAX_ANALYSIS_BYTES)return Response.json({error:"Release analysis is too large",code:"RELEASE_ANALYSIS_TOO_LARGE"},{status:413});
    const bundle=await getOrbitfsReleaseBundle(version);
    if(!bundle)return Response.json({error:`OrbitFS release bundle ${version} was not found`,code:"RELEASE_BUNDLE_NOT_FOUND"},{status:404});
    const expected=kind==="panel"?bundle.baseSourceCommit:bundle.engineSourceCommit;
    if(!expected||expected!==sourceCommit)return Response.json({error:"Release analysis source commit does not match the attached artifact",code:"RELEASE_ANALYSIS_COMMIT_MISMATCH"},{status:409});
    const technicalAnalysis={...(bundle.technicalAnalysis||{}),[kind]:analysis};
    const {data,error}=await db.from("orbitfs_release_bundles").update({technical_analysis:technicalAnalysis,updated_at:new Date().toISOString()}).eq("version",version).select("*").single();
    if(error)throw error;
    return Response.json({ok:true,version,kind,technicalAnalysis:data.technical_analysis},{headers:{"cache-control":"no-store"}});
  }catch(e:any){return Response.json({error:e?.message||"Release analysis failed",code:"RELEASE_ANALYSIS_ERROR"},{status:Number(e?.status)||500})}
}
