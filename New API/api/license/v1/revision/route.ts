import {licenseMasterFetch} from "@/lib/license-master";
import {cors,reply} from "@/lib/license-api";

export async function GET(){
  try{return reply(await licenseMasterFetch("/license/revision",{},"billing"));}
  catch(e:any){return reply({error:e.message||"License Master revision request failed",authority:"license-master"},503);}
}
export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}