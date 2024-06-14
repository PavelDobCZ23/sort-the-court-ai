const CharacterAI = require("node_characterai");
const characterAI = new CharacterAI();

const path = require('path');
const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');

const SORT_THE_COURT_URL = "https://graebor.itch.io/sort-the-court";
const DECISION_QUEST_AREA = {x: 0,xSize: 0, y: 0, ySize: 0};
const DECISION_NAME_AREA = {x: 0,xSize: 0, y: 0, ySize: 0};

const SOCIALIST_TEST_ID = "79uuEVuQrD4v6Dfcgi-HWs9MmdmFazreiqIOv4hRGIo";
const CAPITALIST_ID = "JYqDNofa-EYsZAy2ct0G6U-R9JT_fqJMr-NORzlUPtA";
const COMMUNIST_ID = "LSFVRsYtcUdT3buD0Vk7HZGeqwkpOijMbwuw3PJpCE8";

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	// Authenticating as a guest (use `.authenticateWithToken()` to use an account)
	//await characterAI.authenticateWithToken(process.env.CHARAI_TOKEN);

	// Place your character's id here
	const characterId = SOCIALIST_TEST_ID;

	// Create a chat object to interact with the conversation
	//const chat = await characterAI.createOrContinueChat(characterId);

	// Send a message
	//const response = await chat.sendAndAwaitResponse("Hello, can you introduce yourself?", true);

	//console.log(response);
	// Use `response.text` to use it as a string

	const browser = await puppeteer.launch({ headless: false, args: ['--window-size=1920,1080']});
	const page = await browser.newPage();
	page.on('dialog', async dialog => {
		const message = dialog.message();
		if (message.startsWith("You need a browser which supports WebGL")) {
			console.log("WEBGL Warming")
		}
        console.log(`Alert message: ${dialog.message()}`);
        await dialog.accept(); // Accept the alert
    });
	await page.goto(SORT_THE_COURT_URL);
	await page.setViewport({
		width: 1200,
		height: 700
	});
	
	await sleep(12000);
	console.log("Taking Screenshot");
	let screenshotBuffer = await page.screenshot();
    await fs.promises.writeFile('./temp/screenshot.png', screenshotBuffer);
	await page.mouse.click(300,300); // Get focus in the game
	await page.keyboard.press('Space'); // Start new game
	await page.keyboard.press('Space'); // Select King
	await sleep(2000);
	screenshotBuffer = await page.screenshot();
}

main();