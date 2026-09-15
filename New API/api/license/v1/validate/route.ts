import {cors,reply} from "@/lib/license-api";

const masterUrl=()=>String(process.env.LICENSE_API_BASE_URL||process.env.MASTER_API_URL||"https://incendiarynetworks.cc/api").replace(/\/$/,"");

export async function POST(req:Request){
  const body=await req.json().catch(()=>({}));
  try{
    const response=await fetch(`${masterUrl()}/license/validate`,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify(body),cache:"no-store"});
    const text=await response.text();
    let data:any;try{data=text?JSON.parse(text):{};}catch{data={error:text||`License Master returned HTTP ${response.status}`};}
    return reply(data,response.status);
  }catch(e:any){
    return reply({error:e.message||"License Master validation request failed",code:"LICENSE_MASTER_UNAVAILABLE"},503);
  }
}

export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}