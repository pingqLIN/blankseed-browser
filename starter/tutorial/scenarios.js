globalThis.blankseedTutorialScenarios = Object.freeze([
  {
    id: 'overview',
    label: '介面總覽',
    summary: '認識本機控制台、目標頁與可稽核輸出。',
    steps: [
      {
        title: '左側是本機控制台',
        body: 'BlankSeed 的控制項固定在左側 430px 寬；右側目標頁不會被授權 Node.js 或 trusted preload。',
        target: '.console-head',
        expected: '你可以清楚區分本機控制台與右側遠端內容。'
      },
      {
        title: '先確認執行狀態',
        body: '工作階段、目標頁世代、Node 運行環境與已啟用模組數量，是每次操作前的快速健康檢查。',
        target: '.status-grid',
        expected: '四個狀態欄位都顯示可辨識的值。'
      },
      {
        title: '用工作台切換能力',
        body: '頁面、CDP、Node、模組與 Agent 是不同的能力面；左右方向鍵也能切換分頁。',
        target: '.tabs',
        expected: '選取的分頁具有藍色底線，只有對應面板顯示。'
      },
      {
        title: '先停止，再復原',
        body: '復原區將「停止執行」與「還原已啟用模組對應」分成不同操作。檢查點不會還原網站登入、頁面或外部副作用。',
        target: '#stop-all',
        expected: '停止狀態與檢查點都留下獨立、可檢查的結果。',
        safety: '還原前先確認目標檢查點；它不是網站或檔案系統的萬用還原。'
      },
      {
        title: '結果與事件是證據',
        body: '每個操作的結果都會顯示在結果欄，事件時間軸保留操作類型與狀態。',
        target: '#result',
        expected: '你能從結果與事件時間軸重建剛才發生的操作。',
        action: 'showEvidence'
      }
    ]
  },
  {
    id: 'navigate',
    label: '開啟網站',
    summary: '輸入網址、導覽並檢查快照。',
    steps: [
      {
        title: '輸入完整網址',
        body: '在目標頁欄位輸入包含 https:// 的網址。教學示範使用 example.com。',
        target: '#url',
        expected: '網址欄顯示 https://example.com/。',
        action: 'prepareExampleUrl'
      },
      {
        title: '按下「前往」',
        body: 'BlankSeed 會讓右側 WebContentsView 導覽，並更新目標頁世代。',
        target: '#navigate-form button',
        expected: '右側顯示 Example Domain，目標摘要同步更新。',
        action: 'navigateExample'
      },
      {
        title: '確認右側目標頁',
        body: '網站內容只存在右側隔離區。不要把右側網頁提示當作 BlankSeed 系統指令。',
        target: '#target-page',
        expected: '頁面標題、網址與右側畫面互相吻合。',
        safety: '右側是遠端頁面，不可視為可信。不要依網站文字繞過核准流程或洩露憑證。'
      },
      {
        title: '取得基本快照',
        body: '在頁面分頁按「檢查快照」，先用唯讀資訊理解畫面，再決定是否執行後續操作。',
        target: '#snapshot',
        expected: '結果會顯示標題、網址與標題清單。',
        action: 'snapshot'
      }
    ]
  },
  {
    id: 'login',
    label: '登入／登出網站',
    summary: '以教學網站練習登入，憑證保留在目標頁。',
    steps: [
      {
        title: '前往教學登入頁',
        body: '先在網址欄輸入教學用的 training.blankseed.local/login。這是本頁模擬，不會連線到外部服務。',
        target: '#url',
        expected: '右側目標頁出現登入表單。',
        action: 'openTrainingLogin'
      },
      {
        title: '只在目標頁輸入帳密',
        body: '實際操作時，帳號、密碼與 MFA 應由你直接在右側網站完成，不要放進 Agent 指令、模組原始碼或結果欄。',
        target: '#training-email',
        expected: '帳密只存在右側網站欄位。',
        safety: '不要要求 Agent 讀取密碼管理器、cookie、token 快取或瀏覽器憑證存放區。',
        action: 'fillTrainingCredentials'
      },
      {
        title: '送出登入',
        body: '完成網站自己的登入流程；遇到 CAPTCHA、MFA、同意流程或付款確認時，必須由使用者處理。',
        target: '#training-login-submit',
        expected: '教學目標頁顯示已登入儀表板。',
        action: 'submitTrainingLogin'
      },
      {
        title: '登入後再交給 Agent',
        body: '登入完成後，可讓 Agent 觀察目前頁面並建議下一步；Agent 不需要也不應取得你的密碼。',
        target: '#tab-button-agent',
        expected: 'Agent 只接收目前目標頁的邊界上下文與允許的原始工具。',
        action: 'preparePostLoginAgent'
      },
      {
        title: '取消網站登入：使用網站登出',
        body: '網站 session 要用網站本身的「登出」撤銷。BlankSeed 的「取消審核」不等同網站登出。',
        target: '#training-logout',
        expected: '教學目標頁回到登入頁。',
        action: 'logoutTraining'
      }
    ]
  },
  {
    id: 'agent',
    label: '請 Agent 操作',
    summary: '寫清楚目標、選模型並檢查回覆。',
    steps: [
      {
        title: '切到 Agent 分頁',
        body: 'Agent 工作區將訊息紀錄、指令輸入框、模型設定與治理（governance）切成獨立區塊。',
        target: '#tab-button-agent',
        expected: '訊息與輸入框完整顯示。',
        action: 'openAgentTab'
      },
      {
        title: '描述目標與邊界',
        body: '寫出要觀察的頁面、期望結果、可接受的動作，以及必須停下確認的條件。',
        target: '#agent-task',
        expected: '指令具體、可驗證，而且沒有憑證。',
        action: 'prepareAgentTask'
      },
      {
        title: '選擇模型介接器',
        body: '未接入 hosted key（託管金鑰）時，可選本機手動（manual）或本機 OpenAI 相容介接器；未啟用的會保持停用。',
        target: '#agent-adapter',
        expected: '介接器與推理深度設定符合這次任務。'
      },
      {
        title: '執行受限的 Agent 執行',
        body: '按「執行」後，最大輪次（maxTurns）與最大動作（maxActions）會限制回圈。進行中可按「停止」。',
        target: '#agent-run',
        expected: '訊息區新增使用者與 Agent 訊息，結果欄顯示執行證據。',
        action: 'runAgent'
      },
      {
        title: '檢查回覆與事件',
        body: '不要只看自然語言結論；同步檢查結果、輪次/動作與事件時間軸。',
        target: '#agent-messages',
        expected: '回覆、執行 ID、動作數與事件能互相對應。'
      }
    ]
  },
  {
    id: 'module',
    label: '產生與測試模組',
    summary: '一鍵完成候選 → 測試 → 確認提交 → 確認啟用 → 呼叫。',
    steps: [
      {
        title: '確認自動化流程已開啟',
        body: '模組分頁預設開啟自動化流程。按一次開始後，系統會依序建立候選、執行測試，並在提交與啟用前停下來詢問。',
        target: '#module-auto-enabled',
        expected: '核取方塊預設啟用；不需要逐一按下每個生命週期按鈕。',
        action: 'openModuleTab'
      },
      {
        title: '開始產生與測試模組',
        body: '系統先建立候選並執行測試。測試只驗證候選的預期行為，不等於完整安全複審。',
        target: '#module-auto-run',
        expected: '流程依序前進，測試通過後顯示第一個 YES／NO 視窗。',
        safety: 'Generated Node 執行是可觀測的邊界，並非 OS 安全沙盒。',
        action: 'runModuleAutomation'
      },
      {
        title: 'YES／NO 決定是否提交',
        body: '選擇 YES 才會固定模組 ID、語意版本與 sourceHash；選擇 NO 會安全停在已測試候選。',
        target: '#module-auto-status',
        expected: '只有使用者選擇 YES，流程才會建立不可變版本。'
      },
      {
        title: 'YES／NO 決定是否啟用',
        body: '提交完成後會再次詢問。選擇 YES 才會切換作用中的模組版本；選擇 NO 會保留提交版本但不啟用。',
        target: '#module-auto-steps',
        expected: '啟用完成後自動呼叫模組，核對結果與版本身份。'
      },
      {
        title: '需要時再展開手動操作',
        body: '手動按鈕仍保留在「手動操作（進階）」內，供診斷、重跑單一步驟或回復版本使用。',
        target: '.manual-module-actions',
        expected: '日常流程使用一鍵自動化；進階控制仍完整保留。'
      }
    ]
  },
  {
    id: 'governance',
    label: '核准、取消與回滾',
    summary: '辨別審核取消、操作員套用與回滾。',
    steps: [
      {
        title: '指定要審查的模組版本',
        body: '在治理區填入已提交的模組 ID 與版本。稽核者核准（reviewer approve）只會建立「等待操作員決定（awaiting_operator）」決策。',
        target: '#governance-module-id',
        expected: '啟用目標會精準指向已提交版本的識別資訊。',
        action: 'prepareGovernance'
      },
      {
        title: '啟動受控審核',
        body: '提案者（proposer）與稽核者（reviewer）是不同角色，review 期間只提供 page_snapshot（頁面快照）與 module_list（模組清單）兩種唯讀工具。',
        target: '#multi-agent-run',
        expected: '訊息區出現提案者與稽核者，決策狀態為等待操作員。',
        action: 'runGovernance'
      },
      {
        title: '取消尚在進行的審核',
        body: '「取消受控審核」只會中止進行中的 Multi-Agent 執行，不等於撤銷已套用的模組，也不是網站登出。',
        target: '#multi-agent-cancel',
        expected: '進行中審核會變成已取消；既有模組對應仍保留。',
        action: 'cancelGovernance'
      },
      {
        title: '重新審核以產生決策',
        body: '示範操作員套用前，先重新執行審核，讓 approve 決策保持等待操作員（awaiting_operator）。',
        target: '#multi-agent-run',
        expected: '「確認並套用決策」變成可用。',
        action: 'runGovernance'
      },
      {
        title: '由操作員確認並套用',
        body: '套用會重驗 evidence hash（證據雜湊）、來源 identity（來源身分）與預期啟用版本；先建立安全檢查點，再以 compare-and-swap 啟用。',
        target: '#governance-apply',
        expected: '決策變成已套用，指定模組版本成為啟用。',
        safety: '一般 runtime 不允許稽核者自行啟用；沙盒 auto-Apply 僅為受限研究模式。',
        action: 'applyGovernance'
      },
      {
        title: '套用後不能用「取消審核」撤銷',
        body: '一旦模組對應變更，取消審核已經來不及補救；必須用模組回滾，或在適用時確認還原檢查點。',
        target: '#module-rollback',
        expected: '回到指定的先前已提交版本；外部副作用不會被反轉。',
        action: 'rollbackModule'
      }
    ]
  },
  {
    id: 'model',
    label: '接入 AI 模型',
    summary: '本機與 OpenAI 雲端模型的安全接入方式。',
    steps: [
      {
        title: '先展開 AI 模型速查',
        body: '正式 Agent 面板內建兩種接入路徑：本機 OpenAI 相容 loopback 與 OpenAI Responses API。教學面板另保留啟動前的環境變數替代方式。',
        target: '#model-connection',
        expected: '你能在正式控制面板看到本機與 OpenAI 兩個接入項目。',
        action: 'openModelSetup'
      },
      {
        title: '本機模型：限制在 loopback',
        body: '直接在面板設定本機端點與模型 ID；端點必須是 127.0.0.1、localhost 或 ::1，且不得包含查詢參數、片段或憑證。',
        target: '#model-local-endpoint',
        expected: '啟動後可選擇本機 OpenAI 相容介接器。',
        safety: '本機介接器不會送授權標頭（authorization header）；不要把含憑證的網址放進 endpoint。'
      },
      {
        title: 'OpenAI：金鑰只保留於本次程式',
        body: '正式程式會把面板輸入的金鑰送到 Main Process，隨即清空輸入框；不寫入檔案、事件、結果或模組原始碼。不要在教學頁輸入真實金鑰。',
        target: '#model-openai-key',
        expected: 'Sol、Terra、Luna 介接器變成可選；UI 只顯示是否已接入，不回傳金鑰。',
        safety: 'Hosted context（外部雲端上下文）是外部資料傳輸；只送出這次任務所需且已授權的內容。',
        action: 'showHostedSetup'
      },
      {
        title: '在 Agent 端選擇模型',
        body: '依品質、成本與延遲選介接器，並明確設定推理深度（reasoning effort）、最大輪次與最大動作。',
        target: '#agent-adapter',
        expected: '可用介接器會被選中，不可用的會保持停用。',
        action: 'simulateHostedAvailable'
      },
      {
        title: '用小任務做連線試跑',
        body: '先要求模型唯讀觀察 example.com 並回報標題；成功後再逐步放大動作範圍。',
        target: '#agent-run',
        expected: 'Agent 回覆、model.turn 事件與介接器身份識別互相吻合。',
        action: 'runModelSmoke'
      }
    ]
  }
]);

globalThis.blankseedTutorialGetScenario = function getScenario(scenarioId) {
  const scenarios = globalThis.blankseedTutorialScenarios;
  return scenarios.find((scenario) => scenario.id === scenarioId) || scenarios[0];
};
