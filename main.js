const resultContainer = document.querySelector('#lotto-results-container');
const generateBtn = document.querySelector('#generate-btn');
const saveCurrentBtn = document.querySelector('#save-current-btn');
const savedList = document.querySelector('#saved-list');
const savedCount = document.querySelector('#saved-count');
const tabGenerateBtn = document.querySelector('#tab-generate-btn');
const tabHistoryBtn = document.querySelector('#tab-history-btn');
const panelGenerate = document.querySelector('#panel-generate');
const panelHistory = document.querySelector('#panel-history');
const myRandomPanel = document.querySelector('#my-random-panel');
const fixedBallBoards = Array.from(document.querySelectorAll('.fixed-ball-board'));
const dreamPanel = document.querySelector('#dream-panel');
const dreamCategory = document.querySelector('#dream-category');
const dreamEmotion = document.querySelector('#dream-emotion');
const dreamNote = document.querySelector('#dream-note');
const dreamInterpretBtn = document.querySelector('#dream-interpret-btn');
const dreamInterpretation = document.querySelector('#dream-interpretation');
const numSetsSelect = document.querySelector('#num-sets');
const strategySelect = document.querySelector('#strategy-select');
const strategyStatus = document.querySelector('#strategy-status');
const themeBtn = document.querySelector('#theme-btn');
const historyContainer = document.querySelector('#history-container');
const siteNavLinks = Array.from(document.querySelectorAll('.site-nav a[href^="#"]'));
const resourceOpenButtons = Array.from(document.querySelectorAll('[data-resource-target]'));
const resourceOverlay = document.querySelector('#resource-overlay');
const resourceOverlayBody = document.querySelector('#resource-overlay-body');
const resourceOverlayTitle = document.querySelector('#resource-overlay-title');
const resourceCloseBtn = document.querySelector('#resource-close-btn');
const resourceTemplates = {
    faq: document.querySelector('#resource-template-faq'),
    policy: document.querySelector('#resource-template-policy'),
    contact: document.querySelector('#resource-template-contact')
};
const currentYearEl = document.querySelector('#current-year');
const html = document.documentElement;

// New elements for My Random Navigation
const prevGameBtn = document.querySelector('#prev-game-btn');
const nextGameBtn = document.querySelector('#next-game-btn');
const currentGameLabel = document.querySelector('#current-game-label');

const LOTTO_NUM_MAX = 45;
const PICK_COUNT = 6;
const SAVE_LIMIT = 5;
const SAVED_STORAGE_KEY = 'lotto_saved_snapshots_v1';
const TRAIN_MIN_ROUNDS = 40;
const TRAIN_WINDOW = 12;
const HISTORY_PAGE_SIZE = 52;
const LOTTO_ALL_HISTORY_URL = 'https://smok95.github.io/lotto/results/all.json';
const HISTORY_CACHE_KEY = 'lotto_history_all_cache_v1';
const HISTORY_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

const LOTTO_BASE_URL = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';
const LOTTO_HISTORY_MIRROR_URL = 'https://gist.githubusercontent.com/anthonyminyungi/a7237c0717400512855c890d5b0e1ba3/raw/lotto-winning-history.json';
const ROUND_1_DATE = new Date('2002-12-07T20:00:00+09:00');
const PRIZE_UNKNOWN_TEXT = '-';

const modelStore = {
    pattern: {
        model: null,
        trainedRounds: 0,
        isTraining: false
    },
    attention: {
        model: null,
        trainedRounds: 0,
        isTraining: false
    }
};

let fullHistory = [];
let trainHistory = [];
let lastGeneratedSets = [];
let lastGeneratedMode = 'random';
let savedSnapshots = [];
let historyVisibleItems = [];
let historyRenderOffset = 0;
let currentMyRandomGameIndex = 0;

const savedTheme = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', savedTheme);
updateThemeButtonText(savedTheme);

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeButtonText(newTheme);
    });
}

if (strategySelect) {
    strategySelect.addEventListener('change', () => {
        toggleMyRandomPanel();
        toggleDreamPanel();
        updateStrategyStatusByMode();
    });
}

if (numSetsSelect) {
    numSetsSelect.addEventListener('change', () => {
        currentMyRandomGameIndex = 0;
        updateMyRandomRowsByGameCount();
    });
}

if (prevGameBtn) {
    prevGameBtn.addEventListener('click', () => {
        if (currentMyRandomGameIndex > 0) {
            currentMyRandomGameIndex -= 1;
            updateMyRandomRowsByGameCount();
        }
    });
}

if (nextGameBtn) {
    nextGameBtn.addEventListener('click', () => {
        const maxGames = parseInt(numSetsSelect.value, 10);
        if (currentMyRandomGameIndex < maxGames - 1) {
            currentMyRandomGameIndex += 1;
            updateMyRandomRowsByGameCount();
        }
    });
}

if (tabGenerateBtn) {
    tabGenerateBtn.addEventListener('click', () => {
        activateMainTab('generate');
    });
}

if (tabHistoryBtn) {
    tabHistoryBtn.addEventListener('click', () => {
        activateMainTab('history');
    });
}

siteNavLinks.forEach((link) => {
    link.addEventListener('click', () => {
        const anchor = link.getAttribute('href') || '';
        if (anchor === '#panel-history') {
            activateMainTab('history');
        } else if (anchor === '#panel-generate') {
            activateMainTab('generate');
        }
    });
});

resourceOpenButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const target = button.getAttribute('data-resource-target') || '';
        openResourceOverlay(target);
    });
});

if (resourceCloseBtn) {
    resourceCloseBtn.addEventListener('click', () => {
        closeResourceOverlay();
    });
}

if (resourceOverlay) {
    resourceOverlay.addEventListener('click', (event) => {
        if (event.target === resourceOverlay) {
            closeResourceOverlay();
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && resourceOverlay && !resourceOverlay.classList.contains('hidden')) {
        closeResourceOverlay();
    }
});

if (saveCurrentBtn) {
    saveCurrentBtn.addEventListener('click', () => {
        saveCurrentGeneratedSets();
    });
}

if (dreamInterpretBtn) {
    dreamInterpretBtn.addEventListener('click', () => {
        renderDreamInterpretation();
    });
}

if (dreamCategory) {
    dreamCategory.addEventListener('change', () => {
        if (strategySelect.value === 'dream') {
            renderDreamInterpretation();
        }
    });
}

if (dreamEmotion) {
    dreamEmotion.addEventListener('change', () => {
        if (strategySelect.value === 'dream') {
            renderDreamInterpretation();
        }
    });
}

if (dreamNote) {
    dreamNote.addEventListener('input', () => {
        if (dreamNote.value.length > 30) {
            dreamNote.value = dreamNote.value.slice(0, 30);
        }
        if (strategySelect.value === 'dream') {
            renderDreamInterpretation();
        }
    });
}

if (historyContainer) {
    historyContainer.addEventListener('scroll', () => {
        if (historyContainer.scrollTop + historyContainer.clientHeight >= historyContainer.scrollHeight - 36) {
            // pagination if needed
        }
    });
}

fixedBallBoards.forEach((board) => {
    board.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.classList.contains('fixed-ball')) {
            return;
        }
        const gameIndex = Number.parseInt(board.dataset.gameIndex || '-1', 10);
        if (!Number.isInteger(gameIndex) || gameIndex < 0) {
            return;
        }

        const selectedCount = board.querySelectorAll('.fixed-ball.is-selected').length;
        if (!target.classList.contains('is-selected') && selectedCount >= PICK_COUNT) {
            setStrategyStatus(`내선택: ${gameIndex + 1}게임은 최대 6개까지만 고정할 수 있습니다.`);
            return;
        }

        target.classList.toggle('is-selected');
    });
});

if (savedList) {
    savedList.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const loadId = target.getAttribute('data-load-id');
        if (loadId) {
            loadSavedSnapshot(loadId);
            return;
        }

        const deleteId = target.getAttribute('data-delete-id');
        if (deleteId) {
            removeSavedSnapshot(deleteId);
        }
    });
}

if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
        const numSets = parseInt(numSetsSelect.value, 10);
        const mode = strategySelect.value;

        if (mode === 'ai_pattern') {
            await ensurePatternModelReady();
        }

        if (mode === 'ai_attention') {
            await ensureAttentionModelReady();
        }

        if (mode === 'dream') {
            const validation = validateDreamInput();
            if (!validation.ok) {
                setStrategyStatus(validation.message);
                return;
            }
        }

        // Always play animation for all modes
        await playAiThinkingAnimation(1200);

        const sets = [];
        for (let i = 0; i < numSets; i += 1) {
            if (mode === 'ai_pattern') {
                sets.push(generatePatternAiSet());
            } else if (mode === 'ai_attention') {
                sets.push(generateAttentionAiSet());
            } else if (mode === 'dream') {
                sets.push(generateDreamSet(i));
            } else if (mode === 'my_random') {
                const fixedNumbers = getFixedNumbersForGame(i);
                sets.push(generateWithFixedNumbers(fixedNumbers));
            } else {
                sets.push(generateSingleSet());
            }
        }

        renderGeneratedSets(sets);
        lastGeneratedSets = cloneSets(sets);
        lastGeneratedMode = mode;
    });
}

function updateThemeButtonText(theme) {
    if (themeBtn) themeBtn.textContent = theme === 'light' ? 'Dark' : 'Light';
}

function setStrategyStatus(message) {
    if (strategyStatus) strategyStatus.textContent = message;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playAiThinkingAnimation(durationMs = 1000) {
    if (!resultContainer) return;
    resultContainer.classList.add('is-thinking');
    resultContainer.innerHTML = `
        <div class="ai-thinking-board" aria-label="AI 분석 중">
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
        </div>
        <p style="text-align: center; font-size: 0.9rem; color: var(--accent); font-weight: 700; animation: pulse 1s infinite;">행운의 번호를 분석하고 있습니다...</p>
    `;
    await delay(durationMs);
    resultContainer.classList.remove('is-thinking');
}

function activateMainTab(tab) {
    const isGenerate = tab === 'generate';
    if (panelGenerate) panelGenerate.classList.toggle('hidden', !isGenerate);
    if (panelHistory) panelHistory.classList.toggle('hidden', isGenerate);
    if (tabGenerateBtn) tabGenerateBtn.classList.toggle('active', isGenerate);
    if (tabHistoryBtn) tabHistoryBtn.classList.toggle('active', !isGenerate);
}

function getOverlayTitle(resourceTarget) {
    if (resourceTarget === 'faq') return '자주 묻는 질문';
    if (resourceTarget === 'policy') return '운영 정책';
    if (resourceTarget === 'contact') return '운영자 정보 및 문의';
    return '';
}

function syncOverlayUpdatedDate() {
    if (!resourceOverlayBody) return;
    const now = new Date().toISOString().slice(0, 10);
    const dateNodes = resourceOverlayBody.querySelectorAll('.resource-last-updated');
    dateNodes.forEach((node) => {
        if (node instanceof HTMLTimeElement) {
            node.dateTime = now;
            node.textContent = now;
        }
    });
}

function openResourceOverlay(resourceTarget) {
    if (!resourceOverlay || !resourceOverlayBody || !resourceOverlayTitle) return;
    const template = resourceTemplates[resourceTarget];
    if (!(template instanceof HTMLTemplateElement)) return;

    resourceOverlayTitle.textContent = getOverlayTitle(resourceTarget);
    resourceOverlayBody.innerHTML = '';
    resourceOverlayBody.appendChild(template.content.cloneNode(true));
    syncOverlayUpdatedDate();
    resourceOverlay.classList.remove('hidden');
}

function closeResourceOverlay() {
    if (resourceOverlay) resourceOverlay.classList.add('hidden');
}

function toggleMyRandomPanel() {
    if (!myRandomPanel) return;
    if (strategySelect.value === 'my_random') {
        myRandomPanel.classList.remove('hidden');
        currentMyRandomGameIndex = 0;
        updateMyRandomRowsByGameCount();
    } else {
        myRandomPanel.classList.add('hidden');
    }
}

function updateMyRandomRowsByGameCount() {
    if (!myRandomPanel) return;
    const totalGames = parseInt(numSetsSelect.value, 10);
    const rows = myRandomPanel.querySelectorAll('.my-random-row');
    
    rows.forEach((row, index) => {
        row.classList.toggle('hidden', index !== currentMyRandomGameIndex);
    });

    if (currentGameLabel) currentGameLabel.textContent = `G${currentMyRandomGameIndex + 1} 설정 중 (총 ${totalGames}게임)`;
    if (prevGameBtn) prevGameBtn.disabled = currentMyRandomGameIndex === 0;
    if (nextGameBtn) nextGameBtn.disabled = currentMyRandomGameIndex >= totalGames - 1;
}

function toggleDreamPanel() {
    if (!dreamPanel) return;
    if (strategySelect.value === 'dream') {
        dreamPanel.classList.remove('hidden');
        renderDreamInterpretation();
    } else {
        dreamPanel.classList.add('hidden');
    }
}

function getBallColorClass(number) {
    if (number <= 10) return 'ball-yellow';
    if (number <= 20) return 'ball-blue';
    if (number <= 30) return 'ball-red';
    if (number <= 40) return 'ball-gray';
    return 'ball-green';
}

function buildFixedBallBoards() {
    fixedBallBoards.forEach((board) => {
        board.innerHTML = '';
        for (let n = 1; n <= LOTTO_NUM_MAX; n += 1) {
            const ball = document.createElement('button');
            ball.type = 'button';
            ball.classList.add('fixed-ball');
            ball.classList.add(getBallColorClass(n));
            ball.dataset.number = String(n);
            ball.textContent = String(n);
            board.appendChild(ball);
        }
    });
}

function getFixedNumbersForGame(gameIndex) {
    const board = fixedBallBoards[gameIndex];
    if (!board) return [];
    return Array.from(board.querySelectorAll('.fixed-ball.is-selected'))
        .map((el) => Number.parseInt(el.dataset.number || '', 10))
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
}

function generateWithFixedNumbers(fixedNumbers) {
    const numbers = new Set(fixedNumbers);
    while (numbers.size < PICK_COUNT) {
        numbers.add(Math.floor(Math.random() * LOTTO_NUM_MAX) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

function cloneSets(sets) { return sets.map((set) => [...set]); }

function getModeLabel(mode) {
    const labels = { my_random: '내선택+랜덤', ai_pattern: '패턴 AI', ai_attention: '어텐션 AI', dream: '꿈해몽 추천' };
    return labels[mode] || '완전 랜덤';
}

function validateDreamInput() {
    const note = dreamNote ? dreamNote.value.trim() : '';
    if (note.length > 30) return { ok: false, message: '기타 설명은 30자 이내로 입력해 주세요.' };
    return { ok: true };
}

function hashTextToSeed(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0);
}

function createSeededRandom(seed) {
    let s = seed || 1;
    return () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

function buildDreamWeightMap(category, emotion, note) {
    const weights = Array(LOTTO_NUM_MAX).fill(1);
    const categoryBoosts = { animal: [1, 3, 7, 12, 23, 27, 31, 39, 41, 44], falling: [4, 8, 11, 15, 19, 24, 32, 36, 40, 45], water: [2, 6, 9, 13, 16, 20, 25, 30, 34, 42], body: [5, 10, 14, 18, 21, 26, 28, 33, 37, 43], fire: [7, 9, 17, 22, 27, 29, 35, 38, 41, 45], money: [3, 8, 11, 14, 19, 24, 28, 32, 40, 44], family: [1, 6, 12, 15, 20, 23, 29, 31, 36, 42], baby: [2, 5, 10, 13, 18, 22, 26, 30, 34, 39], other: [4, 9, 16, 21, 25, 28, 33, 37, 41, 43] };
    const emotionBoosts = { positive: [7, 12, 21, 27, 34, 41], neutral: [5, 14, 22, 30, 38, 44], negative: [3, 11, 19, 26, 35, 42] };
    const keywordBoosts = [ { key: '돼지', nums: [3, 8, 24, 32, 44] }, { key: '뱀', nums: [7, 12, 29, 34, 41] }, { key: '물', nums: [2, 9, 16, 25, 42] }, { key: '불', nums: [1, 17, 27, 35, 45] }, { key: '돈', nums: [8, 14, 24, 28, 40] }, { key: '아기', nums: [5, 10, 13, 30, 39] }, { key: '이빨', nums: [4, 11, 21, 33, 43] }, { key: '죽', nums: [6, 15, 20, 31, 36] } ];
    (categoryBoosts[category] || categoryBoosts.other).forEach((num) => { weights[num - 1] += 2.8; });
    (emotionBoosts[emotion] || []).forEach((num) => { weights[num - 1] += 1.8; });
    keywordBoosts.forEach((item) => { if (note.includes(item.key)) { item.nums.forEach((num) => { weights[num - 1] += 2.2; }); } });
    return weights;
}

function pickNumbersByWeights(weights, seed, offset = 0) {
    const rnd = createSeededRandom(seed + offset * 7919);
    const selected = [];
    const blocked = new Set();
    while (selected.length < PICK_COUNT) {
        const available = weights.map((w, idx) => (blocked.has(idx + 1) ? 0 : w));
        const total = available.reduce((acc, cur) => acc + cur, 0);
        if (total <= 0) break;
        let t = rnd() * total;
        for (let i = 0; i < available.length; i += 1) {
            t -= available[i];
            if (t <= 0) { blocked.add(i + 1); selected.push(i + 1); break; }
        }
    }
    return selected.sort((a, b) => a - b);
}

function generateDreamSet(setIndex) {
    const category = dreamCategory.value; const emotion = dreamEmotion.value; const note = dreamNote ? dreamNote.value.trim() : '';
    const weights = buildDreamWeightMap(category, emotion, note);
    const seed = hashTextToSeed(`${category}|${emotion}|${note}|${new Date().toISOString().slice(0, 10)}`);
    return pickNumbersByWeights(weights, seed, setIndex);
}

function interpretDream(category, emotion, note) {
    const categoryText = { animal: '동물 관련 기회 신호.', falling: '압박감이나 통제 이슈.', water: '감정 흐름과 상태 변화.', body: '건강/관계 민감도.', fire: '강한 에너지와 변화.', money: '성취 욕구와 보상.', family: '정서적 정리와 관계.', baby: '새 시작과 성장.', other: '최근의 복합 감정.' };
    return `${categoryText[category] || categoryText.other} 가이드에 따라 분석되었습니다.`;
}

function renderDreamInterpretation() {
    if (!dreamInterpretation) return;
    const category = dreamCategory.value; const emotion = dreamEmotion.value; const note = dreamNote ? dreamNote.value.trim() : '';
    dreamInterpretation.textContent = interpretDream(category, emotion, note);
}

function normalizeSavedSnapshots(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && typeof item.id === 'string').slice(0, SAVE_LIMIT);
}

function readSavedSnapshots() {
    try { const raw = localStorage.getItem(SAVED_STORAGE_KEY); return raw ? normalizeSavedSnapshots(JSON.parse(raw)) : []; } catch { return []; }
}

function writeSavedSnapshots() { localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedSnapshots)); }

function renderSavedList() {
    if (savedCount) savedCount.textContent = `${savedSnapshots.length} / ${SAVE_LIMIT}`;
    if (!savedList) return;
    if (!savedSnapshots.length) { savedList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--ink-2); opacity: 0.5;">기록 없음</p>'; return; }
    savedList.innerHTML = savedSnapshots.map(item => `<div class="saved-item"><span>${getModeLabel(item.mode)}</span><button data-delete-id="${item.id}">X</button></div>`).join('');
}

window.addPost = function() {
    const nickname = document.getElementById('board-nickname').value.trim();
    const title = document.getElementById('board-title').value.trim();
    const content = document.getElementById('board-content').value.trim();
    if (!nickname || !title || !content) { alert('내용을 입력해 주세요.'); return; }
    const posts = JSON.parse(localStorage.getItem('lotto_posts') || '[]');
    posts.unshift({ id: Date.now(), nickname, title, content, date: new Date().toISOString().split('T')[0] });
    localStorage.setItem('lotto_posts', JSON.stringify(posts));
    document.getElementById('board-nickname').value = ''; document.getElementById('board-title').value = ''; document.getElementById('board-content').value = '';
    renderPosts();
};

window.renderPosts = function() {
    const container = document.getElementById('posts-container'); if (!container) return;
    const posts = JSON.parse(localStorage.getItem('lotto_posts') || '[]');
    container.innerHTML = posts.map(p => `<div class="post-card"><div>${p.nickname} | ${p.date}</div><h4>${p.title}</h4><p>${p.content}</p></div>`).join('');
};

function saveCurrentGeneratedSets() {
    if (!lastGeneratedSets.length || savedSnapshots.length >= SAVE_LIMIT) return;
    savedSnapshots.unshift({ id: String(Date.now()), mode: lastGeneratedMode, sets: cloneSets(lastGeneratedSets), savedAt: new Date().toISOString() });
    writeSavedSnapshots(); renderSavedList();
}

function removeSavedSnapshot(id) {
    savedSnapshots = savedSnapshots.filter(s => s.id !== id); writeSavedSnapshots(); renderSavedList();
}

function updateStrategyStatusByMode() {
    const mode = strategySelect.value;
    const msgs = { random: '무작위 추출 모드입니다.', my_random: '사용자 지정 모드입니다.', ai_pattern: '패턴 분석 모드입니다.', ai_attention: '시계열 분석 모드입니다.', dream: '꿈 상징 분석 모드입니다.' };
    setStrategyStatus(msgs[mode]);
}

function generateSingleSet() {
    const nums = new Set(); while (nums.size < PICK_COUNT) nums.add(Math.floor(Math.random() * LOTTO_NUM_MAX) + 1);
    return Array.from(nums).sort((a, b) => a - b);
}

function renderGeneratedSets(sets) {
    if (!resultContainer) return;
    resultContainer.innerHTML = sets.map(s => `<div class="lotto-row">${s.map(n => `<div class="lotto-number ${getBallColorClass(n)}">${n}</div>`).join('')}</div>`).join('');
}

async function ensurePatternModelReady() { await delay(300); }
async function ensureAttentionModelReady() { await delay(300); }
function generatePatternAiSet() { return generateSingleSet(); }
function generateAttentionAiSet() { return generateSingleSet(); }

async function fetchJsonWithTimeout(url, timeout = 10000) {
    const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal }); clearTimeout(id);
    return response.json();
}

function normalizeRemoteAllHistory(payload) {
    return Array.isArray(payload) ? payload.map(row => ({ round: row.draw_no, date: row.date, numbers: row.numbers, prize1: row.divisions?.[1]?.prize })) : [];
}

function createHistoryItem(res) {
    const item = document.createElement('div'); item.classList.add('history-item');
    item.innerHTML = `<div>${res.round}회 (${res.date}) 1등: ${res.prize1 ? res.prize1.toLocaleString() : '-'}원</div><div class="history-nums">${res.numbers.map(n => `<div class="mini-ball ${getBallColorClass(n)}">${n}</div>`).join('')}</div>`;
    return item;
}

async function fetchLottoHistory() {
    try {
        const remoteAll = await fetchJsonWithTimeout(LOTTO_ALL_HISTORY_URL);
        const allHistory = normalizeRemoteAllHistory(remoteAll);
        if (historyContainer) {
            historyContainer.innerHTML = '';
            allHistory.slice(0, 50).forEach(res => historyContainer.appendChild(createHistoryItem(res)));
        }
    } catch (e) { if (historyContainer) historyContainer.innerHTML = '<p>기록 로드 실패</p>'; }
}

// Random Informational Cards Logic
const ALL_REPORTS = [
    { title: "로또 당첨자 통계 분석", desc: "공개된 데이터를 기반으로 본 당첨자들의 구매 습관 및 인구 통계학적 특징.", link: "blog-stats.html", tag: "통계 데이터" },
    { title: "추첨 시스템의 공정성", desc: "매주 진행되는 공식 추첨 장비와 보안 프로세스가 어떻게 운영되는지 안내합니다.", link: "blog-process.html", tag: "시스템 보안" },
    { title: "해외 복권 제도 비교", desc: "미국의 파워볼, 유럽의 유로밀리언즈 등 세계 각국의 복권 특징 비교 리포트.", link: "blog-global.html", tag: "해외 사례" },
    { title: "로또 이용의 심리 분석", desc: "사람들이 복권을 구매하는 이유와 '희망의 경제학'에 대한 심층 분석.", link: "blog-psychology.html", tag: "심리 분석" },
    { title: "국내 복권 주요 기록들", desc: "역대 최고 당첨금 기록부터 이색적인 회차 정보까지, 한국 로또의 여정.", link: "blog-records.html", tag: "역사적 기록" },
    { title: "복권 제도의 기원", desc: "고대 로마부터 중세 유럽, 그리고 대한민국까지 복권 제도의 변천사.", link: "blog-history.html", tag: "제도 변천" },
    { title: "복권에 관한 팩트 체크", desc: "독립 시행의 원리를 바탕으로 시중에 퍼진 잘못된 정보들을 바로잡습니다.", link: "blog-myths.html", tag: "팩트 체크" }
];

function renderRandomInfoCards() {
    const card1 = document.getElementById('random-card-1');
    const card2 = document.getElementById('random-card-2');
    if (!card1 || !card2) return;

    const shuffled = [...ALL_REPORTS].sort(() => 0.5 - Math.random());
    const picked = shuffled.slice(0, 2);

    [card1, card2].forEach((el, i) => {
        const item = picked[i];
        el.innerHTML = `
            <article class="quick-link-card">
                <span style="font-size: 0.8rem; color: var(--accent-2); font-weight: 800;">${item.tag}</span>
                <h3>${item.title}</h3>
                <p>${item.desc}</p>
                <a class="secondary-btn" href="${item.link}" style="text-decoration: none; text-align: center;">리포트 읽기</a>
            </article>
        `;
    });
}

// Start Up
activateMainTab('generate');
buildFixedBallBoards();
toggleMyRandomPanel();
toggleDreamPanel();
updateStrategyStatusByMode();
savedSnapshots = readSavedSnapshots();
renderSavedList();
renderRandomInfoCards();
void fetchLottoHistory();

const now = new Date();
if (currentYearEl) currentYearEl.textContent = String(now.getFullYear());

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('posts-container')) renderPosts();
});
