const resultContainer = document.querySelector('#lotto-results-container');
const generateBtn = document.querySelector('#generate-btn');
const numSetsSelect = document.querySelector('#num-sets');
const themeBtn = document.querySelector('#theme-btn');
const historyContainer = document.querySelector('#history-container');
const html = document.documentElement;

// --- Theme Logic ---
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

function updateThemeButtonText(theme) {
    themeBtn.textContent = theme === 'light' ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode';
}

// --- Lotto Generation Logic ---
function generateSingleSet() {
    const numbers = new Set();
    while (numbers.size < 6) {
        numbers.add(Math.floor(Math.random() * 45) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

generateBtn.addEventListener('click', () => {
    resultContainer.innerHTML = '';
    const numSets = parseInt(numSetsSelect.value);

    for (let i = 0; i < numSets; i++) {
        const set = generateSingleSet();
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('lotto-row');

        set.forEach((num, index) => {
            const ball = document.createElement('div');
            ball.classList.add('lotto-number');
            ball.textContent = num;
            ball.style.animationDelay = `${(i * 0.1) + (index * 0.05)}s`;
            rowDiv.appendChild(ball);
        });
        resultContainer.appendChild(rowDiv);
    }
});

// --- Winning History Logic (Past Year) ---
// Note: In a real production app, you'd fetch this from a server. 
// Here we simulate the last 52 weeks using dynamic data or a proxy.
async function fetchLottoHistory() {
    historyContainer.innerHTML = '<p>Fetching latest results...</p>';
    
    try {
        // Example: Using a community-maintained JSON for Korean Lotto
        // This is a placeholder for actual API logic
        const response = await fetch('https://raw.githubusercontent.com/hyp3r69/korean-lotto-data/master/data.json');
        if (!response.ok) throw new Error('Failed to fetch');
        
        const data = await response.json();
        // Assume data is an array of rounds. Get last 52.
        const recentResults = data.slice(-52).reverse();
        
        renderHistory(recentResults);
    } catch (error) {
        console.error('History Fetch Error:', error);
        // Fallback: Show a friendly message or some static recent data if API fails
        historyContainer.innerHTML = '<p>Could not load history. Please try again later.</p>';
    }
}

function renderHistory(results) {
    historyContainer.innerHTML = '';
    results.forEach(res => {
        const item = document.createElement('div');
        item.classList.add('history-item');
        
        const round = document.createElement('div');
        round.classList.add('history-round');
        round.textContent = `${res.round}회`;

        const numsDiv = document.createElement('div');
        numsDiv.classList.add('history-nums');
        
        // Handling both array of numbers or individual keys based on common API structures
        const numbers = res.numbers || [res.drwtNo1, res.drwtNo2, res.drwtNo3, res.drwtNo4, res.drwtNo5, res.drwtNo6];
        
        numbers.forEach(n => {
            const miniBall = document.createElement('div');
            miniBall.classList.add('mini-ball');
            miniBall.textContent = n;
            numsDiv.appendChild(miniBall);
        });

        item.appendChild(round);
        item.appendChild(numsDiv);
        historyContainer.appendChild(item);
    });
}

// Initial fetch
fetchLottoHistory();
