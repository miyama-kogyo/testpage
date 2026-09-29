'use strict';

const pendingRequests = new Map();
let latestState = null;
let prototypeButton = null;
let prototypeStatus = null;
let prototypeTransferredKey = '';

function sendRuntimeMessage(message) {
  try {
    if (!chrome.runtime?.id) return;
    const request = chrome.runtime.sendMessage(message);
    if (request && typeof request.catch === 'function') request.catch(() => {});
  } catch (_) {
    // The current content script becomes invalid when an unpacked extension is reloaded.
  }
}

async function requestRuntimeMessage(message) {
  try {
    if (!chrome.runtime?.id) throw Error('拡張機能を再読み込みし、画面を更新してください。');
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    throw Error(error?.message || '拡張機能と通信できません。');
  }
}

function updatePrototypeButton() {
  if (!prototypeButton) return;
  const target = Array.isArray(latestState?.items) ? latestState.items.find(item => EdiFormat.isEdiQr(item.qr)) : null;
  const transferred = !!target && target.key === prototypeTransferredKey;
  prototypeButton.disabled = !target || transferred;
  prototypeButton.textContent = !target ? 'EDI転送対象なし' : transferred ? 'EDIへ転送済み（試作）' : 'EDIへ1件転送（試作）';
}

function installPrototypeControls() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar || document.getElementById('miyamaEdiPrototype')) return;
  const wrap = document.createElement('div');
  wrap.id = 'miyamaEdiPrototype';
  Object.assign(wrap.style,{display:'flex',alignItems:'center',gap:'9px',flexWrap:'wrap'});
  prototypeButton = document.createElement('button');
  prototypeButton.type = 'button';
  Object.assign(prototypeButton.style,{
    minHeight:'38px',padding:'8px 16px',border:'0',borderRadius:'4px',
    background:'#177245',color:'#fff',fontWeight:'700',cursor:'pointer'
  });
  prototypeStatus = document.createElement('span');
  Object.assign(prototypeStatus.style,{fontSize:'12px',color:'#536777',maxWidth:'330px'});
  prototypeButton.addEventListener('click',async () => {
    prototypeButton.disabled = true;
    prototypeStatus.textContent = 'EDIへ転送しています…';
    try {
      const response = await requestRuntimeMessage({type:'TRANSFER_FIRST_QR'});
      if (!response?.ok) throw Error(response?.error || '転送できませんでした。');
      prototypeTransferredKey = String(response.key || '');
      prototypeStatus.textContent = `EDIの${response.index}件目へ転送しました。EDI画面でEnterキーを押してください。`;
    } catch (error) {
      prototypeStatus.textContent = error.message;
      prototypeStatus.style.color = '#a52a20';
    } finally {
      updatePrototypeButton();
    }
  });
  wrap.append(prototypeButton,prototypeStatus);
  toolbar.append(wrap);
  updatePrototypeButton();
}

window.addEventListener('message',event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'miyama-order-completion') return;
  if (event.data.type === 'pending-state') {
    const previousFirstKey = String(latestState?.items?.find(item => EdiFormat.isEdiQr(item.qr))?.key || '');
    latestState = {
      company:event.data.company,
      items:event.data.items
    };
    const nextFirstKey = String(latestState?.items?.find(item => EdiFormat.isEdiQr(item.qr))?.key || '');
    if (nextFirstKey !== previousFirstKey && nextFirstKey !== prototypeTransferredKey) prototypeTransferredKey = '';
    sendRuntimeMessage({type:'COMPLETION_STATE',...latestState});
    updatePrototypeButton();
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',installPrototypeControls,{once:true});
else installPrototypeControls();
