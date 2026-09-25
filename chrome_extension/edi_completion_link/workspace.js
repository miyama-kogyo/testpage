'use strict';

const button = document.getElementById('openWorkspace');
const status = document.getElementById('workspaceStatus');

document.documentElement.dataset.ediWorkspaceReady = 'true';
status.textContent = '連携拡張機能を確認しました';
status.className = 'status ready';

button.addEventListener('click',async () => {
  button.disabled = true;
  status.textContent = '2画面を準備しています…';
  status.className = 'status working';
  try {
    const response = await chrome.runtime.sendMessage({
      type:'OPEN_WORKSPACE',
      bounds:{left:screen.availLeft,top:screen.availTop,width:screen.availWidth,height:screen.availHeight}
    });
    if (!response?.ok) throw Error(response?.error || '画面を開けませんでした。');
  } catch (error) {
    button.disabled = false;
    status.textContent = `起動できませんでした: ${error.message}`;
    status.className = 'status error';
  }
});
