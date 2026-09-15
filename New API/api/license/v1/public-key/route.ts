import {cors,publicSigningPem,reply} from "@/lib/license-api";

export async function GET(){
  const key=publicSigningPem();
  if(!key)return reply({error:"Website licence public signing key is not configured",code:"PUBLIC_KEY_NOT_CONFIGURED"},503);
  return new Response(key,{status:200,headers:{...cors,"content-type":"text/plain; charset=utf-8"}});
}

export async function OPTIONS(){return new Response(null,{status:204,headers:cors})}
