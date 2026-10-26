const answer = "CANDLE";
const alphabet = "QWERTYUIOPASDFGHJKLZXCVBNM";
const maxRows = 6;
const board = document.querySelector("#board");
const keyboard = document.querySelector("#keyboard");
const status = document.querySelector("#game-status");
let currentGuess = "";
let rowIndex = 0;
let gameOver = false;

function buildBoard() {
  board.innerHTML = "";
  for (let row = 0; row < maxRows; row += 1) {
    const rowElement = document.createElement("div");
    rowElement.className = "row";
    for (let tile = 0; tile < 6; tile += 1) {
      const tileElement = document.createElement("div");
      tileElement.className = "tile";
      tileElement.dataset.position = `${row}-${tile}`;
      rowElement.append(tileElement);
    }
    board.append(rowElement);
  }
}

function buildKeyboard() {
  keyboard.innerHTML = "";
  [...alphabet].forEach((letter) => addKey(letter));
  addKey("⌫", "wide");
  addKey("ENTER", "wide");
}

function addKey(label, extraClass = "") {
  const key = document.createElement("button");
  key.className = `key ${extraClass}`;
  key.textContent = label;
  key.dataset.key = label;
  key.addEventListener("click", () => handleKey(label));
  keyboard.append(key);
}

function handleKey(key) {
  if (gameOver) return;
  if (key === "⌫") currentGuess = currentGuess.slice(0, -1);
  else if (key === "ENTER") submitGuess();
  else if (/^[A-Z]$/.test(key) && currentGuess.length < 6) currentGuess += key;
  renderGuess();
}

function renderGuess() {
  for (let position = 0; position < 6; position += 1) {
    const tile = document.querySelector(`[data-position="${rowIndex}-${position}"]`);
    tile.textContent = currentGuess[position] || "";
    tile.classList.toggle("filled", Boolean(currentGuess[position]));
  }
}

function submitGuess() {
  if (currentGuess.length !== 6) {
    status.textContent = "Your guess needs six letters";
    board.animate([{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 180 });
    return;
  }
  const guess = currentGuess;
  [...guess].forEach((letter, index) => {
    const tile = document.querySelector(`[data-position="${rowIndex}-${index}"]`);
    const key = document.querySelector(`[data-key="${letter}"]`);
    const result = letter === answer[index] ? "exact" : answer.includes(letter) ? "close" : "miss";
    tile.classList.add(result);
    if (key && !key.classList.contains("exact")) key.classList.add(result);
  });
  rowIndex += 1;
  if (guess === answer) endGame("A perfect roll. You got it!");
  else if (rowIndex === maxRows) endGame(`The word was ${answer}.`);
  else { currentGuess = ""; status.textContent = `${maxRows - rowIndex} rolls left`; }
}

function endGame(message) { gameOver = true; status.textContent = message; }
function resetGame() { currentGuess = ""; rowIndex = 0; gameOver = false; status.textContent = "Make your first guess"; buildBoard(); buildKeyboard(); }

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleKey("ENTER");
  else if (event.key === "Backspace") handleKey("⌫");
  else handleKey(event.key.toUpperCase());
});
document.querySelector("#new-game-button").addEventListener("click", resetGame);
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelector("#help-button").addEventListener("click", () => document.querySelector("#help-modal").showModal());
document.querySelector("#stats-button").addEventListener("click", () => document.querySelector("#stats-modal").showModal());
buildBoard();
buildKeyboard();
