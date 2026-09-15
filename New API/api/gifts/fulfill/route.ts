import {NextRequest,NextResponse} from 'next/server';
import {userFromToken} from '@/lib/paymentServer';
import {fulfillGiftOrder,orderOwnedBy} from '@/lib/giftServer';

export async function POST(req:NextRequest){
  try{
    const auth=req.headers.get('authorization')||'';
    if(!auth.startsWith('Bearer '))return NextResponse.json({error:'Unauthorized'},{status:401});
    const token=auth.slice(7),user=await userFromToken(token),body=await req.json();
    const orderId=String(body.order_id||'');
    if(!orderId)return NextResponse.json({error:'order_id is required'},{status:400});
    if(!await orderOwnedBy(orderId,user.id))return NextResponse.json({error:'Order not found'},{status:404});
    const result=await fulfillGiftOrder(orderId,new URL(req.url).origin);
    return NextResponse.json(result);
  }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
