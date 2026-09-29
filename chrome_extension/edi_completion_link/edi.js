'use strict';

const processedValues = new WeakMap();
const directTransferValues = new WeakMap();
let toastTimer = 0;

function visible(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 80 && rect.height > 10 && style.display !== 'none' && style.visibility !== 'hidden';
}

function qrInputs() {
  if (!/\/outboundQrAll\.do$/i.test(location.pathname)) return [];
  const candidates = [...document.querySelectorAll('input:not([type]),input[type="text"]')]
    .filter(input => !input.disabled && !input.readOnly && visible(input));
  const blankLike = candidates.filter(input => !/^\d{4}\/\d{2}\/\d{2}$/.test(input.value.trim()));
  const groups = new Map();
  for (const input of blankLike) {
    const rect = input.getBoundingClientRect();
    const key = `${Math.round(rect.left / 8) * 8}:${Math.round(rect.width / 8) * 8}`;
    const group = groups.get(key) || [];
    group.push(input); groups.set(key,group);
  }
  return [...groups.values()].sort((a,b) => b.length-a.length)[0]?.slice(0,10) || [];
}

function showStatus(text,kind = 'ok') {
  let node = document.getElementById('miyama-edi-link-status');
  if (!node) {
    node = document.createElement('div');
    node.id = 'miyama-edi-link-status';
    Object.assign(node.style,{
      position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483647',maxWidth:'440px',
      padding:'14px 18px',borderRadius:'6px',font:'bold 15px/1.5 system-ui,sans-serif',
      color:'#fff',boxShadow:'0 3px 14px rgba(0,0,0,.3)'
    });
    document.documentElement.append(node);
  }
  node.textContent = text;
  node.style.background = kind === 'error' ? '#b42318' : kind === 'warn' ? '#8a5600' : '#166534';
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; },6000);
}

async function complete(input,capturedValue) {
  const qr = String(capturedValue ?? input.value ?? '').replace(/[\r\n]+$/g,'');
  if (!qr || processedValues.get(input) === qr) return;
  processedValues.set(input,qr);
  try {
    const response = await chrome.runtime.sendMessage({type:'EDI_QR_CAPTURED',qr});
    if (response?.ok) showStatus('完納処理待ちを更新しました');
    else {
      if (processedValues.get(input) === qr) processedValues.delete(input);
      showStatus(response?.error || '完納処理待ちを更新できませんでした','error');
    }
  } catch (error) {
    if (processedValues.get(input) === qr) processedValues.delete(input);
    showStatus(`完納連携エラー: ${error.message}`,'error');
  }
}

function setNativeValue(input,value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  if (setter) setter.call(input,value);
  else input.value = value;
}

function isDirectTransfer(input) {
  return directTransferValues.get(input) === String(input?.value || '').replace(/[\r\n]+$/g,'');
}

function fillPrototypeQr(qr) {
  const inputs = qrInputs();
  if (!inputs.length) throw Error('EDIのQR入力欄を検出できません。');
  const target = inputs.find(input => !String(input.value || '').trim());
  if (!target) throw Error('EDIのQR入力欄10件がすべて使用中です。');
  const value = EdiFormat.toKeyboardValue(qr);
  if (!value) throw Error('転送するQRデータがありません。');
  directTransferValues.set(target,value);
  target.scrollIntoView({block:'center'});
  target.focus({preventScroll:true});
  setNativeValue(target,value);
  const index = inputs.indexOf(target)+1;
  showStatus(`試作転送: 9項目の推測形式へ変換し、${index}件目へ入力しました。内容確認後にEnterキーを押してください。`,'warn');
  return index;
}

document.addEventListener('keydown',event => {
  if (event.key === 'Enter' && !isDirectTransfer(event.target) && qrInputs().includes(event.target)) {
    const qr = event.target.value;
    setTimeout(() => complete(event.target,qr),0);
  }
},true);
document.addEventListener('change',event => {
  if (!isDirectTransfer(event.target) && qrInputs().includes(event.target)) complete(event.target);
},true);
document.addEventListener('focusout',event => {
  if (!isDirectTransfer(event.target) && qrInputs().includes(event.target)) complete(event.target);
},true);

chrome.runtime.onMessage.addListener((message,_sender,sendResponse) => {
  if (message?.type !== 'FILL_EDI_QR_PROTOTYPE') return false;
  try {
    const index = fillPrototypeQr(message.qr);
    sendResponse({ok:true,index});
  } catch (error) {
    sendResponse({ok:false,error:error.message});
  }
  return false;
});

showStatus(qrInputs().length >= 10 ? '完納・EDI連携 準備完了' : 'EDIのQR入力欄を確認中','warn');
