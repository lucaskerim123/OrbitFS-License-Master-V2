import { health } from "../../../src/new-api-authority.js";
import { options, writeJson } from "../../../src/new-api-vercel.js";

export default async function handler(req:any,res:any){
  if(options(req,res))return;
  if(req.method!=="GET")return writeJson(res,405,{error:"Method not allowed"});
  return writeJson(res,200,await health());
}
