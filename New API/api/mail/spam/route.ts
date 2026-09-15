import {requireMailUser,isMailAdmin} from "@/lib/mail-auth";
export async function GET(req:Request){
 const ctx:any=await requireMailUser(req);if(ctx.error)return ctx.error;
 if(!isMailAdmin(ctx,"mail.settings"))return Response.json({error:"Mail spam settings denied."},{status:403});
 const {data,error}=await ctx.db.rpc("mail_spam_admin",{action:"list",payload:{}});
 if(error)return Response.json({error:error.message},{status:400});return Response.json(data||{});
}
export async function POST(req:Request){
 const ctx:any=await requireMailUser(req);if(ctx.error)return ctx.error;
 if(!isMailAdmin(ctx,"mail.settings"))return Response.json({error:"Mail spam settings denied."},{status:403});
 const body=await req.json().catch(()=>({}));const {data,error}=await ctx.db.rpc("mail_spam_admin",{action:"upsert",payload:body});
 if(error)return Response.json({error:error.message},{status:400});return Response.json(data||{ok:true});
}
export async function DELETE(req:Request){
 const ctx:any=await requireMailUser(req);if(ctx.error)return ctx.error;
 if(!isMailAdmin(ctx,"mail.settings"))return Response.json({error:"Mail spam settings denied."},{status:403});
 const body=await req.json().catch(()=>({}));const {data,error}=await ctx.db.rpc("mail_spam_admin",{action:"delete",payload:body});
 if(error)return Response.json({error:error.message},{status:400});return Response.json(data||{ok:true});
}
