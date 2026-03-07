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
const html = document.documentElement;

const LOTTO_NUM_MAX = 45;
const PICK_COUNT = 6;
const SAVE_LIMIT = 5;
const SAVED_STORAGE_KEY = 'lotto_saved_snapshots_v1';
const TRAIN_YEARS = 5;
const TRAIN_MIN_ROUNDS = 40;
const TRAIN_WINDOW = 12;
const HISTORY_PAGE_SIZE = 52;
const LOTTO_ALL_HISTORY_URL = 'https://smok95.github.io/lotto/results/all.json';
const HISTORY_CACHE_KEY = 'lotto_history_5y_cache_v1';
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
    updateMyRandomRowsByGameCount();
});

tabGenerateBtn.addEventListener('click', () => {
    activateMainTab('generate');
});

tabHistoryBtn.addEventListener('click', () => {
    activateMainTab('history');
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

    if (mode === 'ai_pattern' || mode === 'ai_attention') {
        await playAiThinkingAnimation(1000);
    }

    renderGeneratedSets(sets);
    lastGeneratedSets = cloneSets(sets);
    lastGeneratedMode = mode;
});

function updateThemeButtonText(theme) {
    themeBtn.textContent = theme === 'light' ? '다크 모드' : '라이트 모드';
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
        <div class="ai-thinking-board" aria-label="AI 계산 중">
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
        </div>
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

function toggleMyRandomPanel() {
    if (strategySelect.value === 'my_random') {
        myRandomPanel.classList.remove('hidden');
        updateMyRandomRowsByGameCount();
    } else {
        myRandomPanel.classList.add('hidden');
    }
}

function updateMyRandomRowsByGameCount() {
    const gameCount = Number.parseInt(numSetsSelect.value, 10) || 1;
    const rows = myRandomPanel.querySelectorAll('.my-random-row');
    rows.forEach((row, index) => {
        row.classList.toggle('hidden', index >= gameCount);
    });
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
            ball.classList.add('fixed-ball', getBallColorClass(n));
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
        savedList.innerHTML = '<p class="saved-empty">저장된 번호가 없습니다.</p>';
        return;
    }

    savedList.innerHTML = savedSnapshots.map((item) => {
        const preview = item.sets
            .slice(0, 2)
            .map((row, idx) => `<span class="saved-row">${idx + 1}게임: ${row.join(', ')}</span>`)
            .join('');

        return `
            <div class="saved-item">
                <div class="saved-meta">
                    <span>${formatSavedTime(item.savedAt)}</span>
                    <span>${getModeLabel(item.mode)} / ${item.sets.length}게임</span>
                </div>
                <div class="saved-preview">${preview}</div>
                <div class="saved-buttons">
                    <button class="tiny-btn" type="button" data-load-id="${item.id}">불러오기</button>
                    <button class="tiny-btn" type="button" data-delete-id="${item.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');
}

function saveCurrentGeneratedSets() {
    if (!lastGeneratedSets.length) {
        setStrategyStatus('저장할 번호가 없습니다. 먼저 번호를 생성해 주세요.');
        return;
    }

    if (savedSnapshots.length >= SAVE_LIMIT) {
        setStrategyStatus('저장 한도(5개)에 도달했습니다. 기존 저장본을 삭제 후 다시 저장해 주세요.');
        return;
    }

    const snapshot = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        savedAt: new Date().toISOString(),
        mode: lastGeneratedMode,
        sets: cloneSets(lastGeneratedSets)
    };

    savedSnapshots.unshift(snapshot);
    savedSnapshots = savedSnapshots.slice(0, SAVE_LIMIT);
    writeSavedSnapshots();
    renderSavedList();
    setStrategyStatus(`번호를 저장했습니다. (${savedSnapshots.length}/${SAVE_LIMIT})`);
}

function loadSavedSnapshot(id) {
    const snapshot = savedSnapshots.find((item) => item.id === id);
    if (!snapshot) {
        return;
    }
    lastGeneratedSets = cloneSets(snapshot.sets);
    renderGeneratedSets(lastGeneratedSets);
    setStrategyStatus(`저장된 번호를 불러왔습니다. (${getModeLabel(snapshot.mode)})`);
}

function removeSavedSnapshot(id) {
    const before = savedSnapshots.length;
    savedSnapshots = savedSnapshots.filter((item) => item.id !== id);
    if (savedSnapshots.length === before) {
        return;
    }
    writeSavedSnapshots();
    renderSavedList();
    setStrategyStatus('저장된 번호를 삭제했습니다.');
}

function updateStrategyStatusByMode() {
    const mode = strategySelect.value;
    if (mode === 'random') {
        setStrategyStatus('완전 랜덤 모드: 과거 데이터 영향 없이 번호를 생성합니다.');
    } else if (mode === 'my_random') {
        setStrategyStatus('내선택+랜덤 모드: 게임별 고정 번호를 유지하고 나머지는 랜덤으로 채웁니다.');
    } else if (mode === 'ai_pattern') {
        const rounds = trainHistory.length;
        setStrategyStatus(`패턴 기반 AI 모드: 최근 ${TRAIN_YEARS}년(${rounds}회차) 학습 데이터를 사용합니다.`);
    } else if (mode === 'ai_attention') {
        const rounds = trainHistory.length;
        setStrategyStatus(`어텐션 기반 AI 모드: 최근 ${TRAIN_YEARS}년(${rounds}회차) 시계열 가중치를 학습합니다.`);
    } else {
        setStrategyStatus('꿈해몽 모드: 꿈 종류/분위기/기타 설명을 입력해 번호를 추천합니다.');
    }
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
            ball.classList.add('lotto-number');
            ball.classList.add(getBallColorClass(num));
            ball.textContent = num;
            ball.style.animationDelay = `${(setIndex * 0.12) + (index * 0.06)}s`;
            rowDiv.appendChild(ball);
        });

        resultContainer.appendChild(rowDiv);
    });
}

function dedupeHistoryByRound(results) {
    const byRound = new Map();
    results.forEach((item) => {
        byRound.set(item.round, item);
    });
    return Array.from(byRound.values()).sort((a, b) => b.round - a.round);
}

function isValidDateString(value) {
    if (!value || typeof value !== 'string') {
        return false;
    }
    const d = new Date(`${value}T00:00:00+09:00`);
    return Number.isFinite(d.getTime());
}

function filterHistoryByYears(results, years) {
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());

    return results.filter((row) => {
        if (!isValidDateString(row.date)) {
            return false;
        }
        const d = new Date(`${row.date}T00:00:00+09:00`);
        return d >= cutoff;
    });
}

function resetAllModels() {
    modelStore.pattern.model = null;
    modelStore.pattern.trainedRounds = 0;

    modelStore.attention.model = null;
    modelStore.attention.trainedRounds = 0;
}

function setHistories(results) {
    fullHistory = dedupeHistoryByRound(results);
    trainHistory = filterHistoryByYears(fullHistory, TRAIN_YEARS)
        .sort((a, b) => a.round - b.round);

    resetAllModels();
    updateStrategyStatusByMode();
}

function buildFeatureVector(roundsAsc, endIndex, windowSize) {
    const freq = Array(LOTTO_NUM_MAX).fill(0);

    for (let i = endIndex - windowSize; i < endIndex; i += 1) {
        for (const n of roundsAsc[i].numbers) {
            freq[n - 1] += 1;
        }
    }

    const denom = windowSize * PICK_COUNT;
    return freq.map((v) => v / denom);
}

function buildTrainingSamples(roundsAsc, windowSize) {
    const samples = [];

    for (let i = windowSize; i < roundsAsc.length; i += 1) {
        const x = buildFeatureVector(roundsAsc, i, windowSize);
        const y = Array(LOTTO_NUM_MAX).fill(0);
        for (const n of roundsAsc[i].numbers) {
            y[n - 1] = 1;
        }
        samples.push({ x, y });
    }

    return samples;
}

function createPatternModel(inputSize, hiddenSize, outputSize) {
    const w1 = Array.from({ length: inputSize }, () =>
        Array.from({ length: hiddenSize }, () => (Math.random() - 0.5) * 0.08)
    );
    const b1 = Array(hiddenSize).fill(0);

    const w2 = Array.from({ length: hiddenSize }, () =>
        Array.from({ length: outputSize }, () => (Math.random() - 0.5) * 0.08)
    );
    const b2 = Array(outputSize).fill(0);

    return { w1, b1, w2, b2 };
}

function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
}

function predictPatternProbabilities(model, x) {
    const hiddenRaw = model.b1.map((b, j) => {
        let sum = b;
        for (let i = 0; i < x.length; i += 1) {
            sum += x[i] * model.w1[i][j];
        }
        return sum;
    });

    const hidden = hiddenRaw.map((v) => (v > 0 ? v : 0));

    return model.b2.map((b, k) => {
        let sum = b;
        for (let j = 0; j < hidden.length; j += 1) {
            sum += hidden[j] * model.w2[j][k];
        }
        return sigmoid(sum);
    });
}

function trainPatternNetwork(samples, options) {
    const { inputSize, hiddenSize, outputSize, epochs, learningRate } = options;
    const model = createPatternModel(inputSize, hiddenSize, outputSize);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
        for (const sample of samples) {
            const x = sample.x;
            const y = sample.y;

            const hiddenRaw = model.b1.map((b, j) => {
                let sum = b;
                for (let i = 0; i < inputSize; i += 1) {
                    sum += x[i] * model.w1[i][j];
                }
                return sum;
            });
            const hidden = hiddenRaw.map((v) => (v > 0 ? v : 0));

            const out = model.b2.map((b, k) => {
                let sum = b;
                for (let j = 0; j < hiddenSize; j += 1) {
                    sum += hidden[j] * model.w2[j][k];
                }
                return sigmoid(sum);
            });

            const dOut = out.map((pred, k) => pred - y[k]);
            const dHidden = Array(hiddenSize).fill(0);

            for (let j = 0; j < hiddenSize; j += 1) {
                let grad = 0;
                for (let k = 0; k < outputSize; k += 1) {
                    grad += dOut[k] * model.w2[j][k];
                }
                dHidden[j] = hiddenRaw[j] > 0 ? grad : 0;
            }

            for (let j = 0; j < hiddenSize; j += 1) {
                for (let k = 0; k < outputSize; k += 1) {
                    model.w2[j][k] -= learningRate * hidden[j] * dOut[k];
                }
            }
            for (let k = 0; k < outputSize; k += 1) {
                model.b2[k] -= learningRate * dOut[k];
            }

            for (let i = 0; i < inputSize; i += 1) {
                for (let j = 0; j < hiddenSize; j += 1) {
                    model.w1[i][j] -= learningRate * x[i] * dHidden[j];
                }
            }
            for (let j = 0; j < hiddenSize; j += 1) {
                model.b1[j] -= learningRate * dHidden[j];
            }
        }
    }

    return model;
}

function softmax(logits) {
    const maxLogit = Math.max(...logits);
    const expVals = logits.map((v) => Math.exp(v - maxLogit));
    const sum = expVals.reduce((a, b) => a + b, 0) || 1;
    return expVals.map((v) => v / sum);
}

function normalizeDrawAsVector(draw) {
    const v = Array(LOTTO_NUM_MAX).fill(0);
    draw.numbers.forEach((n) => {
        v[n - 1] = 1;
    });
    return v;
}

function createAttentionModel(featureSize) {
    return {
        query: Array.from({ length: featureSize }, () => (Math.random() - 0.5) * 0.08),
        key: Array.from({ length: featureSize }, () => (Math.random() - 0.5) * 0.08),
        value: Array.from({ length: featureSize }, () => (Math.random() - 0.5) * 0.08),
        outW: Array.from({ length: featureSize }, () =>
            Array.from({ length: LOTTO_NUM_MAX }, () => (Math.random() - 0.5) * 0.08)
        ),
        outB: Array(LOTTO_NUM_MAX).fill(0)
    };
}

function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i += 1) {
        s += a[i] * b[i];
    }
    return s;
}

function elementWiseMul(a, b) {
    const out = Array(a.length);
    for (let i = 0; i < a.length; i += 1) {
        out[i] = a[i] * b[i];
    }
    return out;
}

function weightedSum(vectors, weights) {
    const out = Array(vectors[0].length).fill(0);
    for (let i = 0; i < vectors.length; i += 1) {
        for (let j = 0; j < out.length; j += 1) {
            out[j] += vectors[i][j] * weights[i];
        }
    }
    return out;
}

function attentionForward(model, sequence) {
    const q = sequence[sequence.length - 1].map((v, i) => v * model.query[i]);
    const keys = sequence.map((vec) => elementWiseMul(vec, model.key));
    const values = sequence.map((vec) => elementWiseMul(vec, model.value));

    const scores = keys.map((k) => dot(q, k) / Math.sqrt(LOTTO_NUM_MAX));
    const attn = softmax(scores);
    const context = weightedSum(values, attn);

    const logits = Array(LOTTO_NUM_MAX).fill(0);
    for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
        let s = model.outB[k];
        for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
            s += context[i] * model.outW[i][k];
        }
        logits[k] = s;
    }

    const probs = logits.map((z) => sigmoid(z));
    return { probs, context, attn, values, q, keys };
}

function buildAttentionSamples(roundsAsc, seqLen) {
    const data = roundsAsc.map((d) => normalizeDrawAsVector(d));
    const samples = [];

    for (let i = seqLen; i < data.length; i += 1) {
        samples.push({
            seq: data.slice(i - seqLen, i),
            target: data[i]
        });
    }

    return samples;
}

function trainAttentionModel(samples, options) {
    const { epochs, learningRate, seqLen } = options;
    const model = createAttentionModel(LOTTO_NUM_MAX);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
        for (const sample of samples) {
            const forward = attentionForward(model, sample.seq);
            const dLogits = forward.probs.map((p, i) => p - sample.target[i]);

            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
                    model.outW[i][k] -= learningRate * forward.context[i] * dLogits[k];
                }
            }
            for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
                model.outB[k] -= learningRate * dLogits[k];
            }

            const dContext = Array(LOTTO_NUM_MAX).fill(0);
            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                let g = 0;
                for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
                    g += dLogits[k] * model.outW[i][k];
                }
                dContext[i] = g;
            }

            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                let gradValue = 0;
                for (let t = 0; t < seqLen; t += 1) {
                    gradValue += dContext[i] * sample.seq[t][i] * forward.attn[t];
                }
                model.value[i] -= learningRate * 0.05 * gradValue;
            }

            const lastVec = sample.seq[seqLen - 1];
            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                const base = dContext[i] * lastVec[i];
                model.query[i] -= learningRate * 0.02 * base;
                model.key[i] -= learningRate * 0.02 * base;
            }
        }
    }

    return model;
}

function sampleNumbersFromDistribution(probabilities) {
    const selected = [];
    const picked = new Set();

    while (selected.length < PICK_COUNT) {
        const weights = probabilities.map((p, i) => {
            if (picked.has(i + 1)) {
                return 0;
            }
            const noise = Math.random() * 0.015;
            return Math.max(1e-6, p + noise);
        });

        const total = weights.reduce((acc, v) => acc + v, 0);
        if (total <= 0) {
            break;
        }

        let r = Math.random() * total;
        let chosenIndex = 0;

        for (let i = 0; i < weights.length; i += 1) {
            r -= weights[i];
            if (r <= 0) {
                chosenIndex = i;
                break;
            }
        }

        picked.add(chosenIndex + 1);
        selected.push(chosenIndex + 1);
    }

    while (selected.length < PICK_COUNT) {
        const n = Math.floor(Math.random() * LOTTO_NUM_MAX) + 1;
        if (!picked.has(n)) {
            picked.add(n);
            selected.push(n);
        }
    }

    return selected.sort((a, b) => a - b);
}

async function ensurePatternModelReady() {
    if (modelStore.pattern.isTraining) {
        setStrategyStatus('패턴 기반 AI 모델 학습 중입니다...');
        return;
    }

    if (trainHistory.length < TRAIN_MIN_ROUNDS) {
        setStrategyStatus('최근 5년 학습 데이터가 부족해 랜덤으로 추천합니다.');
        return;
    }

    if (modelStore.pattern.model && modelStore.pattern.trainedRounds === trainHistory.length) {
        setStrategyStatus(`패턴 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.pattern.trainedRounds}회차)`);
        return;
    }

    modelStore.pattern.isTraining = true;
    setStrategyStatus('패턴 기반 AI 학습 중...');

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
        const samples = buildTrainingSamples(trainHistory, TRAIN_WINDOW);
        if (samples.length < 20) {
            setStrategyStatus('패턴 AI 학습 샘플이 부족해 랜덤 추천으로 전환합니다.');
            return;
        }

        modelStore.pattern.model = trainPatternNetwork(samples, {
            inputSize: LOTTO_NUM_MAX,
            hiddenSize: 24,
            outputSize: LOTTO_NUM_MAX,
            epochs: 170,
            learningRate: 0.035
        });
        modelStore.pattern.trainedRounds = trainHistory.length;
        setStrategyStatus(`패턴 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.pattern.trainedRounds}회차)`);
    } catch (error) {
        console.error('Pattern model training error:', error);
        setStrategyStatus('패턴 AI 학습 실패, 랜덤 추천으로 전환합니다.');
    } finally {
        modelStore.pattern.isTraining = false;
    }
}

async function ensureAttentionModelReady() {
    if (modelStore.attention.isTraining) {
        setStrategyStatus('어텐션 기반 AI 모델 학습 중입니다...');
        return;
    }

    if (trainHistory.length < TRAIN_MIN_ROUNDS) {
        setStrategyStatus('최근 5년 학습 데이터가 부족해 랜덤으로 추천합니다.');
        return;
    }

    if (modelStore.attention.model && modelStore.attention.trainedRounds === trainHistory.length) {
        setStrategyStatus(`어텐션 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.attention.trainedRounds}회차)`);
        return;
    }

    modelStore.attention.isTraining = true;
    setStrategyStatus('어텐션 기반 AI 학습 중...');

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
        const seqLen = 10;
        const samples = buildAttentionSamples(trainHistory, seqLen);
        if (samples.length < 20) {
            setStrategyStatus('어텐션 AI 학습 샘플이 부족해 랜덤 추천으로 전환합니다.');
            return;
        }

        modelStore.attention.model = trainAttentionModel(samples, {
            epochs: 120,
            learningRate: 0.03,
            seqLen
        });
        modelStore.attention.trainedRounds = trainHistory.length;
        setStrategyStatus(`어텐션 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.attention.trainedRounds}회차)`);
    } catch (error) {
        console.error('Attention model training error:', error);
        setStrategyStatus('어텐션 AI 학습 실패, 랜덤 추천으로 전환합니다.');
    } finally {
        modelStore.attention.isTraining = false;
    }
}

function generatePatternAiSet() {
    if (!modelStore.pattern.model || trainHistory.length < TRAIN_WINDOW) {
        return generateSingleSet();
    }

    const x = buildFeatureVector(trainHistory, trainHistory.length, TRAIN_WINDOW);
    const probs = predictPatternProbabilities(modelStore.pattern.model, x);
    return sampleNumbersFromDistribution(probs);
}

function generateAttentionAiSet() {
    if (!modelStore.attention.model || trainHistory.length < 10) {
        return generateSingleSet();
    }

    const seq = trainHistory.slice(-10).map((d) => normalizeDrawAsVector(d));
    const forward = attentionForward(modelStore.attention.model, seq);
    return sampleNumbersFromDistribution(forward.probs);
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchJsonWithTimeout(url, timeoutMs = 2500) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        const parsed = safeJsonParse(text);
        if (!parsed) {
            throw new Error('Invalid JSON response');
        }
        return parsed;
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildRoundSources(round) {
    const officialUrl = `${LOTTO_BASE_URL}${round}`;
    return [
        officialUrl,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(officialUrl)}`
    ];
}

function normalizeRoundData(data) {
    const numbers = [
        data.drwtNo1,
        data.drwtNo2,
        data.drwtNo3,
        data.drwtNo4,
        data.drwtNo5,
        data.drwtNo6
    ].filter((n) => Number.isInteger(n));

    if (data.returnValue !== 'success' || !Number.isInteger(data.drwNo) || numbers.length !== 6) {
        return null;
    }

    return {
        round: data.drwNo,
        date: data.drwNoDate,
        numbers,
        bonus: data.bnusNo
    };
}

async function fetchRoundResult(round) {
    const sources = buildRoundSources(round);

    for (const sourceUrl of sources) {
        try {
            const data = await fetchJsonWithTimeout(sourceUrl);
            const normalized = normalizeRoundData(data);
            if (normalized) {
                return normalized;
            }
        } catch {
            // try next source
        }
    }

    throw new Error(`Round ${round} fetch failed`);
}

function getExpectedCurrentRound() {
    const diffMs = Date.now() - ROUND_1_DATE.getTime();
    const elapsedWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, elapsedWeeks + 1);
}

async function findLatestAvailableRound() {
    const expected = getExpectedCurrentRound();

    for (let round = expected + 1; round >= expected - 3; round -= 1) {
        if (round < 1) {
            continue;
        }
        try {
            const result = await fetchRoundResult(round);
            return result.round;
        } catch {
            // continue probing
        }
    }

    throw new Error('Latest round probe failed');
}

function normalizeMirrorHistoryData(payload) {
    if (!payload || !Array.isArray(payload.history)) {
        return [];
    }

    return payload.history
        .map((entry) => ({
            round: entry.round,
            date: entry.createdAt || entry.date,
            numbers: entry.numbers,
            bonus: entry.bonus,
            prize1: entry.prize1 || null,
            prize2: entry.prize2 || null,
            prize3: entry.prize3 || null
        }))
        .filter((entry) =>
            Number.isInteger(entry.round) &&
            typeof entry.date === 'string' &&
            Array.isArray(entry.numbers) &&
            entry.numbers.length === 6 &&
            entry.numbers.every((n) => Number.isInteger(n))
        )
        .sort((a, b) => b.round - a.round);
}

function normalizeRemoteAllHistory(payload) {
    if (!Array.isArray(payload)) {
        return [];
    }

    return payload
        .map((row) => {
            const date = typeof row.date === 'string'
                ? new Date(row.date).toISOString().slice(0, 10)
                : null;
            return {
                round: row.draw_no,
                date,
                numbers: row.numbers,
                bonus: row.bonus_no,
                prize1: row.divisions?.[1]?.prize ?? null,
                prize2: row.divisions?.[2]?.prize ?? null,
                prize3: row.divisions?.[3]?.prize ?? null
            };
        })
        .filter((entry) =>
            Number.isInteger(entry.round) &&
            typeof entry.date === 'string' &&
            Array.isArray(entry.numbers) &&
            entry.numbers.length === 6 &&
            entry.numbers.every(Number.isInteger)
        )
        .sort((a, b) => b.round - a.round);
}

function formatPrizeAmount(value) {
    if (!Number.isFinite(value)) {
        return PRIZE_UNKNOWN_TEXT;
    }
    return `${value.toLocaleString('ko-KR')}원`;
}

function readHistoryCache() {
    try {
        const raw = localStorage.getItem(HISTORY_CACHE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.items)) {
            return null;
        }
        return {
            savedAt: parsed.savedAt,
            items: normalizeMirrorHistoryData({ history: parsed.items })
        };
    } catch {
        return null;
    }
}

function writeHistoryCache(items) {
    const payload = {
        savedAt: Date.now(),
        items
    };
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(payload));
}

function isCacheFresh(cache) {
    if (!cache) {
        return false;
    }
    return Date.now() - cache.savedAt < HISTORY_CACHE_TTL_MS;
}

function toRecentFiveYears(items) {
    const sorted = dedupeHistoryByRound(items).sort((a, b) => a.round - b.round);
    return filterHistoryByYears(sorted, TRAIN_YEARS).sort((a, b) => b.round - a.round);
}

async function fetchHistoryFromMirror() {
    const mirrorPayload = await fetchJsonWithTimeout(LOTTO_HISTORY_MIRROR_URL, 8000);
    const normalized = normalizeMirrorHistoryData(mirrorPayload);
    if (!normalized.length) {
        throw new Error('Mirror history is empty');
    }
    return normalized;
}

function createHistoryItem(res) {
    const item = document.createElement('div');
    item.classList.add('history-item');

    const left = document.createElement('div');
    const round = document.createElement('div');
    round.classList.add('history-round');
    round.textContent = res.date ? `${res.round}회 (${res.date})` : `${res.round}회`;
    const prizes = document.createElement('div');
    prizes.classList.add('history-prizes');
    prizes.textContent = `1등 ${formatPrizeAmount(res.prize1)} · 2등 ${formatPrizeAmount(res.prize2)} · 3등 ${formatPrizeAmount(res.prize3)}`;
    left.appendChild(round);
    left.appendChild(prizes);

    const numsDiv = document.createElement('div');
    numsDiv.classList.add('history-nums');

    const numbers = res.numbers || [res.drwtNo1, res.drwtNo2, res.drwtNo3, res.drwtNo4, res.drwtNo5, res.drwtNo6];
    numbers.forEach((n) => {
        const miniBall = document.createElement('div');
        miniBall.classList.add('mini-ball');
        miniBall.classList.add(getBallColorClass(n));
        miniBall.textContent = n;
        numsDiv.appendChild(miniBall);
    });

    item.appendChild(left);
    item.appendChild(numsDiv);
    return item;
}

function appendHistoryPage() {
    if (!historyVisibleItems.length || historyRenderOffset >= historyVisibleItems.length) {
        return;
    }

    const nextSlice = historyVisibleItems.slice(historyRenderOffset, historyRenderOffset + HISTORY_PAGE_SIZE);
    nextSlice.forEach((res) => {
        historyContainer.appendChild(createHistoryItem(res));
    });
    historyRenderOffset += nextSlice.length;
}

function setHistoryDataset(results) {
    historyVisibleItems = [...results].sort((a, b) => b.round - a.round);
    historyRenderOffset = 0;
    historyContainer.innerHTML = '';
    appendHistoryPage();
}

async function hydrateModelHistoryFromMirror() {
    try {
        const mirrorResults = await fetchHistoryFromMirror();
        if (mirrorResults.length > fullHistory.length) {
            setHistories(mirrorResults);
        }
    } catch (error) {
        console.warn('Mirror model history hydrate failed:', error);
    }
}

async function fetchLottoHistory() {
    historyContainer.innerHTML = '<p>최근 당첨 결과를 불러오는 중...</p>';
    const cache = readHistoryCache();
    if (cache && cache.items.length) {
        setHistoryDataset(cache.items);
        setHistories(cache.items);
    }

    if (cache && isCacheFresh(cache)) {
        return;
    }

    try {
        const remoteAll = await fetchJsonWithTimeout(LOTTO_ALL_HISTORY_URL, 12000);
        const normalizedAll = normalizeRemoteAllHistory(remoteAll);
        const recentFiveYears = toRecentFiveYears(normalizedAll);

        if (!recentFiveYears.length) {
            throw new Error('Remote 5y history is empty');
        }

        writeHistoryCache(recentFiveYears);
        setHistoryDataset(recentFiveYears);
        setHistories(recentFiveYears);
    } catch (error) {
        console.warn('Remote history fetch failed, fallback to mirror:', error);
        try {
            if (!cache || !cache.items.length) {
                const fallbackResults = toRecentFiveYears(await fetchHistoryFromMirror());
                if (!fallbackResults.length) {
                    throw new Error('Fallback history empty');
                }
                writeHistoryCache(fallbackResults);
                setHistoryDataset(fallbackResults);
                setHistories(fallbackResults);
            }
        } catch (fallbackError) {
            console.error('History fetch error:', fallbackError);
            historyContainer.innerHTML = '<p>당첨번호 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
        }
    }
}

activateMainTab('generate');
buildFixedBallBoards();
toggleMyRandomPanel();
toggleDreamPanel();
updateStrategyStatusByMode();
savedSnapshots = readSavedSnapshots();
renderSavedList();
void fetchLottoHistory();
