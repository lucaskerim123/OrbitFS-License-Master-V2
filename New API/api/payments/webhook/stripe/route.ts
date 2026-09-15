import {NextRequest,NextResponse} from 'next/server';
import {sendPaidLifecycleForInvoice} from '@/lib/mail-lifecycle-server';

const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://zekejuprrsurjmwgzexw.supabase.co';

export async function POST(req:NextRequest){
 try{
  const raw=await req.text();
  const r=await fetch(`${SUPABASE_URL}/functions/v1/stripe-payment-events`,{
   method:'POST',
   headers:{'content-type':req.headers.get('content-type')||'application/json','stripe-signature':req.headers.get('stripe-signature')||''},
   body:raw,
   cache:'no-store'
  });
  const text=await r.text();
  try{
   const d=JSON.parse(text);
   if(r.ok&&d?.paid&&d?.invoice_id)await sendPaidLifecycleForInvoice(String(d.invoice_id)).catch(e=>console.error('Stripe webhook lifecycle mail failed',e));
  }catch{}
  return new NextResponse(text,{status:r.status,headers:{'content-type':r.headers.get('content-type')||'application/json'}});
 }catch(e:any){return NextResponse.json({error:e.message||'Stripe webhook failed'},{status:500})}
}
