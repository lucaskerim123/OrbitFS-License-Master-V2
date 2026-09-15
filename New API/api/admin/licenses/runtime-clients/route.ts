import {createClient} from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://zekejuprrsurjmwgzexw.supabase.co";
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_eRN8I1CeZ6zHu-mxK0Zc7g_yO47io5c";
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req:Request){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return Response.json({error:"Authentication required."},{status:401});
  const userDb=createClient(url,publicKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
  const {data:{user},error:userError}=await userDb.auth.getUser(token);
  if(userError||!user)return Response.json({error:"Invalid session."},{status:401});
  const {data:access}=await userDb.rpc("get_my_staff_access");
  if(!access?.permissions?.all&&!access?.permissions?.["licenses.view"]&&!access?.permissions?.["licenses.manage"]&&!access?.permissions?.["settings.permissions"])
    return Response.json({error:"Permission denied."},{status:403});

  const service=createClient(url,serviceKey,{auth:{persistSession:false}});
  const since=new Date(Date.now()-30*24*60*60*1000).toISOString();
  const [{data:installations,error:ie},{data:validations,error:ve}]=await Promise.all([
    service.from("license_installations").select("id,binding_id,installation_id,component_key,device_name,platform,app_version,last_seen_at,registered_at").order("last_seen_at",{ascending:false}),
    service.from("license_validation_log").select("installation_id,component_key,user_agent,created_at").not("installation_id","is",null).gte("created_at",since).order("created_at",{ascending:false}).limit(10000)
  ]);
  if(ie)return Response.json({error:ie.message},{status:500});
  if(ve)return Response.json({error:ve.message},{status:500});

  const map:any={};
  for(const row of installations||[]){
    const key=row.installation_id||row.id;
    if(!map[key])map[key]={installation_id:key,device_name:row.device_name,platform:row.platform,app_version:row.app_version,last_seen_at:row.last_seen_at,registered_at:row.registered_at,components:[],registered:true};
    if(row.component_key&&!map[key].components.includes(row.component_key))map[key].components.push(row.component_key);
    if(row.last_seen_at&&(!map[key].last_seen_at||new Date(row.last_seen_at)>new Date(map[key].last_seen_at)))map[key].last_seen_at=row.last_seen_at;
  }
  for(const row of validations||[]){
    const key=row.installation_id;
    if(!key)continue;
    if(!map[key])map[key]={installation_id:key,device_name:null,platform:null,app_version:null,last_seen_at:row.created_at,registered_at:null,components:[],registered:false};
    if(row.component_key&&!map[key].components.includes(row.component_key))map[key].components.push(row.component_key);
    if(row.created_at&&(!map[key].last_seen_at||new Date(row.created_at)>new Date(map[key].last_seen_at)))map[key].last_seen_at=row.created_at;
  }
  const clients=Object.values(map).sort((a:any,b:any)=>new Date(b.last_seen_at||0).getTime()-new Date(a.last_seen_at||0).getTime());
  const activeToday=clients.filter((r:any)=>r.last_seen_at&&Date.now()-new Date(r.last_seen_at).getTime()<24*60*60*1000).length;
  return Response.json({clients,activeToday,componentRegistrations:(installations||[]).length});
}
