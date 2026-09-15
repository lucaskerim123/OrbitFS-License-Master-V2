import {createClient} from "@supabase/supabase-js";
import {issueEmailVerification} from "@/lib/email-verification-server";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://zekejuprrsurjmwgzexw.supabase.co";
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY!;
const validUsername=(value:string)=>/^[A-Za-z0-9._-]{3,32}$/.test(value);

export async function POST(req:Request){
  const body=await req.json().catch(()=>({}));
  const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),username=String(body.username||"").trim();
  if(!validUsername(username))return Response.json({error:"Username must be 3–32 characters using letters, numbers, dots, underscores or hyphens."},{status:400});
  if(!email||!email.includes("@")||password.length<8)return Response.json({error:"Enter a valid email and a password with at least 8 characters."},{status:400});

  const db=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {data:existingCustomer}=await db.from("customers").select("id,auth_user_id").ilike("email",email).maybeSingle();
  if(existingCustomer)return Response.json({error:"An OrbitFS account already exists for that email address."},{status:409});

  const {data:created,error:createError}=await db.auth.admin.createUser({
    email,
    password,
    email_confirm:true,
    user_metadata:{username,display_name:username}
  });
  if(createError||!created.user)return Response.json({error:createError?.message||"Could not create account."},{status:400});

  const userId=created.user.id;
  try{
    const {error:profileError}=await db.from("user_profiles").upsert({
      id:userId,role:"user",status:"active",display_name:username,email_verified_at:null,updated_at:new Date().toISOString()
    },{onConflict:"id"});
    if(profileError)throw profileError;

    const {error:customerError}=await db.from("customers").insert({
      auth_user_id:userId,
      email,
      name:username,
      username,
      display_name:username,
      status:"active",
      email_verified_at:null,
      metadata:{registration_source:"public"},
      updated_at:new Date().toISOString()
    });
    if(customerError)throw customerError;

    const ip=(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||null;
    await issueEmailVerification({id:userId,email,name:username},new URL(req.url).origin,ip);

    try{await db.from("admin_audit_log").insert({actor_id:null,action:"customer.registered",target_type:"customer",target_id:userId,detail:{email,username,verification:"orbitfs"}})}catch{}
    return Response.json({ok:true,user_id:userId,message:"Account created. Check your email for the OrbitFS verification link before signing in."});
  }catch(e:any){
    try{await db.auth.admin.deleteUser(userId)}catch{}
    console.error("OrbitFS registration failed",e);
    return Response.json({error:e?.message||"Could not create OrbitFS account."},{status:500});
  }
}
