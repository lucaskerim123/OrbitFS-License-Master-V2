import {requireMailUser,isMailAdmin} from "@/lib/mail-auth";

export async function GET(req:Request){
  const ctx:any=await requireMailUser(req);if(ctx.error)return ctx.error;
  const {data,error}=await ctx.db.rpc("mail_visible_accounts");
  if(error)return Response.json({error:error.message},{status:500});
  return Response.json({
    accounts:data||[],
    mailAdmin:isMailAdmin(ctx),
    capabilities:{
      admin:isMailAdmin(ctx),
      settings:isMailAdmin(ctx,'mail.settings'),
      templates:isMailAdmin(ctx,'mail.templates'),
      queueView:isMailAdmin(ctx,'mail.queue.view')||isMailAdmin(ctx,'mail.queue.manage'),
      queueManage:isMailAdmin(ctx,'mail.queue.manage'),
      canSend:!!ctx.permissions.all||!!ctx.permissions["mail.send"],
      adminSend:!!ctx.permissions.all||!!ctx.permissions["mail.admin.send"]
    }
  });
}
