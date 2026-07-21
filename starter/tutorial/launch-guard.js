(function installTutorialLaunchGuard(globalScope) {
  'use strict';

  const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

  function assessLocation(value) {
    let url;
    try {
      url = value instanceof URL ? value : new URL(String(value));
    } catch {
      return { allowed: false, reason: 'invalid-url', url: null };
    }
    if (url.protocol === 'file:') {
      return { allowed: false, reason: 'file-protocol', url };
    }
    if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
      return { allowed: false, reason: 'non-loopback', url };
    }
    return { allowed: true, reason: 'loopback-http', url };
  }

  function toWindowsPath(url) {
    if (!url || url.protocol !== 'file:') return null;
    let pathname = decodeURIComponent(url.pathname).replace(/\//g, '\\');
    if (/^\\[A-Za-z]:\\/.test(pathname)) pathname = pathname.slice(1);
    return pathname;
  }

  function launcherDetails(currentUrl) {
    const fallbackCommand = 'npm run tutorial:open';
    if (!currentUrl || currentUrl.protocol !== 'file:') {
      return { launcherPath: null, command: fallbackCommand };
    }
    const launcherUrl = new URL('../../啟動操作教學.cmd', currentUrl);
    const launcherPath = toWindowsPath(launcherUrl);
    const escapedPath = launcherPath.replace(/'/g, "''");
    return {
      launcherPath,
      command: `Start-Process -FilePath '${escapedPath}'`
    };
  }

  function recoveryUrl(currentUrl) {
    const scenario = currentUrl?.searchParams.get('scenario') || 'overview';
    return `http://127.0.0.1:4173/tutorial/?scenario=${encodeURIComponent(scenario)}`;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function renderRecovery(assessment = assessLocation(globalScope.location?.href || '')) {
    const details = launcherDetails(assessment.url);
    const page = makeElement('main', 'launch-recovery');
    const card = makeElement('section', 'launch-recovery-card');
    card.setAttribute('role', 'alert');

    card.append(
      makeElement('p', 'launch-recovery-kicker', 'BlankSeed Browser 操作教學'),
      makeElement('h1', '', '已攔截不正確的教學載入方式'),
      makeElement(
        'p',
        'launch-recovery-message',
        assessment.reason === 'file-protocol'
          ? '教學頁不能直接以 file:// 開啟，因為它需要從本機教學伺服器載入正式介面。'
          : '教學頁只允許從本機回環網址啟動，避免把操作介面暴露到外部網路。'
      )
    );

    const steps = document.createElement('ol');
    const firstStep = document.createElement('li');
    firstStep.textContent = details.launcherPath
      ? '雙擊下列快捷啟動檔；它會啟動本機教學伺服器並自動開啟正確網址。'
      : '在 starter 目錄執行下列啟動指令。';
    const secondStep = document.createElement('li');
    secondStep.textContent = '完成後可關閉這個錯誤分頁。';
    steps.append(firstStep, secondStep);
    card.append(steps);

    if (details.launcherPath) {
      const pathLabel = makeElement('p', 'launch-recovery-label', '快捷啟動檔');
      const pathOutput = makeElement('code', 'launch-recovery-path', details.launcherPath);
      card.append(pathLabel, pathOutput);
    }

    const commandLabel = makeElement('label', 'launch-recovery-label', 'PowerShell 輔助啟動指令');
    const commandInput = document.createElement('input');
    commandInput.className = 'launch-recovery-command';
    commandInput.readOnly = true;
    commandInput.value = details.command;
    commandLabel.append(commandInput);

    const actions = makeElement('div', 'launch-recovery-actions');
    const copyButton = makeElement('button', 'primary-guide-button', '複製啟動指令');
    copyButton.type = 'button';
    const expectedUrl = document.createElement('a');
    expectedUrl.href = recoveryUrl(assessment.url);
    expectedUrl.textContent = '檢查正確網址';
    const status = makeElement('p', 'launch-recovery-status', '');
    status.setAttribute('role', 'status');
    copyButton.addEventListener('click', async () => {
      commandInput.select();
      try {
        await navigator.clipboard.writeText(commandInput.value);
        status.textContent = '已複製啟動指令。';
      } catch {
        status.textContent = '瀏覽器未允許自動複製；指令已選取，請按 Ctrl+C。';
      }
    });
    actions.append(copyButton, expectedUrl);
    card.append(commandLabel, actions, status);
    page.append(card);
    document.body.replaceChildren(page);
    document.documentElement.dataset.tutorialReady = 'blocked';
    globalScope.blankseedTutorialReady = false;
  }

  function loadTutorialApplication() {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'app.js';
    document.body.append(script);
  }

  const assessment = assessLocation(globalScope.location?.href || '');
  globalScope.blankseedTutorialLaunchGuard = {
    assessment,
    assessLocation,
    launcherDetails,
    recoveryUrl,
    renderRecovery
  };
  if (!assessment.allowed && typeof document !== 'undefined') {
    renderRecovery(assessment);
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      addEventListener('DOMContentLoaded', loadTutorialApplication, { once: true });
    } else {
      loadTutorialApplication();
    }
  }
})(globalThis);
