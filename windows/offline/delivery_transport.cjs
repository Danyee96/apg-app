'use strict';
function deliveryTransport(request) {
  return async operation => {
    const payload=operation.payload;
    if (operation.action !== 'save_unified_delivery' || payload.offline_delivery !== true || payload.id || payload.request_key || !Array.isArray(payload.items) || payload.items.some(item=>Number(item.bilty_received || 0)!==0 || Number(item.service_received || 0)!==0)) return {status:422,message:'Only standard deliveries without cash can sync here.'};
    const response=await request('save_unified_delivery',{...payload,request_key:operation.id});
    if (!response || !Number.isInteger(response.status)) return response;
    if (response.status===201 && Number.isSafeInteger(response.body?.id) && response.body.id>0 && typeof response.body.reference==='string' && response.body.reference) return {status:201,operationId:operation.id,committed:true,result:response.body};
    return {status:response.status,message:typeof response.body?.error==='string'?response.body.error:'Unexpected server response.'};
  };
}
module.exports={deliveryTransport};
