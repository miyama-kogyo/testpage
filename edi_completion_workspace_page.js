'use strict';

const workspaceButton = document.getElementById('openWorkspace');
const workspaceStatus = document.getElementById('workspaceStatus');

workspaceButton.addEventListener('click',() => {
  workspaceStatus.textContent = '2画面を準備しています…';
  setTimeout(() => {
    if (document.documentElement.dataset.ediWorkspaceReady !== 'true') {
      workspaceStatus.textContent = '連携拡張機能をChromeに読み込んでから再度お試しください。';
      workspaceStatus.className = 'status error';
    }
  },1200);
});
