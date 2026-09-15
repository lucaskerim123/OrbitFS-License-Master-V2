import {issuePasswordReset,resolveResetUser} from "@/lib/password-reset-server";

export async function POST(req:Request){
 const body=await req.json().catch(()=>({})),email=String(body.email||"").trim().toLowerCase();
 if(!email||!email.includes("@"))return Response.json({error:"Enter a valid email address."},{status:400});
 try{
  const user=await resolveResetUser(email);
  if(user){
   const ip=(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||null;
   await issuePasswordReset(user,new URL(req.url).origin,null,ip);
  }
  return Response.json({ok:true,message:"If that email belongs to an OrbitFS account, a reset link has been sent."});
 }catch(e:any){
  console.error("password reset request failed",e);
  return Response.json({ok:true,message:"If that email belongs to an OrbitFS account, a reset link has been sent."});
 }
}
