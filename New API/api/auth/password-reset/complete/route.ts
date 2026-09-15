import {completePasswordReset} from "@/lib/password-reset-server";

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));
 const token=String(body.token||""),password=String(body.password||"");
 if(!token)return Response.json({error:"Reset token is required."},{status:400});
 if(password.length<8)return Response.json({error:"Password must be at least 8 characters."},{status:400});
 const result=await completePasswordReset(token,password);
 if(!result.ok)return Response.json({error:result.error},{status:400});
 return Response.json({ok:true,message:"Password updated. You can now sign in."});
}
