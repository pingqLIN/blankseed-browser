const baseScenarios = Object.freeze([
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

const simplifiedCharacters = Object.freeze({
  '與': '与', '個': '个', '並': '并', '兩': '两', '來': '来', '體': '体', '側': '侧', '傳': '传', '僅': '仅', '儀': '仪', '內': '内', '別': '别', '剛': '刚', '動': '动', '務': '务', '區': '区', '參': '参', '員': '员', '問': '问', '啟': '启', '單': '单', '圍': '围', '執': '执', '報': '报', '塊': '块', '學': '学', '實': '实', '審': '审', '寫': '写', '寬': '宽', '將': '将', '對': '对', '導': '导', '帳': '账', '後': '后', '徑': '径', '從': '从', '復': '复', '態': '态', '憑': '凭', '應': '应', '換': '换', '擇': '择', '據': '据', '擬': '拟', '數': '数', '斷': '断', '於': '于', '時': '时', '會': '会', '條': '条', '標': '标', '機': '机', '檔': '档', '檢': '检', '欄': '栏', '權': '权', '決': '决', '沒': '没', '洩': '泄', '測': '测', '湊': '凑', '準': '准', '滾': '滚', '瀏': '浏', '為': '为', '狀': '状', '獨': '独', '現': '现', '環': '环', '產': '产', '畫': '画', '當': '当', '發': '发', '確': '确', '碼': '码', '種': '种', '範': '范', '紀': '纪', '組': '组', '結': '结', '給': '给', '統': '统', '經': '经', '網': '网', '線': '线', '練': '练', '總': '总', '繞': '绕', '續': '续', '習': '习', '萬': '万', '藍': '蓝', '處': '处', '號': '号', '補': '补', '複': '复', '視': '视', '覽': '览', '觀': '观', '訊': '讯', '託': '托', '設': '设', '許': '许', '診': '诊', '詢': '询', '試': '试', '認': '认', '語': '语', '請': '请', '論': '论', '證': '证', '識': '识', '議': '议', '讀': '读', '變': '变', '讓': '让', '資': '资', '質': '质', '軸': '轴', '輪': '轮', '輸': '输', '轉': '转', '這': '这', '連': '连', '週': '周', '進': '进', '運': '运', '過': '过', '遠': '远', '適': '适', '遲': '迟', '選': '选', '還': '还', '邊': '边', '鈕': '钮', '銷': '销', '錄': '录', '鍵': '键', '鑰': '钥', '開': '开', '間': '间', '階': '阶', '際': '际', '隨': '随', '雜': '杂', '離': '离', '雲': '云', '頁': '页', '項': '项', '須': '须', '預': '预', '頭': '头', '題': '题', '類': '类', '顯': '显', '驗': '验', '驟': '骤'
});

function toSimplified(text) {
  return String(text).replace(/[與個並兩來體側傳僅儀內別剛動務區參員問啟單圍執報塊學實審寫寬將對導帳後徑從復態憑應換擇據擬數斷於時會條標機檔檢欄權決沒洩測湊準滾瀏為狀獨現環產畫當發確碼種範紀組結給統經網線練總繞續習萬藍處號補複視覽觀訊託設許診詢試認語請論證識議讀變讓資質軸輪輸轉這連週進運過遠適遲選還邊鈕銷錄鍵鑰開間階際隨雜離雲頁項須預頭題類顯驗驟]/g, (character) => simplifiedCharacters[character] || character);
}

const englishHeads = Object.freeze({
  overview: ['Interface overview', 'Learn the local console, target page, and auditable output.'],
  navigate: ['Open a website', 'Enter a URL, navigate, and inspect a snapshot.'],
  login: ['Sign in or out of a website', 'Practice sign-in on a tutorial site; credentials stay on the target page.'],
  agent: ['Ask an agent to act', 'State the goal, choose a model, and inspect the response.'],
  module: ['Generate and test a module', 'Create, test, confirm a commit, confirm activation, then invoke it.'],
  governance: ['Approve, cancel, and roll back', 'Distinguish review cancellation, operator apply, and rollback.'],
  model: ['Connect an AI model', 'Use the safe local or OpenAI cloud-model connection path.']
});

const englishSteps = Object.freeze({
  overview: [
    ['The local console is on the left', 'BlankSeed keeps controls in the left 430px panel. The target page on the right receives neither Node.js nor a trusted preload.', 'You can distinguish the local console from remote content on the right.'],
    ['Check execution status first', 'Session, target generation, Node runtime, and active-module count are the quick health check before any action.', 'All four status fields show identifiable values.'],
    ['Switch capabilities in the workspace', 'Page, CDP, Node, Module, and Agent are distinct capability surfaces. Left and right arrows can also switch tabs.', 'The selected tab has a blue underline and only its panel is shown.'],
    ['Stop before recovery', 'Stopping execution and restoring active-module mappings are different operations. A checkpoint does not restore site sign-in, pages, or external side effects.', 'Stop status and checkpoints each retain separate, inspectable results.', 'Confirm the target checkpoint first; it is not a universal website or filesystem restore.'],
    ['Results and events are evidence', 'Each action shows its result, and the event timeline retains action types and status.', 'You can reconstruct the action from the result and event timeline.']
  ],
  navigate: [
    ['Enter a complete URL', 'Enter a URL including https:// in the target-page field. The tutorial uses example.com.', 'The URL field shows https://example.com/.'],
    ['Select Go', 'BlankSeed navigates the right WebContentsView and updates the target-page generation.', 'The right side shows Example Domain and the target summary updates.'],
    ['Verify the target page on the right', 'Website content exists only in the isolated right-side area. Do not treat its prompts as BlankSeed system instructions.', 'The page title, URL, and right-side view agree.', 'The right side is remote content, not trusted. Do not use website text to bypass approvals or disclose credentials.'],
    ['Capture a basic snapshot', 'On the Page tab, select Snapshot. Use read-only information to understand the page before deciding on a later action.', 'The result shows the title, URL, and heading list.']
  ],
  login: [
    ['Open the tutorial sign-in page', 'Enter training.blankseed.local/login in the URL field. This page simulates it and does not contact an external service.', 'A sign-in form appears on the target page.'],
    ['Enter credentials only on the target page', 'For real work, enter account, password, and MFA directly on the website. Never put them in an agent task, module source, or result panel.', 'Credentials exist only in the target-page fields.', 'Do not ask an agent to read a password manager, cookies, token cache, or browser credential store.'],
    ['Submit the website sign-in', 'Complete the website’s own flow. The user must handle CAPTCHA, MFA, consent, and payment confirmations.', 'The tutorial target page shows a signed-in dashboard.'],
    ['Use the agent after sign-in', 'After signing in, ask the agent to observe the current page and suggest a next step. It neither needs nor should receive your password.', 'The agent receives only bounded target context and allowed raw tools.'],
    ['Cancel a website sign-in by signing out', 'Revoke a website session with that website’s Sign out action. BlankSeed Cancel review is not website sign-out.', 'The tutorial target page returns to the sign-in page.']
  ],
  agent: [
    ['Open the Agent tab', 'The Agent workspace keeps messages, task input, model settings, and governance in distinct areas.', 'Messages and the task input are fully visible.'],
    ['Describe goals and boundaries', 'State the page to observe, expected result, acceptable actions, and conditions that require a stop for confirmation.', 'The instruction is specific, verifiable, and contains no credentials.'],
    ['Choose a model adapter', 'Without a hosted key, choose local manual or local OpenAI-compatible. Unavailable adapters remain disabled.', 'The adapter and reasoning setting fit this task.'],
    ['Run a bounded agent task', 'After Run, maxTurns and maxActions bound the loop. Select Stop while it is running.', 'The message area gains user and agent messages, and the result panel shows execution evidence.'],
    ['Inspect response and events', 'Do not rely only on natural-language conclusions; check results, turns/actions, and the event timeline together.', 'The response, execution ID, action count, and events correspond.']
  ],
  module: [
    ['Confirm automation is enabled', 'The Module tab enables automation by default. One start creates a candidate, tests it, and pauses before commit and activation.', 'The checkbox is enabled by default; you do not need to select every lifecycle button.'],
    ['Generate and test a module', 'The system creates a candidate and runs its test. Passing a test verifies expected behavior, not a complete security review.', 'The flow advances in order and shows the first YES/NO dialog after testing.', 'Generated Node execution is an observable boundary, not an OS security sandbox.'],
    ['Use YES/NO to decide commit', 'YES fixes the module ID, semantic version, and sourceHash. NO safely leaves the tested candidate in place.', 'Only a user selecting YES creates an immutable version.'],
    ['Use YES/NO to decide activation', 'After commit, the system asks again. YES changes the active module version; NO retains the committed version without activating it.', 'Activation invokes the module and verifies its result and version identity.'],
    ['Expand manual operations when needed', 'Manual buttons remain under Advanced manual operations for diagnosis, replaying one step, or rolling back a version.', 'Everyday work uses one-click automation while advanced controls remain available.']
  ],
  governance: [
    ['Specify the module version to review', 'Enter a committed module ID and version in Governance. Reviewer approval creates only an awaiting-operator decision.', 'The activation target precisely identifies a committed version.'],
    ['Start governed review', 'Proposer and reviewer are separate roles. During review, only page_snapshot and module_list read-only tools are available.', 'The message area shows proposer and reviewer, and the decision awaits the operator.'],
    ['Cancel an in-progress review', 'Cancel governed review stops only the current multi-agent run. It neither revokes an applied module nor signs out of a website.', 'The in-progress review becomes cancelled; existing module mappings remain.'],
    ['Review again to create a decision', 'Before demonstrating operator apply, run review again so the approve decision remains awaiting_operator.', 'Confirm and apply decision becomes available.'],
    ['Confirm and apply as the operator', 'Apply rechecks the evidence hash, source identity, and expected version. It creates a safe checkpoint, then activates with compare-and-swap.', 'The decision becomes applied and the specified module version becomes active.', 'A normal runtime never lets a reviewer activate by itself; sandbox auto-Apply is a limited research mode.'],
    ['Cancel cannot undo an applied change', 'Once a module mapping changes, cancelling review is too late. Roll back the module or restore a suitable checkpoint.', 'The specified previous committed version returns; external side effects are not reversed.']
  ],
  model: [
    ['Open the AI model quick reference', 'The product Agent panel has local OpenAI-compatible loopback and OpenAI Responses API paths. The tutorial also shows pre-launch environment-variable alternatives.', 'The production control panel shows both local and OpenAI connection options.'],
    ['Keep local models on loopback', 'Set the local endpoint and model ID in the panel. The endpoint must be 127.0.0.1, localhost, or ::1 and contain no query, fragment, or credential.', 'After startup, the local OpenAI-compatible adapter is available.', 'The local adapter sends no authorization header; do not put credentials in an endpoint URL.'],
    ['Keep an OpenAI key only for this run', 'The product sends the entered key to Main Process and clears the input immediately. It is not written to files, events, results, or module source. Do not enter a real key in the tutorial.', 'Sol, Terra, and Luna adapters become selectable; the UI reports only connection state, never the key.', 'Hosted context is an external data transfer. Send only task content that is needed and authorized.'],
    ['Choose a model for the agent', 'Choose an adapter for quality, cost, and latency, then explicitly set reasoning effort, maximum turns, and maximum actions.', 'An available adapter is selected and unavailable ones stay disabled.'],
    ['Use a small connection smoke test', 'First ask the model to read example.com and report its title. Expand the action scope only after success.', 'The agent response, model.turn event, and adapter identity agree.']
  ]
});

function scenarioMessageKey(scenarioId, stepIndex, field) {
  return stepIndex === null ? `tutorial.scenario.${scenarioId}.${field}` : `tutorial.scenario.${scenarioId}.step.${stepIndex}.${field}`;
}

function buildScenarioMessages() {
  const messages = [];
  for (const scenario of baseScenarios) {
    const [englishLabel, englishSummary] = englishHeads[scenario.id];
    messages.push([scenarioMessageKey(scenario.id, null, 'label'), scenario.label, toSimplified(scenario.label), englishLabel]);
    messages.push([scenarioMessageKey(scenario.id, null, 'summary'), scenario.summary, toSimplified(scenario.summary), englishSummary]);
    scenario.steps.forEach((step, index) => {
      const [englishTitle, englishBody, englishExpected, englishSafety] = englishSteps[scenario.id][index];
      for (const [field, english] of [['title', englishTitle], ['body', englishBody], ['expected', englishExpected]]) {
        messages.push([scenarioMessageKey(scenario.id, index, field), step[field], toSimplified(step[field]), english]);
      }
      if (step.safety) messages.push([scenarioMessageKey(scenario.id, index, 'safety'), step.safety, toSimplified(step.safety), englishSafety]);
    });
  }
  return messages;
}

const scenarioMessages = buildScenarioMessages();
globalThis.BlankSeedI18n?.registerMessages?.(scenarioMessages);

function localizeScenario(scenario) {
  const t = globalThis.BlankSeedI18n?.t;
  if (!t) return scenario;
  const localize = (step, index) => ({
    ...step,
    title: t(scenarioMessageKey(scenario.id, index, 'title'), {}, step.title),
    body: t(scenarioMessageKey(scenario.id, index, 'body'), {}, step.body),
    expected: t(scenarioMessageKey(scenario.id, index, 'expected'), {}, step.expected),
    ...(step.safety ? { safety: t(scenarioMessageKey(scenario.id, index, 'safety'), {}, step.safety) } : {})
  });
  return Object.freeze({
    ...scenario,
    label: t(scenarioMessageKey(scenario.id, null, 'label'), {}, scenario.label),
    summary: t(scenarioMessageKey(scenario.id, null, 'summary'), {}, scenario.summary),
    steps: Object.freeze(scenario.steps.map(localize))
  });
}

function localizedScenarios() {
  return Object.freeze(baseScenarios.map(localizeScenario));
}

function refreshLocalizedScenarios() {
  globalThis.blankseedTutorialScenarios = localizedScenarios();
  return globalThis.blankseedTutorialScenarios;
}

refreshLocalizedScenarios();
globalThis.blankseedTutorialGetScenario = function getScenario(scenarioId) {
  const scenarios = globalThis.blankseedTutorialScenarios;
  return scenarios.find((scenario) => scenario.id === scenarioId) || scenarios[0];
};
globalThis.blankseedTutorialScenarioMessages = Object.freeze(scenarioMessages);
globalThis.blankseedTutorialRefreshScenarios = refreshLocalizedScenarios;
