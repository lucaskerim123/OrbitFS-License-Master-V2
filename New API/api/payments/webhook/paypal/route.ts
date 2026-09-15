import {NextRequest,NextResponse} from 'next/server';
import {paymentRuntime} from '@/lib/paymentRuntime';
import {sendPaidLifecycleForInvoice} from '@/lib/mail-lifecycle-server';
import {orbitfsStoreOrigin} from '@/lib/site-origin';

export async function POST(req:NextRequest){
 try{
  const raw=await req.text();
  const origin=await orbitfsStoreOrigin(req.url);
  const names=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];
  const headers:Record<string,string>={'content-type':'application/json'};
  for(const name of names)headers[name]=req.headers.get(name)||'';
  const r=await paymentRuntime('webhook_paypal',{origin,rawBody:raw,headers});
  const text=await r.text();
  try{const d=JSON.parse(text);if(r.ok&&d?.paid&&d?.invoice_id)await sendPaidLifecycleForInvoice(String(d.invoice_id)).catch(e=>console.error('PayPal webhook lifecycle mail failed',e))}catch{}
  return new NextResponse(text,{status:r.status,headers:{'content-type':r.headers.get('content-type')||'application/json'}});
 }catch(e:any){return NextResponse.json({error:e.message||'PayPal webhook failed'},{status:500})}
}
