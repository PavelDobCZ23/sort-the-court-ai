const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

const readline = require('readline');
const fs = require('fs');
const crypto = require("crypto");

const { CharacterBot, GeminiBot } = require('./bots.js');
const { finished } = require('stream');

const BOTS = {
	gemini: GeminiBot,
	character: CharacterBot
}

const CUSTOM_CHROME_PATH = process.env.CHROME_EXEC_PATH;
const TEMP_PATH = "/tmp/sort-the-court-ai"

const SORT_THE_COURT_URL = "https://graebor.itch.io/sort-the-court";
const DECISION_DIALOG_AREA = 	{ left: 691 *2, top: 102*2, width: 409*2, height: 89 *2 };
const DECISION_NAME_AREA = 		{ left: 692 *2, top: 63 *2, width: 338*2, height: 40 *2 };
const DECISION_CONTROLS_AREA = 	{ left: 1023*2, top: 196*2, width: 65 *2, height: 20 *2 };
const STATS_POPULATION_AREA = 	{ left: 235 *2, top: 438*2, width: 88 *2, height: 38 *2 };
const STATS_HAPPINESS_AREA = 	{ left: 235 *2, top: 473*2, width: 88 *2, height: 38 *2 };
const STATS_MONEY_AREA = 		{ left: 235 *2, top: 509*2, width: 88 *2, height: 38 *2 };
const END_DAY_TITLE_AREA =		{ left: 477 *2, top: 96 *2, width: 331*2, height: 48 *2 };
const EVENT_INFO_AREA = 		{ left: 427 *2, top: 335*2, width: 434*2, height: 117*2 };
const EVENT_CONTROLS_AREA =     { left: 582 *2, top: 466*2, width: 59 *2, height: 18 *2 };
const VALID_CONTROLS = ['Y/N','SPACE'];

const STATS_LOG_FILE = "./log/stats.json";
const RUN_ID = crypto.randomUUID();

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readInput(prompt) {
	return new Promise(
		(resolve) => {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});
			rl.question(prompt, answer => {
				resolve(answer);
				rl.close();
			});
		}
	)
}

async function main() {
	//## Create temp dir
	if (!(fs.existsSync(TEMP_PATH))) {
		await fs.promises.mkdir(TEMP_PATH);
	}
	//## Init OCR
	const ocrWorker = await Tesseract.createWorker('Chewy');

	const roleSelection = (await readInput(`What role do you wanna start? (communist/capitalist)\n`)).toLowerCase();
	const aiSelection = (await readInput(`What AI do you wanna use? (character/gemini)\n`)).toLowerCase();
	const sendEventsResponses = (await readInput(`Do you want the AI to recieve events and responses? (y/n)\n`)).toLowerCase();

	console.log(`Starting AI Chatbot(${roleSelection}): ${aiSelection}.`);
	const bot = BOTS[aiSelection];
	let chatBot = new bot(roleSelection)
	await chatBot.start();
	console.log(`Starting the browser.`);
	//## Prepare the browser
	const browser = await puppeteer.launch({ executablePath: CUSTOM_CHROME_PATH ,headless: false, args: ['--window-size=1400,750']});
	//## Prepare the page
	console.log(`Starting the game.`);
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
	//## Start the game
	await sleep(12000); // Wait for game to load
	await page.mouse.click(300,300); // Get focus in the game
	await page.keyboard.press('Space'); // Start new game
	await page.keyboard.press('Space'); // Select King
	await sleep(7500); // Wait for game to start
	//## Start the gameplay loop
	console.log(`The game has begun!`);
	const gameStats = {
		day: 1,
		population: 100,
		happiness: 100,
		money: 200,
	}
	while (true) {
		const decision = await readCourtQuestion(page,ocrWorker,gameStats);
		if (decision.endDay) {
			gameStats.day++;
			continue;
		}
		const prompt = `${decision.personName} - ${decision.question}`;
		console.log(`Game: ${prompt}`);
		const response = await chatBot.decide(prompt);
		console.log(`AI(${roleSelection}): ${response}`);
		await page.keyboard.press(response);
		//const answer = (await readInput(`What's your answer? (y/n)\n`)).toLowerCase();
		//if (answer.startsWith('y')) {
		//	page.keyboard.press('y');
		//} else if (answer.startsWith('n')) {
		//	page.keyboard.press('n');
		//}
		await sleep(4000);
	}


	return;
}


async function textFromImage(imageBuffer,area,ocrWorker) {
	const ocrResult = await ocrWorker.recognize(imageBuffer,{rectangle: area});
	return ocrResult.data.text.trim();
}

async function getOptimisedScreenshot(page) {
	const screenshotBuffer = await page.screenshot();
	const metadata = await sharp(screenshotBuffer).metadata()
	const optimisedBuffer = await sharp(screenshotBuffer)
	.resize(
		metadata.width*2, metadata.height*2, {
			fit: 'inside',
			kernel: sharp.kernel.cubic
		}
	)
	.greyscale(true)
	.linear(2,-128)
	.toBuffer();

	return optimisedBuffer;
}
/**
 * @param {puppeteer.Page} page 
 * @param {Tesseract.Worker} ocrWorker 
 * @returns {object}
 */
async function readCourtQuestion(page,ocrWorker,gameStats) {
	let finished = false;
	const response = {
		endDay: false,
		question: true,
		dialog: "",
		person: ""
	}
	let endDay = false;
	let dialog = "";
	let previousPerson = "";
	while (!finished) {
		//Screenshots and OCRs everything
		const screenshotBuffer = await getOptimisedScreenshot(page);

		const person = await textFromImage(screenshotBuffer,DECISION_NAME_AREA,ocrWorker);
		const dialog = await textFromImage(screenshotBuffer,DECISION_DIALOG_AREA,ocrWorker);
		const endDayTitle = await textFromImage(screenshotBuffer,END_DAY_TITLE_AREA,ocrWorker);
		let controls = await textFromImage(screenshotBuffer,DECISION_CONTROLS_AREA,ocrWorker);
		let eventControls = await textFromImage(screenshotBuffer,EVENT_CONTROLS_AREA,ocrWorker);
		//INFO Controls use some hand-made font that's hard to recoginze, this fixes that
		controls = controls.replace('X','Y').replace('€','E');
		eventControls = eventControls.replace('X','Y').replace('€','E');

		console.log(`CONTROLS: '${controls}' EV CONTROLS: '${eventControls}' PERSON: '${person} END DAY: '${endDayTitle}'`);
		//Switching people without Y/N Input - should only apply when controls are valid! CHANGE!
		if (previousPerson != person) {
			question = false;
			finished = true;
			continue;
		}
		
		console.log(`Current controls '${controls}'.`);
		if (controls.includes('SPACE')) {
			dialog = `${dialog} ${dialog}`;
			await page.keyboard.press('Space');
			await sleep(4000);
		} else if (controls.includes('Y/N')) {
			finished = true;
			dialog = `${dialog} ${dialog}`;
		} else {
			if (eventControls.includes('SPACE')) {
				await page.keyboard.press('Space');
			} else if (endDayTitle.match(/Day\s*.*\s*complete\!/g) != null) {
				endDay = true;
				dialog = "";
				person = "";
				await sleep(3000);
				await sharp(await page.screenshot()).toFile(`./temp/stats-day-${gameStats.day}.png`);
				console.log(`Day ${gameStats.day} complete!`);
				console.log(
					`Population: ${(await ocrWorker.recognize(screenshotBuffer,{rectangle:STATS_POPULATION_AREA})).data.text}\n` +
					`Happiness: ${(await ocrWorker.recognize(screenshotBuffer,{rectangle:STATS_HAPPINESS_AREA})).data.text}\n` +
					`Money: ${(await ocrWorker.recognize(screenshotBuffer,{rectangle:STATS_MONEY_AREA})).data.text}\n`
				);
				await page.keyboard.press('Space');
				await sleep(2000);
			}
			await sleep(3000);
		}
	}
	return {
		endDay,
		question: dialog.replace('\n', ' '), //Replaces inner newlines with spaces for a single line text
		personName: person
	};
}

async function readCourtResponse(page,ocrWorker,gameStats) {
	let finished = false;
	let dialog = "";
	while (!finished) {
		//Screenshots and OCRs everything
		const screenshotBuffer = await getOptimisedScreenshot(page);

		const dialog = await textFromImage(screenshotBuffer,DECISION_DIALOG_AREA,ocrWorker);
		const personName = await textFromImage(screenshotBuffer,DECISION_NAME_AREA,ocrWorker);
		let controls = await textFromImage(screenshotBuffer,DECISION_CONTROLS_AREA,ocrWorker);
		let eventControls = await textFromImage(screenshotBuffer,EVENT_CONTROLS_AREA,ocrWorker);
		let eventInfo = await textFromImage(screenshotBuffer,EVENT_INFO_AREA,ocrWorker);
		let endDayTitle = await textFromImage(screenshotBuffer,END_DAY_TITLE_AREA,ocrWorker);
		let statsPopulation = await textFromImage(screenshotBuffer,STATS_POPULATION_AREA,ocrWorker);
		let statsHappiness = await textFromImage(screenshotBuffer,STATS_HAPPINESS_AREA,ocrWorker);
		let statsMoney = await textFromImage(screenshotBuffer,STATS_MONEY_AREA,ocrWorker);

		//Process Stats
		statsPopulation = parseInt(statsPopulation.replace(/[^-\d]/g,''));
		statsHappiness = parseInt(statsHappiness.replace(/[^-\d]/g,''));
		statsMoney = parseInt(statsMoney.replace(/[^-\d]/g,''));
		const diffPopulation = statsPopulation - gameStats.population;
		const diffHappiness = statsHappiness - gameStats.happiness;
		const diffMoney = statsMoney - gameStats.money;

		

	}
}

main();