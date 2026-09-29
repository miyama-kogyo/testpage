'use strict';

const completionTabs = new Map();
const pairKey = completionTabId => `workspace_pair_${completionTabId}`;

function normalizeQr(value) {
  return String(value || '').replace(/[\r\n]+$/g,'');
}

chrome.tabs.onRemoved.addListener(tabId => {
  completionTabs.delete(tabId);
  chrome.storage.session.remove(pairKey(tabId)).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId,changeInfo) => {
  if (changeInfo.url && !/^https:\/\/(?:miyama-kogyo\.github\.io\/(?:apps|testpage)|motsu922\.github\.io\/testpage)\/order_completion\.html/i.test(changeInfo.url)) {
    completionTabs.delete(tabId);
  }
});

async function saveWorkspacePair(completionTabId,ediTabId) {
  await chrome.storage.session.set({[pairKey(completionTabId)]:ediTabId});
}

async function pairedEdiTab(completionTabId) {
  const stored = await chrome.storage.session.get(pairKey(completionTabId));
  const tabId = Number(stored[pairKey(completionTabId)]);
  if (!Number.isInteger(tabId)) return null;
  try { return await chrome.tabs.get(tabId); }
  catch (_) {
    await chrome.storage.session.remove(pairKey(completionTabId));
    return null;
  }
}

function isQrPageUrl(value) {
  try { return /\/outboundQrAll\.do$/i.test(new URL(String(value || '')).pathname); }
  catch (_) { return false; }
}

function findMatches(qr) {
  const matches = [];
  for (const [completionTabId,state] of completionTabs) {
    for (const item of state.items) {
      if (item.qr === qr) matches.push({completionTabId,item});
    }
  }
  return matches;
}

async function refreshCompletionStates() {
  const tabs = await chrome.tabs.query({url:[
    'https://miyama-kogyo.github.io/apps/order_completion.html*',
    'https://miyama-kogyo.github.io/testpage/order_completion.html*',
    'https://motsu922.github.io/testpage/order_completion.html*'
  ]});
  await Promise.all(tabs.map(async tab => {
    if (!tab.id) return;
    try {
      const state = await chrome.tabs.sendMessage(tab.id,{type:'GET_COMPLETION_STATE'});
      if (state) completionTabs.set(tab.id,state);
    } catch (_) {
      completionTabs.delete(tab.id);
    }
  }));
}

async function handleCapturedQr(qr) {
  let matches = findMatches(qr);
  if (!matches.length) {
    await refreshCompletionStates();
    matches = findMatches(qr);
  }
  if (matches.length !== 1) {
    return {ok:false,matched:false,error:matches.length ? '同じQRが複数の完納画面にあります。対象画面を1つだけ開いてください。' : '完納処理待ちに一致するQRがありません。'};
  }
  const match = matches[0];
  try {
    const response = await chrome.tabs.sendMessage(match.completionTabId,{
      type:'MARK_COMPLETION_POSTED',
      key:match.item.key,
      qr:match.item.qr
    });
    return response || {ok:false,matched:true,error:'完納画面から応答がありません。'};
  } catch (error) {
    return {ok:false,matched:true,error:error.message};
  }
}

async function openWorkspace(tab,bounds) {
  if (!tab?.id) throw Error('起動元のタブを確認できません。');
  const left = Number.isFinite(Number(bounds?.left)) ? Math.round(Number(bounds.left)) : 0;
  const top = Number.isFinite(Number(bounds?.top)) ? Math.round(Number(bounds.top)) : 0;
  const width = Math.max(1000,Math.round(Number(bounds?.width) || 1600));
  const height = Math.max(640,Math.round(Number(bounds?.height) || 900));
  const gap = 8;
  const leftWidth = Math.floor((width-gap)/2);
  const rightWidth = width-gap-leftWidth;
  const completionUrl = 'https://miyama-kogyo.github.io/testpage/order_completion.html';
  const ediUrl = 'https://www.toyotawg-edi1.jp/400259565-01/login.do?command=executeLogoff';
  await chrome.windows.create({tabId:tab.id,type:'popup',left,top,width:leftWidth,height});
  await chrome.tabs.update(tab.id,{url:completionUrl});
  const ediWindow = await chrome.windows.create({url:ediUrl,type:'popup',left:left+leftWidth+gap,top,width:rightWidth,height});
  const ediTab = ediWindow.tabs?.[0] || (await chrome.tabs.query({windowId:ediWindow.id}))[0];
  if (!ediTab?.id) throw Error('右側のEDI画面を確認できません。');
  await saveWorkspacePair(tab.id,ediTab.id);
  return {ok:true};
}

async function transferFirstQr(completionTabId) {
  let state = completionTabs.get(completionTabId);
  if (!state?.items?.length) {
    await refreshCompletionStates();
    state = completionTabs.get(completionTabId);
  }
  const item = state?.items?.[0];
  if (!item) throw Error('転送できる完納処理待ちQRがありません。');
  const paired = await pairedEdiTab(completionTabId);
  const pairedIsQrPage = paired && isQrPageUrl(paired.url);
  let ediTab = pairedIsQrPage ? paired : null;
  if (!ediTab) {
    const ediTabs = await chrome.tabs.query({url:[
      'https://www.toyotawg-edi1.jp/*/outboundQrAll.do*',
      'https://www.toyotawg-edi.jp/*/outboundQrAll.do*'
    ]});
    if (ediTabs.length !== 1) throw Error(ediTabs.length ? `EDIのQR読取画面を特定できません（候補${ediTabs.length}件）。専用ページから2画面を開き直してください。` : 'EDIのQR読取画面を開いてください。');
    ediTab = ediTabs[0];
  }
  const response = await chrome.tabs.sendMessage(ediTab.id,{
    type:'FILL_EDI_QR_PROTOTYPE',
    qr:item.qr
  });
  if (!response?.ok) throw Error(response?.error || 'EDIへ転送できませんでした。');
  return {ok:true,index:response.index};
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
  const tabId = sender.tab?.id;
  if (!tabId) return false;

  if (message?.type === 'COMPLETION_STATE') {
    completionTabs.set(tabId,{
      company:String(message.company || ''),
      items:(Array.isArray(message.items) ? message.items : []).map(item => ({
        key:String(item.key || ''),
        qr:normalizeQr(item.qr)
      })).filter(item => item.key && item.qr)
    });
    sendResponse({ok:true});
    return false;
  }

  if (message?.type === 'EDI_QR_CAPTURED') {
    const qr = normalizeQr(message.qr);
    handleCapturedQr(qr).then(sendResponse).catch(error => sendResponse({ok:false,matched:false,error:error.message}));
    return true;
  }
  if (message?.type === 'OPEN_WORKSPACE') {
    openWorkspace(sender.tab,message.bounds).then(sendResponse).catch(error => sendResponse({ok:false,error:error.message}));
    return true;
  }
  if (message?.type === 'TRANSFER_FIRST_QR') {
    transferFirstQr(tabId).then(sendResponse).catch(error => sendResponse({ok:false,error:error.message}));
    return true;
  }
  return false;
});
