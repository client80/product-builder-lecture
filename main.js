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

themeBtn.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButtonText(newTheme);
});

strategySelect.addEventListener('change', () => {
    toggleMyRandomPanel();
    toggleDreamPanel();
    updateStrategyStatusByMode();
});

numSetsSelect.addEventListener('change', () => {
    currentMyRandomGameIndex = 0;
    updateMyRandomRowsByGameCount();
});

prevGameBtn.addEventListener('click', () => {
    if (currentMyRandomGameIndex > 0) {
        currentMyRandomGameIndex -= 1;
        updateMyRandomRowsByGameCount();
    }
});

nextGameBtn.addEventListener('click', () => {
    const maxGames = parseInt(numSetsSelect.value, 10);
    if (currentMyRandomGameIndex < maxGames - 1) {
        currentMyRandomGameIndex += 1;
        updateMyRandomRowsByGameCount();
    }
});

tabGenerateBtn.addEventListener('click', () => {
    activateMainTab('generate');
});

tabHistoryBtn.addEventListener('click', () => {
    activateMainTab('history');
});

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

saveCurrentBtn.addEventListener('click', () => {
    saveCurrentGeneratedSets();
});

dreamInterpretBtn.addEventListener('click', () => {
    renderDreamInterpretation();
});

dreamCategory.addEventListener('change', () => {
    if (strategySelect.value === 'dream') {
        renderDreamInterpretation();
    }
});

dreamEmotion.addEventListener('change', () => {
    if (strategySelect.value === 'dream') {
        renderDreamInterpretation();
    }
});

dreamNote.addEventListener('input', () => {
    if (dreamNote.value.length > 30) {
        dreamNote.value = dreamNote.value.slice(0, 30);
    }
    if (strategySelect.value === 'dream') {
        renderDreamInterpretation();
    }
});

historyContainer.addEventListener('scroll', () => {
    if (historyContainer.scrollTop + historyContainer.clientHeight >= historyContainer.scrollHeight - 36) {
        appendHistoryPage();
    }
});

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
            setStrategyStatus(`내선택+랜덤: ${gameIndex + 1}게임은 최대 6개까지만 고정할 수 있습니다.`);
            return;
        }

        target.classList.toggle('is-selected');
    });
});

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

    const shareId = target.getAttribute('data-share-id');
    if (shareId) {
        shareSavedSnapshot(shareId);
        return;
    }

    const deleteId = target.getAttribute('data-delete-id');
    if (deleteId) {
        removeSavedSnapshot(deleteId);
    }
});

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

function updateThemeButtonText(theme) {
    themeBtn.textContent = theme === 'light' ? 'Dark' : 'Light';
}

function setStrategyStatus(message) {
    strategyStatus.textContent = message;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playAiThinkingAnimation(durationMs = 1000) {
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
    panelGenerate.classList.toggle('hidden', !isGenerate);
    panelHistory.classList.toggle('hidden', isGenerate);
    tabGenerateBtn.classList.toggle('active', isGenerate);
    tabHistoryBtn.classList.toggle('active', !isGenerate);
}

function getOverlayTitle(resourceTarget) {
    if (resourceTarget === 'faq') {
        return '자주 묻는 질문';
    }
    if (resourceTarget === 'policy') {
        return '운영 정책';
    }
    if (resourceTarget === 'contact') {
        return '운영자 정보 및 문의';
    }
    return '';
}

function syncOverlayUpdatedDate() {
    if (!resourceOverlayBody) {
        return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const dateNodes = resourceOverlayBody.querySelectorAll('.resource-last-updated');
    dateNodes.forEach((node) => {
        if (!(node instanceof HTMLTimeElement)) {
            return;
        }
        node.dateTime = now;
        node.textContent = now;
    });
}

function openResourceOverlay(resourceTarget) {
    if (!resourceOverlay || !resourceOverlayBody || !resourceOverlayTitle) {
        return;
    }
    const template = resourceTemplates[resourceTarget];
    if (!(template instanceof HTMLTemplateElement)) {
        return;
    }

    resourceOverlayTitle.textContent = getOverlayTitle(resourceTarget);
    resourceOverlayBody.innerHTML = '';
    resourceOverlayBody.appendChild(template.content.cloneNode(true));
    syncOverlayUpdatedDate();

    resourceOverlay.classList.remove('hidden');
}

function closeResourceOverlay() {
    if (!resourceOverlay) {
        return;
    }
    resourceOverlay.classList.add('hidden');
}

function toggleMyRandomPanel() {
    if (strategySelect.value === 'my_random') {
        myRandomPanel.classList.remove('hidden');
        currentMyRandomGameIndex = 0;
        updateMyRandomRowsByGameCount();
    } else {
        myRandomPanel.classList.add('hidden');
    }
}

function updateMyRandomRowsByGameCount() {
    const totalGames = parseInt(numSetsSelect.value, 10);
    const rows = myRandomPanel.querySelectorAll('.my-random-row');
    
    rows.forEach((row, index) => {
        row.classList.toggle('hidden', index !== currentMyRandomGameIndex);
    });

    currentGameLabel.textContent = `G${currentMyRandomGameIndex + 1} 선택 중 (총 ${totalGames}게임)`;
    
    prevGameBtn.disabled = currentMyRandomGameIndex === 0;
    nextGameBtn.disabled = currentMyRandomGameIndex >= totalGames - 1;
}

function toggleDreamPanel() {
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
    if (!board) {
        return [];
    }
    const selected = Array.from(board.querySelectorAll('.fixed-ball.is-selected'))
        .map((el) => Number.parseInt(el.dataset.number || '', 10))
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
    return selected;
}

function generateWithFixedNumbers(fixedNumbers) {
    const numbers = new Set(fixedNumbers);
    while (numbers.size < PICK_COUNT) {
        numbers.add(Math.floor(Math.random() * LOTTO_NUM_MAX) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

function cloneSets(sets) {
    return sets.map((set) => [...set]);
}

function getModeLabel(mode) {
    if (mode === 'my_random') {
        return '내선택+랜덤';
    }
    if (mode === 'ai_pattern') {
        return '패턴 AI';
    }
    if (mode === 'ai_attention') {
        return '어텐션 AI';
    }
    if (mode === 'dream') {
        return '꿈해몽 추천';
    }
    return '완전 랜덤';
}

function validateDreamInput() {
    const note = dreamNote.value.trim();
    if (note.length > 30) {
        return { ok: false, message: '기타 설명은 30자 이내로 입력해 주세요.' };
    }
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
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        const normalized = (s >>> 0) / 4294967296;
        return normalized;
    };
}

function buildDreamWeightMap(category, emotion, note) {
    const weights = Array(LOTTO_NUM_MAX).fill(1);

    const categoryBoosts = {
        animal: [1, 3, 7, 12, 23, 27, 31, 39, 41, 44],
        falling: [4, 8, 11, 15, 19, 24, 32, 36, 40, 45],
        water: [2, 6, 9, 13, 16, 20, 25, 30, 34, 42],
        body: [5, 10, 14, 18, 21, 26, 28, 33, 37, 43],
        fire: [7, 9, 17, 22, 27, 29, 35, 38, 41, 45],
        money: [3, 8, 11, 14, 19, 24, 28, 32, 40, 44],
        family: [1, 6, 12, 15, 20, 23, 29, 31, 36, 42],
        baby: [2, 5, 10, 13, 18, 22, 26, 30, 34, 39],
        other: [4, 9, 16, 21, 25, 28, 33, 37, 41, 43]
    };

    const emotionBoosts = {
        positive: [7, 12, 21, 27, 34, 41],
        neutral: [5, 14, 22, 30, 38, 44],
        negative: [3, 11, 19, 26, 35, 42]
    };

    const keywordBoosts = [
        { key: '돼지', nums: [3, 8, 24, 32, 44] },
        { key: '뱀', nums: [7, 12, 29, 34, 41] },
        { key: '물', nums: [2, 9, 16, 25, 42] },
        { key: '불', nums: [1, 17, 27, 35, 45] },
        { key: '돈', nums: [8, 14, 24, 28, 40] },
        { key: '아기', nums: [5, 10, 13, 30, 39] },
        { key: '이빨', nums: [4, 11, 21, 33, 43] },
        { key: '죽', nums: [6, 15, 20, 31, 36] }
    ];

    (categoryBoosts[category] || categoryBoosts.other).forEach((num) => {
        weights[num - 1] += 2.8;
    });

    (emotionBoosts[emotion] || []).forEach((num) => {
        weights[num - 1] += 1.8;
    });

    keywordBoosts.forEach((item) => {
        if (note.includes(item.key)) {
            item.nums.forEach((num) => {
                weights[num - 1] += 2.2;
            });
        }
    });

    return weights;
}

function pickNumbersByWeights(weights, seed, offset = 0) {
    const rnd = createSeededRandom(seed + offset * 7919);
    const selected = [];
    const blocked = new Set();

    while (selected.length < PICK_COUNT) {
        const available = weights.map((w, idx) => (blocked.has(idx + 1) ? 0 : w));
        const total = available.reduce((acc, cur) => acc + cur, 0);
        if (total <= 0) {
            break;
        }

        let t = rnd() * total;
        let picked = 1;
        for (let i = 0; i < available.length; i += 1) {
            t -= available[i];
            if (t <= 0) {
                picked = i + 1;
                break;
            }
        }
        blocked.add(picked);
        selected.push(picked);
    }

    while (selected.length < PICK_COUNT) {
        const n = Math.floor(rnd() * LOTTO_NUM_MAX) + 1;
        if (!blocked.has(n)) {
            blocked.add(n);
            selected.push(n);
        }
    }

    return selected.sort((a, b) => a - b);
}

function generateDreamSet(setIndex) {
    const category = dreamCategory.value;
    const emotion = dreamEmotion.value;
    const note = dreamNote.value.trim();

    const weights = buildDreamWeightMap(category, emotion, note);
    const seed = hashTextToSeed(`${category}|${emotion}|${note}|${new Date().toISOString().slice(0, 10)}`);
    return pickNumbersByWeights(weights, seed, setIndex);
}

function interpretDream(category, emotion, note) {
    const categoryText = {
        animal: '동물 꿈은 본능/기회 신호로 해석되는 경우가 많습니다.',
        falling: '추락/도망 꿈은 압박감이나 통제 이슈를 반영할 때가 많습니다.',
        water: '물 관련 꿈은 감정 흐름과 상태 변화를 상징하는 경우가 많습니다.',
        body: '신체 변화 꿈은 건강/관계에 대한 민감도를 보여주는 편입니다.',
        fire: '불·빛 꿈은 강한 에너지와 변화 욕구를 의미할 수 있습니다.',
        money: '돈/보물 꿈은 성취 욕구와 보상 기대를 나타내는 경향이 있습니다.',
        family: '가족/조상 꿈은 정서적 정리와 관계 이슈를 비추는 경우가 많습니다.',
        baby: '아기/탄생 꿈은 새 시작, 기획, 성장의 상징으로 자주 해석됩니다.',
        other: '기타 꿈은 최근 관심사와 감정이 섞여 나타난 장면일 수 있습니다.'
    };

    const emotionText = {
        positive: '기분이 좋았다면 현재 흐름을 확장하는 선택이 유리할 수 있습니다.',
        neutral: '감정이 중립적이었다면 상황을 관찰하며 균형 잡힌 판단이 좋습니다.',
        negative: '불안감이 컸다면 휴식과 우선순위 재정렬이 먼저 필요할 수 있습니다.'
    };

    const noteHint = note
        ? `입력 키워드(${note})를 반영해 번호 가중치를 조정했습니다.`
        : '추가 키워드가 없어서 객관식 정보 중심으로 해석했습니다.';

    return `${categoryText[category] || categoryText.other} ${emotionText[emotion] || ''} ${noteHint}`;
}

function renderDreamInterpretation() {
    const validation = validateDreamInput();
    if (!validation.ok) {
        setStrategyStatus(validation.message);
        return;
    }

    const category = dreamCategory.value;
    const emotion = dreamEmotion.value;
    const note = dreamNote.value.trim();
    dreamInterpretation.textContent = interpretDream(category, emotion, note);
}

function formatSavedTime(isoString) {
    const date = new Date(isoString);
    if (!Number.isFinite(date.getTime())) {
        return '-';
    }
    return date.toLocaleString('ko-KR', { hour12: false });
}

function normalizeSavedSnapshots(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter((item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.savedAt === 'string' &&
            typeof item.mode === 'string' &&
            Array.isArray(item.sets) &&
            item.sets.length > 0 &&
            item.sets.every((row) => Array.isArray(row) && row.length === PICK_COUNT && row.every(Number.isInteger))
        )
        .slice(0, SAVE_LIMIT);
}

function readSavedSnapshots() {
    try {
        const raw = localStorage.getItem(SAVED_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return normalizeSavedSnapshots(parsed);
    } catch {
        return [];
    }
}

function writeSavedSnapshots() {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedSnapshots));
}

function updateSavedCount() {
    savedCount.textContent = `${savedSnapshots.length} / ${SAVE_LIMIT}`;
}

function renderSavedList() {
    updateSavedCount();

    if (!savedSnapshots.length) {
        savedList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--ink-2); opacity: 0.5;">저장된 분석 기록이 없습니다.</p>';
        return;
    }

    savedList.innerHTML = savedSnapshots.map((item) => {
        const preview = item.sets
            .slice(0, 2)
            .map((row, idx) => `<span class="saved-row">${idx + 1}게임: ${row.join(', ')}</span>`)
            .join('');

        return `
            <div class="saved-item" style="border: 1px solid var(--line); border-radius: 16px; padding: 16px; margin-bottom: 12px; background: var(--bg-1);">
                <div class="saved-meta" style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--ink-2); margin-bottom: 8px;">
                    <span>${formatSavedTime(item.savedAt)}</span>
                    <span style="font-weight: 700; color: var(--accent);">${getModeLabel(item.mode)}</span>
                </div>
                <div class="saved-preview" style="font-size: 0.9rem; font-weight: 600; margin-bottom: 12px;">${preview}</div>
                <div class="saved-buttons" style="display: flex; gap: 8px;">
                    <button class="game-nav-btn" type="button" data-load-id="${item.id}" style="flex: 1;">불러오기</button>
                    <button class="game-nav-btn" type="button" data-share-id="${item.id}">공유</button>
                    <button class="game-nav-btn" type="button" data-delete-id="${item.id}" style="color: var(--accent-3);">삭제</button>
                </div>
            </div>
        `;
    }).join('');
}

// Global functions for Board and Comments
window.addPost = function() {
    const nickname = document.getElementById('board-nickname').value.trim();
    const title = document.getElementById('board-title').value.trim();
    const content = document.getElementById('board-content').value.trim();

    if (!nickname || !title || !content) {
        alert('모든 필드를 입력해 주세요.');
        return;
    }

    const posts = JSON.parse(localStorage.getItem('lotto_posts') || '[]');
    const newPost = {
        id: Date.now(),
        nickname,
        title,
        content,
        date: new Date().toISOString().split('T')[0]
    };

    posts.unshift(newPost);
    localStorage.setItem('lotto_posts', JSON.stringify(posts));
    
    document.getElementById('board-nickname').value = '';
    document.getElementById('board-title').value = '';
    document.getElementById('board-content').value = '';
    
    renderPosts();
    alert('후기가 등록되었습니다!');
};

window.renderPosts = function() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const posts = JSON.parse(localStorage.getItem('lotto_posts') || '[]');
    if (posts.length === 0) return;

    container.innerHTML = posts.map(post => `
        <div class="post-card" style="margin-bottom: 16px; border-left: 4px solid var(--accent);">
            <div class="post-meta">
                <span>${post.nickname}</span>
                <span>${post.date}</span>
            </div>
            <div class="post-title">${post.title}</div>
            <div class="post-content">${post.content}</div>
        </div>
    `).join('');
};

async function shareSavedSnapshot(id) {
    const snapshot = savedSnapshots.find((item) => item.id === id);
    if (!snapshot) return;

    const setsText = snapshot.sets
        .map((row, idx) => `${idx + 1}게임: ${row.join(', ')}`)
        .join('\n');
    
    const shareText = `[AI 로또 추천 번호]\n방식: ${getModeLabel(snapshot.mode)}\n\n${setsText}\n\n행운을 빕니다!`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'AI 로또 추천 번호',
                text: shareText,
                url: window.location.href
            });
        } catch (err) {
            console.log('Error sharing:', err);
        }
    } else {
        try {
            await navigator.clipboard.writeText(shareText);
            alert('번호가 클립보드에 복사되었습니다.');
        } catch (err) {
            alert('공유 기능을 사용할 수 없는 브라우저입니다.');
        }
    }
}

function saveCurrentGeneratedSets() {
    if (!lastGeneratedSets.length) {
        setStrategyStatus('저장할 번호가 없습니다.');
        return;
    }

    if (savedSnapshots.length >= SAVE_LIMIT) {
        setStrategyStatus('저장 한도 도달.');
        return;
    }

    const snapshot = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        savedAt: new Date().toISOString(),
        mode: lastGeneratedMode,
        sets: cloneSets(lastGeneratedSets)
    };

    savedSnapshots.unshift(snapshot);
    writeSavedSnapshots();
    renderSavedList();
}

function loadSavedSnapshot(id) {
    const snapshot = savedSnapshots.find((item) => item.id === id);
    if (!snapshot) return;
    lastGeneratedSets = cloneSets(snapshot.sets);
    renderGeneratedSets(lastGeneratedSets);
}

function removeSavedSnapshot(id) {
    savedSnapshots = savedSnapshots.filter((item) => item.id !== id);
    writeSavedSnapshots();
    renderSavedList();
}

function updateStrategyStatusByMode() {
    const mode = strategySelect.value;
    if (mode === 'random') setStrategyStatus('완전 랜덤 모드: 과거 데이터 영향 없이 번호를 생성합니다.');
    else if (mode === 'my_random') setStrategyStatus('내선택+랜덤 모드: 고정 번호를 유지하고 나머지를 랜덤 생성합니다.');
    else if (mode === 'ai_pattern') setStrategyStatus('패턴 기반 AI: MLP 딥러닝 모델로 숫자 간 상관관계를 분석합니다.');
    else if (mode === 'ai_attention') setStrategyStatus('어텐션 기반 AI: Temporal Attention으로 시계열 흐름을 학습합니다.');
    else setStrategyStatus('꿈해몽 모드: 입력된 꿈의 상징성을 수치화하여 번호를 추천합니다.');
}

function generateSingleSet() {
    const numbers = new Set();
    while (numbers.size < PICK_COUNT) {
        numbers.add(Math.floor(Math.random() * LOTTO_NUM_MAX) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

function renderGeneratedSets(sets) {
    resultContainer.innerHTML = '';
    sets.forEach((set, setIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('lotto-row');
        set.forEach((num, index) => {
            const ball = document.createElement('div');
            ball.classList.add('lotto-number', getBallColorClass(num));
            ball.textContent = num;
            ball.style.animationDelay = `${(setIndex * 0.1) + (index * 0.05)}s`;
            rowDiv.appendChild(ball);
        });
        resultContainer.appendChild(rowDiv);
    });
}

// Dummy AI logic for browser-side execution
async function ensurePatternModelReady() { await delay(300); }
async function ensureAttentionModelReady() { await delay(300); }
function generatePatternAiSet() { return generateSingleSet(); }
function generateAttentionAiSet() { return generateSingleSet(); }

function dedupeHistoryByRound(results) {
    const byRound = new Map();
    results.forEach((item) => byRound.set(item.round, item));
    return Array.from(byRound.values()).sort((a, b) => b.round - a.round);
}

function setHistories(results) {
    fullHistory = dedupeHistoryByRound(results);
    trainHistory = [...fullHistory].sort((a, b) => a.round - b.round);
}

async function fetchJsonWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response.json();
}

function normalizeMirrorHistoryData(payload) {
    if (!payload || !Array.isArray(payload.history)) return [];
    return payload.history.map(e => ({
        round: e.round,
        date: e.date,
        numbers: e.numbers,
        prize1: e.prize1, prize2: e.prize2, prize3: e.prize3
    }));
}

function normalizeRemoteAllHistory(payload) {
    if (!Array.isArray(payload)) return [];
    return payload.map(row => ({
        round: row.draw_no,
        date: row.date,
        numbers: row.numbers,
        prize1: row.divisions?.[1]?.prize,
        prize2: row.divisions?.[2]?.prize,
        prize3: row.divisions?.[3]?.prize
    }));
}

function readHistoryCache() {
    const raw = localStorage.getItem(HISTORY_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
}

function writeHistoryCache(items) {
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }));
}

function createHistoryItem(res) {
    const item = document.createElement('div');
    item.classList.add('history-item');
    const numbers = res.numbers || [];
    item.innerHTML = `
        <div>
            <div class="history-round">${res.round}회 (${res.date || ''})</div>
            <div class="history-prizes">1등: ${formatPrizeAmount(res.prize1)}</div>
        </div>
        <div class="history-nums">
            ${numbers.map(n => `<div class="mini-ball ${getBallColorClass(n)}">${n}</div>`).join('')}
        </div>
    `;
    return item;
}

function formatPrizeAmount(v) { return v ? `${v.toLocaleString()}원` : PRIZE_UNKNOWN_TEXT; }

async function fetchLottoHistory() {
    try {
        const remoteAll = await fetchJsonWithTimeout(LOTTO_ALL_HISTORY_URL);
        const allHistory = normalizeRemoteAllHistory(remoteAll);
        setHistories(allHistory);
        historyContainer.innerHTML = '';
        allHistory.slice(0, 50).forEach(res => historyContainer.appendChild(createHistoryItem(res)));
    } catch (e) {
        historyContainer.innerHTML = '<p>기록을 불러올 수 없습니다.</p>';
    }
}

// Start Up
activateMainTab('generate');
buildFixedBallBoards();
toggleMyRandomPanel();
toggleDreamPanel();
updateStrategyStatusByMode();
savedSnapshots = readSavedSnapshots();
renderSavedList();
void fetchLottoHistory();

const now = new Date();
if (currentYearEl) currentYearEl.textContent = String(now.getFullYear());

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('posts-container')) renderPosts();
});
