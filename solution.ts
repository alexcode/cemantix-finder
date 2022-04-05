import puppeteer from "https://deno.land/x/puppeteer@9.0.2/mod.ts";

const browser = await puppeteer.launch();
const dico = await browser.newPage();
const game = await browser.newPage();
await game.goto('https://cemantix.herokuapp.com/');
const dicoCache = new Set();
const gameResult = new Map();
let iter = 0;
let victory = false;
const initialWord = Deno.args[0];

if (!initialWord) {
    throw new Error("You must set an initial word");

}
interface GameResult { num: Int16Array, score: Float32Array, solvers: Int16Array, word: string };

const findList = async (word: string): Promise<string[]> => {
    console.info(`Trying word ${word}`);
    dicoCache.add(word);
    await dico.goto(`https://www.dicolink.com/mots/${encodeURI(word)}`);
    await dico.waitForSelector('.related-group-content');
    const list = await dico.$$eval('.related-group-content > .list > li', list => list.map((el) => (el as HTMLElement).innerText))
    return list as unknown as string[];
};

const submitList = async (list: string[]): Promise<GameResult[]> => {
    return await game.evaluate((list) => {
        const getScore = async (word: string) => {
            const r = await fetch("/score", {
                method: 'POST',
                body: `word=${word}`,
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            });
            const data = await r.json()
            return { ...data, word };
        }

        return Promise.all(
            list.map(getScore))
            .then(d => d
                .filter(score => score.hasOwnProperty('score'))
                .sort((a, b) => b.score - a.score)
            )
    }, list);
};

const guessWord = async (word: string) => {
    const list = await findList(word);
    const res = await submitList(list)
    res.forEach(res => {
        gameResult.set(res.score, res);
    });

    if (gameResult.has(1)) {
        victory = true;
    }
}

const getSortedScores = () => Array.from(gameResult.keys()).sort((a, b) => b - a);

const getHighScores = () => {
    const getEmoji = (percentile: number) => {
        if (percentile === 1000) {
            return '🥳';
        }
        if (percentile === 999) {
            return '😱';
        }
        if (percentile >= 990) {
            return '🔥';
        }
        if (percentile >= 900) {
            return '🥵';
        }
        if (percentile >= 1) {
            return '😎';
        }
        return '🥶';

    };

    getSortedScores().slice(0, 10).map(idx => gameResult.get(idx))
        .forEach(({ score, word, percentile }) => {
            let text = `${getEmoji(percentile)} Word: ${word} Score: ${score}`
            if (percentile) {
                text = `${text} ${percentile}‰`
            }
            console.log(text);
        });
};

const findWord = () => {
    const idx = getSortedScores().find((idx) => !dicoCache.has(gameResult.get(idx).word));

    return gameResult.get(idx).word;
}

while (!victory && iter < 10) {
    try {
        const word = iter === 0 ? initialWord : findWord();
        await guessWord(word);
    } catch (error) {
        console.error(error);
    } finally {
        getHighScores();
    }
    iter++
}

if (victory) {
    console.warn(`🥳 Happy days, the word is ${gameResult.get(1).word}`)
} else {
    console.warn(`💩 Loooo000ooooser 💩, the best word is ${gameResult.get(1).word}`)
}



await browser.close();