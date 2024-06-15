const CharacterAI = require('node_characterai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('node:fs');

const Constants = require('./constants.js');


class CharacterBot {
	constructor(role) {
		if (['communist', 'capitalist'].includes(role)) {
			this.#role = role;
		} else {
			throw new Error('Invalid role!');
		}
		this.#client = new CharacterAI();
	}
	async start() {
		this.#client.authenticateWithToken(process.env.CHARAI_TOKEN);
		this.#chat = await this.#client.createOrContinueChat(
			Constants.CHARACTER_AI_IDS[this.#role]
		);
		const gamePrompt = (
			await fs.promises.readFile(Constants.GAME_PROMPT_FILE[this.#role])
		).toString();
		return await this.#chat.sendAndAwaitResponse(gamePrompt, true);
	}
	async decide(prompt) {
		const response = await this.#chat.sendAndAwaitResponse(prompt, true);
		if (response.match(/\byes\b/gi) != null) return 'y';
		if (response.match(/\bno\b/gi) != null) return 'n';
		return '';
	}
	#role;
	#client;
	#chat;
}

class GeminiBot {
	constructor(role) {
		if (['communist', 'capitalist'].includes(role)) {
			this.#role = role;
		} else {
			throw new Error('Invalid role!');
		}
		this.#client = new GoogleGenerativeAI(process.env.GEMINI_TOKEN);
	}
	async start() {
		const rolePrompt = (await fs.promises.readFile(
			Constants.ROLE_PROMPT_FILE[this.#role]
		)).toString();
		this.#model = this.#client.getGenerativeModel({
			model: 'gemini-1.5-flash',
			systemInstruction: rolePrompt
		});

		const generationConfig = {
			temperature: 0.8,
			topP: 0.95,
			topK: 64,
			maxOutputTokens: 8192,
			responseMimeType: 'text/plain'
		};

		const history = [
			{
				role: 'user',
				parts: [
					{
						text: (await fs.promises.readFile(
							Constants.GAME_PROMPT_FILE[this.#role]
						)).toString()
					}
				]
			},
			{
				role: 'model',
				parts: [
					{
						text: (await fs.promises.readFile(
							Constants.GAME_RESPONSE_FILE[this.#role]
						)).toString()
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
		const result = await this.#chat.sendMessage(
			prompt
		);
		const response = result.response.text();
		console.log(`GEMINI RESPONSE: ${response}`);
		if (response.match(/\byes\b/gi) != null) return 'y';
		if (response.match(/\bno\b/gi) != null) return 'n';
		return '';
	}
	#client;
	#role;
	#model;
	#chat;
}

module.exports = { CharacterBot, GeminiBot }