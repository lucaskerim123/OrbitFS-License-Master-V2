import {completeEmailVerification} from "@/lib/email-verification-server";
export async function POST(req:Request){
 const body=await req.json().catch(()=>({})),token=String(body.token||"");
 if(!token)return Response.json({error:"Verification token is required."},{status:400});
 const result=await completeEmailVerification(token);
 return Response.json(result,{status:result.ok?200:400});
}
