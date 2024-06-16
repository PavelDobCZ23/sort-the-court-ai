const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

const readline = require('readline');
const fs = require('fs');
const crypto = require("crypto");

const { CharacterBot, GeminiBot } = require('./bots.js');

const BOTS = {
	gemini: GeminiBot,
	character: CharacterBot
}

const CUSTOM_CHROME_PATH = process.env.CHROME_EXEC_PATH;
const TEMP_PATH = "/tmp/sort-the-court-ai"

const SORT_THE_COURT_URL = "https://graebor.itch.io/sort-the-court";
const AREA = {
	DECISION_DIALOG: 	{ left: 691 *2, top: 102*2, width: 409*2, height: 89 *2 },
	DECISION_NAME: 		{ left: 692 *2, top: 63 *2, width: 338*2, height: 40 *2 },
	DECISION_CONTROLS: 	{ left: 1023*2, top: 196*2, width: 65 *2, height: 20 *2 },
	STATS_POPULATION: 	{ left: 235 *2, top: 438*2, width: 88 *2, height: 38 *2 },
	STATS_HAPPINESS: 	{ left: 235 *2, top: 473*2, width: 88 *2, height: 38 *2 },
	STATS_MONEY: 		{ left: 235 *2, top: 509*2, width: 88 *2, height: 38 *2 },
	END_DAY_TITLE:		{ left: 477 *2, top: 96 *2, width: 331*2, height: 48 *2 },
	END_DAY_RESULT:		{ left: 478 *2, top: 388*2, width: 332*2, height: 80 *2 },
	EVENT_INFO :		{ left: 427 *2, top: 335*2, width: 434*2, height: 117*2 },
	EVENT_CONTROLS:		{ left: 584 *2, top: 466*2, width: 56 *2, height: 18 *2 },
}
const VALID_CONTROLS = ['Y/N','SPACE'];

const APPEARENCE = JSON.parse(fs.readFileSync(`./config/appearence.json`).toString());

const STATS_LOG_FILE = "./log/stats.json";
const RUN_ID = new Date().toISOString();
const RUN_LOG_DIR = `./log/runs/${RUN_ID}`

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
	//## Create dirs
	if (!(fs.existsSync(TEMP_PATH))) {
		await fs.promises.mkdir(TEMP_PATH);
	}
	if (!(fs.existsSync(RUN_LOG_DIR))) {
		await fs.promises.mkdir(RUN_LOG_DIR);
	}
	//## Init OCR
	const ocrWorker = await Tesseract.createWorker('Chewy');

	const roleSelection = (await readInput(`What role do you wanna start? (communist/capitalist)\n`)).toLowerCase();
	const aiSelection = (await readInput(`What AI do you wanna use? (character/gemini)\n`)).toLowerCase();
	const fullGameSelection = (await readInput(`Do you want the AI to recieve events and responses? (Y/n)\n`)).toLowerCase() !== "n";
	const headlessBrowser = (await readInput(`Do you want the browser to be headless? (y/N)\n`)).toLowerCase() === "y";

	//INFO There's no scrollbar in headless screenshots, shifting the output by 14px
	if (headlessBrowser) {
		for (const areaId in AREA) {
			AREA[areaId].left += 14;
		}
	}

	const runLog = {
		id: RUN_ID,
		ai: aiSelection,
		role: roleSelection,
		fullGame: fullGameSelection,
		days: []
	};
	await fs.promises.writeFile(`${RUN_LOG_DIR}/run.json`,JSON.stringify(runLog,null,2));

	const statsLog = JSON.parse((await fs.promises.readFile(STATS_LOG_FILE)).toString());

	console.log(`Starting AI Chatbot(${roleSelection}): ${aiSelection}.`);
	const bot = BOTS[aiSelection];
	const chatBot = new bot(roleSelection,fullGameSelection);
	await chatBot.start();
	console.log(`Starting the browser.`);
	//## Prepare the browser
	const browser = await puppeteer.launch({ executablePath: CUSTOM_CHROME_PATH ,headless: headlessBrowser, args: ['--window-size=1400,750']});
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
		lastPerson: "",
		population: 100,
		happiness: 100,
		money: 200,
		events: [
			[]
		]
	}
	while (true) {
		const previousStats = Object.assign({},gameStats);
		const court = await readCourtQuestion(page,ocrWorker,gameStats);
		console.log(JSON.stringify(court));
		if (APPEARENCE[court.person] != null) {
			court.person = `${court.person}(${APPEARENCE[court.person]})`;
		}
		if (court.endDay) {
			const endDayResult = await processEndDay(page,ocrWorker,gameStats);
			const prompt = `EVENT - Day ${gameStats.day-1} complete! ${endDayResult} STATS: ${getStatsString(gameStats,previousStats)}`;
			
			console.log(`Game: ${prompt}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`Game: ${prompt}\n`);

			gameStats.lastPerson = "";

			gameStats.events.push([]);
			runLog.days.push({
				population: gameStats.population,
				happiness: gameStats.happiness,
				money: gameStats.money,
				events: gameStats.events[gameStats.day-2]
			})
			await fs.promises.writeFile(`${RUN_LOG_DIR}/run.json`,JSON.stringify(runLog,null,2));

			await sleep(1500);
			if (!fullGameSelection) continue;
			const response = await chatBot.decide(prompt);
			console.log(`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}\n`);
			await sleep(500);
			continue;
		}
		if (court.event) {
			console.log('EVENT!!');
			const eventInfo = await processEvent(page,ocrWorker,gameStats);
			await page.keyboard.press("Space");
			
			const prompt = `EVENT: ${eventInfo} STATS: ${getStatsString(gameStats,previousStats)}`;
			console.log(`Game: ${prompt}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`Game: ${prompt}\n`);
			gameStats.lastPerson = "";

			gameStats.events[gameStats.day-1].push(eventInfo);

			await sleep(1500);
			if (!fullGameSelection) continue;
			const response = await chatBot.decide(prompt);
			console.log(`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}\n`);
			await sleep(500);
			continue;
		}
		if (!court.question) {
			const prompt = (
				gameStats.lastPerson != court.person
				? `EVENT: ${court.person} - ${court.dialog} STATS: ${getStatsString(gameStats,previousStats)}`
				: `RESPONSE: ${court.person} - ${court.dialog} STATS: ${getStatsString(gameStats,previousStats)}`
			);
			console.log(`Game: ${prompt}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`Game: ${prompt}\n`);
			gameStats.lastPerson = court.person;

			if (!fullGameSelection) continue;
			const response = await chatBot.decide(prompt);
			console.log(`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}\n`);
			await sleep(1500);
		}
		if (court.question) {
			const prompt = `QUEST: ${court.person} - ${court.dialog}`;
			console.log(`Game: ${prompt}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`Game: ${prompt}\n`);
			gameStats.lastPerson = court.person;

			const response = await chatBot.decide(prompt);
			console.log(`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}`);
			await fs.promises.appendFile(`${RUN_LOG_DIR}/game.log`,`AI(${roleSelection}-${aiSelection}): ${response.full.replace(/\n/g, ' ')}\n`);
			statsLog[`responses-${aiSelection}`][court.person] ??= {};
			statsLog[`responses-${aiSelection}`][court.person][court.dialog] ??= {};
			statsLog[`responses-${aiSelection}`][court.person][court.dialog][roleSelection] ??= {};
			statsLog[`responses-${aiSelection}`][court.person][court.dialog][roleSelection][response.key] ??= 0;
			statsLog[`responses-${aiSelection}`][court.person][court.dialog][roleSelection][response.key]++;

			await fs.promises.writeFile(STATS_LOG_FILE,JSON.stringify(statsLog,null,2));

			await page.keyboard.press(response.key);
			await sleep(1500);
		}
	}
}
function getDiffString(before,after) {
	const diff = after - before;
	if (diff > 0) {
		return `+${diff}`;
	} else {
		return `${diff}`;
	}
}

function getStatsString(gameStats,previousStats) {
	const diff = {
		population: getDiffString(previousStats.population,gameStats.population),
		happiness: getDiffString(previousStats.happiness,gameStats.happiness),
		money: getDiffString(previousStats.money,gameStats.money),
	}
	return (
		`Population: ${gameStats.population}(${diff.population}) ` +
		`Happiness: ${gameStats.happiness}(${diff.happiness}) ` +
		`Money: ${gameStats.money}(${diff.money})`
	);
}

async function textFromImage(imageBuffer,area,ocrWorker) {
	const ocrResult = await ocrWorker.recognize(imageBuffer,{rectangle: area});
	return ocrResult.data.text.replace(/\n/g,' ').trim();
}

function ensureNumber(numberText) {
	return parseInt(
		numberText
		.replace(/o/ig,'0')
		.replace(/[i|l]/ig,'1')
		.replace(/z/ig,'2')
		.replace(/A/g,'4')
		.replace(/s/ig,'5')
		.replace(/G/g,'6')
		.replace(/B/g,'8')
		.replace(/\—/g,'-') //Replaces dash with minus, big problem!
		.replace(/[^-\d]/g,'')
	);
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
		
	await sharp(optimisedBuffer)
	.toFile(`./temp/screenshot-${RUN_ID}.png`);

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
		event: false,
		question: true,
		dialog: "",
		person: ""
	}
	let questionStarted = false;
	while (!finished) {
		await sleep(1200);
		//Screenshots and OCRs everything
		const screenshotBuffer = await getOptimisedScreenshot(page);

		const person = await textFromImage(screenshotBuffer,AREA.DECISION_NAME,ocrWorker);
		const dialog = await textFromImage(screenshotBuffer,AREA.DECISION_DIALOG,ocrWorker);
		const endDayTitle = await textFromImage(screenshotBuffer,AREA.END_DAY_TITLE,ocrWorker);
		let controls = await textFromImage(screenshotBuffer,AREA.DECISION_CONTROLS,ocrWorker);
		let eventControls = await textFromImage(screenshotBuffer,AREA.EVENT_CONTROLS,ocrWorker);
		const statsPopulation = await textFromImage(screenshotBuffer,AREA.STATS_POPULATION,ocrWorker);
		const statsHappiness = await textFromImage(screenshotBuffer,AREA.STATS_HAPPINESS,ocrWorker);
		const statsMoney = await textFromImage(screenshotBuffer,AREA.STATS_MONEY,ocrWorker);

		await sharp(screenshotBuffer)
			.extract(AREA.EVENT_CONTROLS)
			.toFile('./temp/event-controls.png');
		await sharp(screenshotBuffer)
			.extract(AREA.DECISION_CONTROLS)
			.toFile('./temp/controls.png');
		await sharp(screenshotBuffer)
			.extract(AREA.STATS_POPULATION)
			.toFile('./temp/population.png');
		await sharp(screenshotBuffer)
			.extract(AREA.STATS_HAPPINESS)
			.toFile('./temp/happy.png');
		await sharp(screenshotBuffer)
			.extract(AREA.STATS_MONEY)
			.toFile('./temp/money.png');

		console.log(`POP: '${statsPopulation}' HAP: '${statsHappiness}' MON: '${statsMoney}' EC: '${eventControls}'`);
		//Process Stats
		gameStats.population = ensureNumber(statsPopulation);
		gameStats.happiness = ensureNumber(statsHappiness);
		gameStats.money = ensureNumber(statsMoney);
		//INFO Controls use some hand-made font that's hard to recoginze, this fixes that
		controls = controls.replace('X','Y').replace('€','E');
		eventControls = eventControls.replace('X','Y').replace('€','E').replace(/CC/,'CE');

		if (questionStarted && person != response.person) {
			response.question = false;
			finished = true;
			continue;
		}
		
		if (VALID_CONTROLS.includes(controls)) {
			if (controls == "SPACE") {
				await page.keyboard.press("Space");
			}
			if (controls == "Y/N") {
				finished = true;
			}
			response.dialog = `${response.dialog} ${dialog}`;
			response.person = person;
			questionStarted = true;
			continue;
		}

		if (VALID_CONTROLS.includes(eventControls)) {
			console.log("Event controls valid, returning as event!");
			response.event = true;
			continue;
		}

		if (endDayTitle.match(/Day\s*.*\s*complete\!/g) != null) {
			response.endDay = true;
			finished = true;
			continue;
		}
	}
	response.dialog = response.dialog.trim();
	return response;
}

async function processEndDay(page,ocrWorker,gameStats) {
	await sleep(5000);
	const screenshotBuffer = await getOptimisedScreenshot(page);
	await sharp(screenshotBuffer).toFile(`./log/runs/${RUN_ID}/stats-day-${gameStats.day}.png`);

	const endDayResult = await textFromImage(screenshotBuffer,AREA.END_DAY_RESULT,ocrWorker);
	const statsPopulation = await textFromImage(screenshotBuffer,AREA.STATS_POPULATION,ocrWorker);
	const statsHappiness = await textFromImage(screenshotBuffer,AREA.STATS_HAPPINESS,ocrWorker);
	const statsMoney = await textFromImage(screenshotBuffer,AREA.STATS_MONEY,ocrWorker);

	await sharp(screenshotBuffer)
	.extract(AREA.END_DAY_RESULT)
	.toFile('./temp/endday-result.png');

	gameStats.population = ensureNumber(statsPopulation);
	gameStats.happiness = ensureNumber(statsHappiness);
	gameStats.money = ensureNumber(statsMoney);

	await page.keyboard.press('Space');
	gameStats.day++;
	gameStats.lastPerson = "";
	await sleep(3000);
	return endDayResult;
}

async function processEvent(page,ocrWorker,gameStats) {
	await sleep(1500);
	const screenshotBuffer = await getOptimisedScreenshot(page);

	const statsPopulation = await textFromImage(screenshotBuffer,AREA.STATS_POPULATION,ocrWorker);
	const statsHappiness = await textFromImage(screenshotBuffer,AREA.STATS_HAPPINESS,ocrWorker);
	const statsMoney = await textFromImage(screenshotBuffer,AREA.STATS_MONEY,ocrWorker);
	const eventInfo = await textFromImage(screenshotBuffer,AREA.EVENT_INFO,ocrWorker);

	gameStats.population = ensureNumber(statsPopulation);
	gameStats.happiness = ensureNumber(statsHappiness);
	gameStats.money = ensureNumber(statsMoney);

	return eventInfo;
}

main();