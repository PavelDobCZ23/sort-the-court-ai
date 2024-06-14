const CharacterAI = require("node_characterai");
const characterAI = new CharacterAI();

const path = require('path');
const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');

const CUSTOM_CHROME_PATH = process.env.CHROME_EXEC_PATH;
const TEMP_PATH = "/tmp/sort-the-court-ai"

const INIT_PROMPT_CAPITALIST_FILE = "./config/init-prompt-capitalist.txt";
const INIT_PROMPT_COMMUNIST_FILE = "./config/init-prompt-communist.txt";

const SORT_THE_COURT_URL = "https://graebor.itch.io/sort-the-court";
const DECISION_QUEST_AREA = { left: 691*2, top: 102*2, width: 409*2, height: 89*2 };
const DECISION_NAME_AREA = { left: 692*2, top: 63*2, width: 338*2, height: 40*2 };
const DECISION_CONTROLS_AREA = { left: 1023*2, top: 196*2, width: 65*2, height: 20*2 };

const SOCIALIST_TEST_ID = "79uuEVuQrD4v6Dfcgi-HWs9MmdmFazreiqIOv4hRGIo";
const CAPITALIST_ID = "JYqDNofa-EYsZAy2ct0G6U-R9JT_fqJMr-NORzlUPtA";
const COMMUNIST_ID = "LSFVRsYtcUdT3buD0Vk7HZGeqwkpOijMbwuw3PJpCE8";

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	// Create temp dir
	if (!(await fs.promises.readdir(TEMP_PATH))) {
		await fs.promises.mkdir(TEMP_PATH);
	}
	// Init OCR
	const ocrWorker = await Tesseract.createWorker('eng');
	// Authenticating as a guest (use `.authenticateWithToken()` to use an account)
	//await characterAI.authenticateWithToken(process.env.CHARAI_TOKEN);

	// Place your character's id here
	const characterId = SOCIALIST_TEST_ID;

	// Create a chat object to interact with the conversation
	//const chat = await characterAI.createOrContinueChat(characterId);

	const initPrompt = (await fs.promises.readFile(INIT_PROMPT_COMMUNIST_FILE)).toString();
	console.log(initPrompt);
	// Send a message
	//const response = await chat.sendAndAwaitResponse("Hello, can you introduce yourself?", true);

	//console.log(response);
	// Use `response.text` to use it as a string

	const browser = await puppeteer.launch({ executablePath: CUSTOM_CHROME_PATH ,headless: false, args: ['--window-size=1400,750']});
	const page = await browser.newPage();
	page.on('dialog', async dialog => {
        console.log(`Got an alert message: ${dialog.message()}`);
        await dialog.accept();
    });
	await page.goto(SORT_THE_COURT_URL);
	await page.setViewport({
		width: 1300,
		height: 550
	});
	
	await sleep(12000);
	console.log("Taking Screenshot");
	let screenshotBuffer = await page.screenshot();
    await fs.promises.writeFile('./temp/screenshot.png', screenshotBuffer);
	await page.mouse.click(300,300); // Get focus in the game
	await page.keyboard.press('Space'); // Start new game
	await page.keyboard.press('Space'); // Select King
	await sleep(7500);
	screenshotBuffer = await page.screenshot();
	let metadata = await sharp(screenshotBuffer).metadata()
	let newBuffer = await sharp(screenshotBuffer)
		.resize(
			metadata.width*2, metadata.height*2, {
				fit: 'inside',
				kernel: sharp.kernel.cubic
			}
		)
		.greyscale(true)
		.linear(2,-128)
		.toBuffer();

	await fs.promises.writeFile('./temp/screenshot.png', newBuffer);
	let questionBuffer = await sharp(newBuffer).extract(DECISION_QUEST_AREA).toBuffer();
	let personNameBuffer = await sharp(newBuffer).extract(DECISION_NAME_AREA).toBuffer();
	let controlsBuffer = await sharp(newBuffer).extract(DECISION_CONTROLS_AREA).toBuffer();
	await fs.promises.writeFile('./temp/question.png', questionBuffer);
	await fs.promises.writeFile('./temp/name.png', personNameBuffer);
	await fs.promises.writeFile('./temp/controls.png', controlsBuffer);
	let questionOcr = await ocrWorker.recognize(newBuffer,{rectangle:DECISION_QUEST_AREA});
	let personNameOcr = await ocrWorker.recognize(newBuffer,{rectangle:DECISION_NAME_AREA});
	let controlsOcr = await ocrWorker.recognize(newBuffer,{rectangle:DECISION_CONTROLS_AREA});
	let characterPrompt = `${personNameOcr.data.text} - ${questionOcr.data.text}`.replace('\n','');
	let controls = controlsOcr.data.text;
	console.log(`Court Question [${controls}]:`);
	console.log(`${characterPrompt}`);
	await page.keyboard.press('y');
	await sleep(4000);
	screenshotBuffer = await page.screenshot();
	metadata = await sharp(screenshotBuffer).metadata()
	newBuffer = await sharp(screenshotBuffer)
		.resize(
			metadata.width*2, metadata.height*2, {
				fit: 'inside',
				kernel: sharp.kernel.cubic
			}
		)
		.greyscale(true)
		.linear(2,-128)
		.toBuffer();

	await fs.promises.writeFile('./temp/screenshot.png', newBuffer);
	questionBuffer = await sharp(newBuffer).extract(DECISION_QUEST_AREA).toBuffer();
	personNameBuffer = await sharp(newBuffer).extract(DECISION_NAME_AREA).toBuffer();
	controlsBuffer = await sharp(newBuffer).extract(DECISION_CONTROLS_AREA).toBuffer();
	await fs.promises.writeFile('./temp/question.png', questionBuffer);
	await fs.promises.writeFile('./temp/name.png', personNameBuffer);
	await fs.promises.writeFile('./temp/controls.png', controlsBuffer);
	questionOcr = await ocrWorker.recognize(newBuffer,{rectangle:DECISION_QUEST_AREA});
	personNameOcr = await ocrWorker.recognize(newBuffer,{rectangle:DECISION_NAME_AREA});
	controlsOcr = await ocrWorker.recognize(newBuffer,{rectangle:DECISION_CONTROLS_AREA});
	characterPrompt = `${personNameOcr.data.text} - ${questionOcr.data.text}`.replace('\n','');
	controls = controlsOcr.data.text;
	console.log(`Court Question [${controls}]:`);
	console.log(`${characterPrompt}`);

}

main();