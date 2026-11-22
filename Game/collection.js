"use strict";

const campaignKey = "gwent-collection-v1";
const activeNameKey = "gwent-active-user";
const namedPrefix = campaignKey + "/user/";
const profileKey = name => name ? namedPrefix + name : campaignKey;

function profileNames() {
    return Object.keys(localStorage).filter(key => key.startsWith(namedPrefix))
        .map(key => key.slice(namedPrefix.length)).sort((a,b) => a.localeCompare(b));
}
const houses = ["realms", "nilfgaard", "monsters", "scoiatael", "skellige"];
const levels = ["Easy", "Normal", "Hard"];
const defaultAnimationMs = 250;
const defaultVolumes = {master: 100, music: 20, effects: 100};
const displayModes = {fullscreen: "Fullscreen", windowed: "Windowed", borderless: "Windowed borderless"};
const rewardWeights = {realms: 30, nilfgaard: 15, monsters: 15, scoiatael: 15, skellige: 10, neutral: 15};
const playerPortraits = [
    {id:"geralt", name:"Geralt", art:"neutral_geralt", x:63, y:11},
    {id:"ciri", name:"Ciri", art:"neutral_ciri", x:55, y:9},
    {id:"yennefer", name:"Yennefer", art:"neutral_yennefer", x:57, y:27},
    {id:"triss", name:"Triss", art:"neutral_triss", x:53, y:12},
    {id:"vesemir", name:"Vesemir", art:"neutral_vesemir", x:63, y:10},
    {id:"dandelion", name:"Dandelion", art:"neutral_dandelion", x:69, y:10},
    {id:"zoltan", name:"Zoltan", art:"neutral_zoltan", x:65, y:15},
    {id:"keira", name:"Keira Metz", art:"realms_keira", x:61, y:7},
    {id:"dijkstra", name:"Dijkstra", art:"realms_dijkstra", x:68, y:8}
];
const starterCards = {
    frost: 2, fog: 2, rain: 1, clear: 1,
    ballista: 1, blue_stripes: 2, dethmold: 1, banner_nurse: 1,
    kaedwen_siege: 1, kaedwen_siege_1: 1, kaedwen_siege_2: 1, keira: 1,
    poor_infantry: 2, stennis: 1, redania: 1, redania_1: 1, sheldon: 1,
    siegfried: 1, sheala: 1, sabrina: 1, ves: 1, yarpen: 1, trebuchet: 1, trebuchet_1: 1
};
const limit = c => c.row === "leader" ? 1 : Number(c.count);
const special = c => c.deck === "special" || c.deck === "weather";
const houseOf = c => c.filename === "mardroeme" ? "skellige" : (special(c) ? "neutral" : c.deck);
const compatible = (c, faction) => c.filename === "mardroeme" ? faction === "skellige" :
    c.deck === faction || c.deck === "neutral" || special(c);
const cardIndex = file => card_dict.findIndex(c => c.filename === file);
const inRange = (n, max) => Number.isSafeInteger(n) ? Math.min(max, Math.max(0, n)) : 0;
const catalogueTotal = card_dict.reduce((sum, c) => sum + limit(c), 0);

function startingProfile() {
    const cards = {};
    for (const [file, count] of Object.entries(starterCards)) cards[cardIndex(file)] = count;
    const leader = cardIndex("foltest_copper");
    return {owned: {...cards, [leader]: 1}, decks: {realms: {leader, cards}},
        faction: "realms", difficulty: 0, opponentFaction: "random", animationMs: defaultAnimationMs,
        portrait: "geralt", displayMode: "fullscreen", volumes: {...defaultVolumes},
        wins: 0, losses: 0, draws: 0, lastReward: null, pendingReward: []};
}

function readProfile(key = campaignKey) {
    const raw = localStorage.getItem(key);
    if (!raw) return startingProfile();
    const p = JSON.parse(raw);
    if (!p || !p.owned || !p.decks) throw new Error("The profile is missing its card collection.");
    for (const [i, c] of card_dict.entries()) p.owned[i] = inRange(p.owned[i], limit(c));
    p.pendingReward = [...new Set(Array.isArray(p.pendingReward) ? p.pendingReward : [])]
        .filter(i => Number.isInteger(i) && card_dict[i] && p.owned[i] < limit(card_dict[i])).slice(0,3);
    p.faction = houses.includes(p.faction) ? p.faction : "realms";
    p.difficulty = inRange(p.difficulty, levels.length - 1);
    if (!Object.hasOwn(displayModes, p.displayMode)) p.displayMode = "fullscreen";
    p.volumes = Object.fromEntries(Object.entries(defaultVolumes).map(([key, fallback]) =>
        [key, Number.isInteger(p.volumes?.[key]) ? inRange(p.volumes[key], 100) : fallback]));
    if (!houses.includes(p.opponentFaction)) p.opponentFaction = "random";
    if (!playerPortraits.some(portrait => portrait.id === p.portrait)) p.portrait = "geralt";
    if (!Number.isInteger(p.animationMs) || p.animationMs < 100 || p.animationMs > 500 || p.animationMs % 50) {
        p.animationMs = defaultAnimationMs;
    }
    return p;
}

function exportCollection(profile, userName) {
    const cards = {};
    for (const [i,c] of card_dict.entries()) {
        if (profile.owned[i]) cards[c.deck + "/" + c.filename] = profile.owned[i];
    }
    return {format:"gwent-cards", version:1, userName, cards};
}

function mergeCollection(profile, backup) {
    if (backup?.format !== "gwent-cards" || backup.version !== 1 || !backup.cards ||
        typeof backup.cards !== "object" || Array.isArray(backup.cards)) throw Error("Unsupported collection file.");
    const ids = new Map(card_dict.map((c,i) => [c.deck + "/" + c.filename, i]));
    const owned = {...profile.owned};
    for (const [key, count] of Object.entries(backup.cards)) {
        const i = ids.get(key);
        if (i === undefined || !Number.isInteger(count) || count < 1 || count > limit(card_dict[i])) {
            throw Error("The file contains an unknown card or an invalid copy count.");
        }
        owned[i] = Math.max(owned[i] || 0, count);
    }
    return {...profile, owned};
}

function cardsFor(faction) {
    return card_dict.map((c, i) => ({c, i})).filter(({c}) => limit(c) && compatible(c, faction));
}

function factionProgress(p, faction) {
    const pool = cardsFor(faction);
    return {
        units: pool.reduce((n, {c, i}) => n + (c.row !== "leader" && !special(c) ? p.owned[i] || 0 : 0), 0),
        leaders: pool.filter(({c, i}) => c.row === "leader" && p.owned[i] > 0).map(({i}) => i)
    };
}

function deckStats(cards) {
    let units = 0, specials = 0, strength = 0;
    for (const [i, count] of Object.entries(cards)) {
        if (special(card_dict[i])) specials += count;
        else { units += count; strength += count * Number(card_dict[i].strength); }
    }
    return {units, specials, strength};
}

function buildDeck(p, faction) {
    const available = cardsFor(faction);
    const leaders = factionProgress(p, faction).leaders;
    const saved = p.decks[faction];
    const deck = {leader: leaders.includes(saved?.leader) ? saved.leader : leaders[0], cards: {}};
    for (const {c, i} of available) {
        if (c.row === "leader") continue;
        const n = inRange(saved ? saved.cards[i] : (special(c) ? 0 : p.owned[i]), p.owned[i] || 0);
        if (n) deck.cards[i] = n;
    }
    return deck;
}

function drawWeighted(items, weightOf, random) {
    let roll = random() * items.reduce((sum, item) => sum + weightOf(item), 0);
    for (const item of items) {
        roll -= weightOf(item);
        if (roll < 0) return item;
    }
    return items[items.length - 1];
}

function awardResult(p, result, random = Math.random) {
    p[result]++;
    if (result !== "wins" || p.pendingReward.length) return;
    const remaining = card_dict.map((c, i) => i).filter(i => (p.owned[i] || 0) < limit(card_dict[i]));
    const zoltan = cardIndex("zoltan");
    const offer = p.pendingReward;
    if (p.wins === 1 && remaining.includes(zoltan)) offer.push(zoltan);
    while (offer.length < Math.min(3, remaining.length)) {
        const eligible = remaining.filter(id => !offer.includes(id));
        const differentNames = eligible.filter(id => !offer.some(pick => card_dict[pick].name === card_dict[id].name));
        const pool = differentNames.length ? differentNames : eligible;
        const groups = Object.entries(rewardWeights).map(([house, weight]) => ({
            weight, cards: pool.filter(id => houseOf(card_dict[id]) === house)
        })).filter(group => group.cards.length);
        const group = drawWeighted(groups, group => group.weight, random);
        offer.push(drawWeighted(group.cards, id => {
            if (!special(card_dict[id])) return 1;
            return p.owned[id] ? 1.5 : 2;
        }, random));
    }
}

function claimReward(p, i) {
    if (!p.pendingReward.includes(i) || (p.owned[i] || 0) >= limit(card_dict[i])) return false;
    p.owned[i] = (p.owned[i] || 0) + 1;
    p.lastReward = i;
    p.pendingReward = [];
    return true;
}

function engineDeck(faction, deck) {
    return {faction, leader: card_dict[deck.leader],
        cards: Object.entries(deck.cards).filter(([, n]) => n > 0).map(([i, count]) => ({index: Number(i), count}))};
}

function opponentDeck(difficulty, wanted, random = Math.random) {
    const faction = wanted === "random" ? houses[Math.floor(random() * houses.length)] : wanted;
    const options = premade_deck.map(s => JSON.parse(s)).filter(d => d.faction === faction);
    const leaders = cardsFor(faction).filter(({c}) => c.row === "leader");
    const leader = leaders[Math.floor(random() * leaders.length)].i;
    if (difficulty === 2) {
        const d = options[Math.floor(random() * options.length)];
        return engineDeck(faction, {leader, cards: Object.fromEntries(d.cards)});
    }
    if (difficulty === 0 && faction === "realms") return engineDeck(faction, startingProfile().decks.realms);
    const pool = [];
    for (const {c, i} of cardsFor(faction)) {
        if (special(c) || c.row === "leader") continue;
        const hero = c.ability.includes("hero");
        const rating = Number(c.strength) + (hero ? 8 : 0) + (c.ability.includes("spy") ? 12 : 0);
        for (let n = 0; n < limit(c); n++) {
            pool.push({i, rank: random() * 14 + (difficulty === 0 ? -rating : rating * .55) + (c.deck === faction ? 5 : 0)});
        }
    }
    pool.sort((a, b) => b.rank - a.rank);
    const cards = {};
    for (const {i} of pool.slice(0, 22)) cards[i] = (cards[i] || 0) + 1;
    const extras = difficulty === 0 ? ["fog","frost","rain","clear"] : ["decoy","horn","scorch","clear","fog"];
    for (const file of extras) cards[cardIndex(file)] = 1;
    return engineDeck(faction, {leader, cards});
}

