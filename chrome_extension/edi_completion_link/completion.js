'use strict';

const pendingRequests = new Map();
let latestState = null;

window.addEventListener('message',event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'miyama-order-completion') return;
  if (event.data.type === 'pending-state') {
    latestState = {
      company:event.data.company,
      items:event.data.items
    };
    chrome.runtime.sendMessage({type:'COMPLETION_STATE',...latestState}).catch(() => {});
    return;
  }
  if (event.data.type === 'mark-result') {
    const finish = pendingRequests.get(String(event.data.requestId || ''));
    if (finish) {
      pendingRequests.delete(String(event.data.requestId || ''));
      finish({ok:!!event.data.ok,matched:true,error:String(event.data.error || '')});
    }
  }
});

chrome.runtime.onMessage.addListener((message,_sender,sendResponse) => {
  if (message?.type === 'GET_COMPLETION_STATE') {
    sendResponse(latestState);
    return false;
  }
  if (message?.type !== 'MARK_COMPLETION_POSTED') return false;
  const requestId = crypto.randomUUID();
  const timer = setTimeout(() => {
    pendingRequests.delete(requestId);
    sendResponse({ok:false,matched:true,error:'完納処理の保存がタイムアウトしました。'});
  },15000);
  pendingRequests.set(requestId,response => {
    clearTimeout(timer);
    sendResponse(response);
  });
  window.postMessage({
    source:'miyama-edi-link',
    type:'mark-posted',
    requestId,
    key:String(message.key || ''),
    qr:String(message.qr || '')
  },location.origin);
  return true;
});
