const lottoNumbersContainer = document.querySelector('.lotto-numbers');
const generateBtn = document.querySelector('#generate-btn');

generateBtn.addEventListener('click', () => {
    lottoNumbersContainer.innerHTML = ''; // Clear previous numbers

    const numbers = new Set();
    while (numbers.size < 6) {
        numbers.add(Math.floor(Math.random() * 45) + 1);
    }

    const sortedNumbers = Array.from(numbers).sort((a, b) => a - b);

    sortedNumbers.forEach((number, index) => {
        setTimeout(() => {
            const numberDiv = document.createElement('div');
            numberDiv.classList.add('lotto-number');
            numberDiv.textContent = number;
            lottoNumbersContainer.appendChild(numberDiv);
        }, index * 200); // Add a slight delay for each number
    });
});