
const GAME_GENERIC_LITE_PROMPT_FILE = "./config/generic-lite-prompt.txt";
const GAME_GENERIC_FULL_PROMPT_FILE = "./config/generic-full-prompt.txt";
const GAME_GENERIC_BASE_PROMPT_FILE = "./config/generic-base-prompt.txt";

const ROLE_PROMPT_FILE = {
    communist: "./config/role-communist-prompt.txt",
    capitalist: "./config/role-capitalist-prompt.txt"
}

const CHARACTER_AI_IDS = {
    communist: "LSFVRsYtcUdT3buD0Vk7HZGeqwkpOijMbwuw3PJpCE8",
    capitalist: "JYqDNofa-EYsZAy2ct0G6U-R9JT_fqJMr-NORzlUPtA",
    testSocialist: "79uuEVuQrD4v6Dfcgi-HWs9MmdmFazreiqIOv4hRGIo",
    spongebob: "7BuZYdyCtlW_1-9b0G50SYol0pX4iluz6irE65xEOVI",
    steve: "if4F8RpPbbzyez8M39tO6FCBmadFaDQdhzKRezAYfi0"
}

module.exports = { 
    ROLE_PROMPT_FILE,
    CHARACTER_AI_IDS,
    GAME_GENERIC_LITE_PROMPT_FILE,
    GAME_GENERIC_FULL_PROMPT_FILE,
    GAME_GENERIC_BASE_PROMPT_FILE
};