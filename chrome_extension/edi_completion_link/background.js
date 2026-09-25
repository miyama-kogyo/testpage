'use strict';

const completionTabs = new Map();

function normalizeQr(value) {
  return String(value || '').replace(/[\r\n]+$/g,'');
}

chrome.tabs.onRemoved.addListener(tabId => completionTabs.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId,changeInfo) => {
  if (changeInfo.url && !/^https:\/\/(?:miyama-kogyo\.github\.io\/(?:apps|testpage)|motsu922\.github\.io\/testpage)\/order_completion\.html/i.test(changeInfo.url)) {
    completionTabs.delete(tabId);
  }
});

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
  return false;
});
