import {cors,reply} from "@/lib/license-api";

const masterUrl=()=>String(process.env.LICENSE_API_BASE_URL||process.env.MASTER_API_URL||"https://incendiarynetworks.cc/api").replace(/\/$/,"");

export async function GET(){
  try{
    const response=await fetch(`${masterUrl()}/health`,{cache:"no-store",headers:{accept:"application/json"}});
    const text=await response.text();
    let data:any;try{data=text?JSON.parse(text):{};}catch{data={error:text||`License Master returned HTTP ${response.status}`};}
    return reply({...data,authority:"license-master"},response.status);
  }catch(e:any){
    return reply({ok:false,authority:"license-master",error:e.message||"License Master health request failed"},503);
  }
}

export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}