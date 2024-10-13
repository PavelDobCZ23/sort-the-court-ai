const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('node:fs');

const Constants = require('./constants.js');

class CharacterBot {
	constructor(character) {
		this.#character = character;

		if (Constants.CHARACTER_AI_IDS[this.#character] != null) {
			this.#charId = Constants.CHARACTER_AI_IDS[this.#character];
		} else {
			this.#charId = this.#character;
		}
	}
	async start() {
		this.#client = new (await import("cainode")).CAINode();
		await this.#client.login(process.env.CHARAI_TOKEN);
		await this.#client.character.connect(this.#charId);
		await this.#client.character.create_new_conversation(true);

		const gamePrompt = (
			await fs.promises.readFile(Constants.GAME_GENERIC_LITE_PROMPT_FILE)
		).toString();
		const response = await this.#client.character.send_message(gamePrompt,false);
		const responseMessage = response.turn.candidates.filter(
			cand => cand.candidate_id === response.turn.primary_candidate_id
		)[0].raw_content; //it is a complicated system...
		return responseMessage;
	}
	async decide(prompt) {
		const decision = {
			key: "",
			full: ""
		}
		const response = await this.#client.character.send_message(prompt,false);
		decision.full = response.turn.candidates.filter(
			cand => cand.candidate_id === response.turn.primary_candidate_id
		)[0].raw_content; //...get the message from 1st item in array that matches primary id
		if (decision.full.match(/\byes\b/i) != null) decision.key = "y";
		if (decision.full.match(/\bno\b/i) != null) decision.key = "n";
		return decision;
	}
	#character;
	#charId;
	#client;
}

class GeminiBot {
	constructor(personality,fullGame) {
		this.#fullGame = fullGame;
		this.#personality = personality;
		this.#client = new GoogleGenerativeAI(process.env.GEMINI_API_TOKEN);
	}
	async start() {
		const rolePrompt = (await fs.promises.readFile(
			Constants.GAME_GENERIC_BASE_PROMPT_FILE
		)).toString().replace("{PERSONALITY}",this.#personality);

		this.#model = this.#client.getGenerativeModel({
			model: 'gemini-1.5-pro-002',
			systemInstruction: rolePrompt
		});
		const gameFile = this.#fullGame ? Constants.GAME_GENERIC_FULL_PROMPT_FILE : Constants.GAME_GENERIC_LITE_PROMPT_FILE;
		const gamePrompt = (await fs.promises.readFile(gameFile)).toString().replace("{PERSONALITY}",this.#personality);
		const generationConfig = {
			temperature: 1.4,
			topP: 0.95,
			topK: 40,
			maxOutputTokens: 1024,
			responseMimeType: 'text/plain'
		};

		const history = [
			{
				role: 'user',
				parts: [
					{
						text: gamePrompt
					}
				]
			}
		];

		this.#chat = this.#model.startChat({
			generationConfig,
			history
		});
	}
	async decide(prompt) {
		const decision = {
			key: "",
			full: ""
		}
		const result = await this.#chat.sendMessage(
			prompt
		);
		decision.full = result.response.text();
		if (decision.full.match(/\byes\b/i) != null) decision.key = "y";
		if (decision.full.match(/\bno\b/i) != null) decision.key = "n";
		return decision;
	}
	#fullGame
	#client;
	#personality;
	#model;
	#chat;
}

module.exports = { CharacterBot, GeminiBot }