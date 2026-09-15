import {NextRequest,NextResponse} from 'next/server';
import {paypalToken,stripeRequest,userRpc} from '@/lib/paymentServer';

export async function POST(req:NextRequest){
 try{
  const auth=req.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer '))return NextResponse.json({error:'Unauthorized'},{status:401});
  const token=auth.slice(7);
  const body=await req.json().catch(()=>({}));
  const invoiceId=String(body.invoice_id||'');
  const amountCents=Math.round(Number(body.amount_cents||0));
  const reason=String(body.reason||'').trim()||null;
  const paymentId=body.payment_id?String(body.payment_id):null;
  if(!invoiceId||amountCents<=0)return NextResponse.json({error:'Invalid refund request'},{status:400});

  const ctx:any=await userRpc(token,'admin_refund_context',{p_invoice_id:invoiceId,p_payment_id:paymentId});
  if(amountCents>Number(ctx.refundable_cents||0))return NextResponse.json({error:'Refund amount exceeds refundable balance'},{status:400});
  if(!ctx.provider_reference)return NextResponse.json({error:'Original payment reference is missing'},{status:400});

  let externalReference='';
  let providerPayload:any={};
  if(ctx.method==='stripe'){
    const form=new URLSearchParams();
    form.set('payment_intent',String(ctx.provider_reference));
    form.set('amount',String(amountCents));
    if(reason)form.set('metadata[orbitfs_reason]',reason);
    form.set('metadata[orbitfs_invoice_id]',invoiceId);
    const d:any=await stripeRequest('/v1/refunds',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
    externalReference=String(d.id||''); providerPayload={stripe_refund_id:d.id,status:d.status};
  }else if(ctx.method==='paypal'){
    const {base,token:paypalAccess}=await paypalToken();
    const r=await fetch(`${base}/v2/payments/captures/${encodeURIComponent(String(ctx.provider_reference))}/refund`,{method:'POST',headers:{authorization:`Bearer ${paypalAccess}`,'content-type':'application/json','paypal-request-id':`orbitfs-refund-${invoiceId}-${Date.now()}`},body:JSON.stringify({amount:{value:(amountCents/100).toFixed(2),currency_code:String(ctx.currency||'AUD').toUpperCase()},note_to_payer:reason||'OrbitFS invoice refund'})});
    const d:any=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d?.message||`PayPal refund failed (${r.status})`);
    externalReference=String(d.id||''); providerPayload={paypal_refund_id:d.id,status:d.status};
  }else return NextResponse.json({error:'Original payment method does not support automatic refunds'},{status:400});

  const recorded=await userRpc(token,'admin_record_external_refund',{p_invoice_id:invoiceId,p_payment_id:String(ctx.payment_id),p_amount_cents:amountCents,p_external_reference:externalReference,p_reason:reason,p_metadata:providerPayload});
  return NextResponse.json({ok:true,method:ctx.method,external_reference:externalReference,...recorded});
 }catch(e:any){return NextResponse.json({error:e.message||'Refund failed'},{status:500})}
}
