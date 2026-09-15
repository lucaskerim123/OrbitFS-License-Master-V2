import {issueEmailVerification,resolveVerificationUser} from "@/lib/email-verification-server";
export async function POST(req:Request){
 const body=await req.json().catch(()=>({})),email=String(body.email||"").trim().toLowerCase();
 if(!email||!email.includes("@"))return Response.json({error:"Enter a valid email address."},{status:400});
 try{
  const user=await resolveVerificationUser(email);
  if(user){
   const ip=(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||null;
   await issueEmailVerification(user,new URL(req.url).origin,ip);
  }
  return Response.json({ok:true,message:"If that OrbitFS account still needs verification, a new verification email has been sent."});
 }catch(e:any){
  console.error("verification resend failed",e);
  return Response.json({ok:true,message:"If that OrbitFS account still needs verification, a new verification email has been sent."});
 }
}
