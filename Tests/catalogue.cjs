const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../Game");
const g = vm.createContext({console, assert, fs, root, path});
for (const file of ["cards","decks","collection"]) vm.runInContext(fs.readFileSync(path.join(root, file+".js"), "utf8"), g);
vm.runInContext(`
const p = startingProfile(), starting = p.decks.realms, stats = deckStats(starting.cards);
const olderSave = {...p, wins: 7, difficulty: 2};
for (const key of ["portrait","animationMs","opponentFaction","volumes","displayMode","pendingReward"]) delete olderSave[key];
const localStorage = {getItem: () => JSON.stringify(olderSave)};
const migrated = readProfile();
assert.deepEqual(migrated.pendingReward,[]);
assert.deepEqual(migrated.volumes,defaultVolumes);
assert.equal(migrated.displayMode,"fullscreen");
const distribution = {};
for (let step=0; step<100; step++) {
    const copy = startingProfile(); copy.wins = 1;
    awardResult(copy,"wins",() => (step + .5) / 100);
    const faction = houseOf(card_dict[copy.pendingReward[0]]);
    distribution[faction] = (distribution[faction] || 0) + 1;
}
assert.deepEqual(distribution, {realms:30,nilfgaard:15,monsters:15,scoiatael:15,skellige:10,neutral:15});
// Leave one ordinary card and one special in the same group to measure their relative odds.
for (const [id,c] of card_dict.entries()) {
    if (!special(c) || !limit(c)) continue;
    const other = cardIndex(houseOf(c) === "skellige" ? "dimun_pirate" : "villen");
    const profile = startingProfile();
    profile.wins = 1;
    profile.owned = Object.fromEntries(card_dict.map((card,index) => [index,limit(card)]));
    for (const owned of [0,1]) {
        if (owned >= limit(c)) continue;
        const slots = owned === 0 ? 3 : 5;
        let specialDraws = 0;
        for (let slot=0; slot<slots; slot++) {
            profile.owned[id] = owned;
            profile.owned[other] = 0;
            awardResult(profile,"wins",() => (slot + .5) / slots);
            const reward = profile.pendingReward[0];
            assert.ok(claimReward(profile,reward));
            assert.ok(reward === id || reward === other);
            if (reward === id) specialDraws++;
        }
        assert.equal(specialDraws,owned === 0 ? 2 : 3,c.name);
    }
}
assert.deepEqual([migrated.portrait,migrated.animationMs,migrated.opponentFaction,migrated.wins,migrated.difficulty],["geralt",250,"random",7,2]);
for (const i of card_dict.keys()) assert.equal(migrated.owned[i],p.owned[i] || 0);
for (const portrait of playerPortraits) assert.ok(fs.existsSync(path.join(root,"img","sm",portrait.art+".jpg")));
assert.equal(stats.units, 22); assert.equal(stats.specials, 6);
assert.equal(catalogueTotal, 255);
assert.equal(card_dict.filter(c=>c.row==="leader").length, 22);
for (const c of card_dict) for (const size of ["sm","lg"]) {
    assert.ok(fs.existsSync(path.join(root,"img",size,c.deck+"_"+c.filename+".jpg")),size+" "+c.filename);
}
assert.equal(factionProgress(p,"nilfgaard").leaders.length, 0);
awardResult(p,"losses"); awardResult(p,"draws");
assert.equal(p.pendingReward.length,0);
let earned = 0;
while (true) {
    const owned = {...p.owned};
    const eligible = card_dict.filter((c,i)=>(owned[i] || 0)<limit(c)).length;
    awardResult(p,"wins");
    assert.deepEqual(p.owned,owned);
    assert.equal(p.pendingReward.length,Math.min(eligible,3));
    assert.equal(new Set(p.pendingReward).size,p.pendingReward.length);
    if (!eligible) break;
    if (!earned) assert.equal(card_dict[p.pendingReward[0]].name,"Zoltan Chivay");
    const pick = p.pendingReward.at(-1);
    assert.equal(claimReward(p,-1),false);
    assert.ok(claimReward(p,pick));
    assert.deepEqual(p.owned,{...owned,[pick]:(owned[pick] || 0)+1});
    assert.equal(claimReward(p,pick),false);
    earned++;
}
assert.equal(earned, catalogueTotal-29);
assert.equal(p.owned[cardIndex("decoy")], 3);
for (const [i,c] of card_dict.entries()) assert.equal(p.owned[i] || 0, limit(c), c.name);
const archive = JSON.parse(JSON.stringify(exportCollection(p, "Test")));
const restored = mergeCollection(startingProfile(), archive);
for (const [i,c] of card_dict.entries()) assert.equal(restored.owned[i] || 0,limit(c),c.name);
assert.deepEqual(mergeCollection(restored, archive),restored);
assert.equal(restored.wins,0);
assert.equal(restored.lastReward,null);
for (const bad of [{"special/decoy":4},{"unknown/card":1},{"special/scorch":0.5}]) {
    assert.throws(()=>mergeCollection(restored,{...archive,cards:bad}));
}
for (const f of houses) {
    assert.ok(factionProgress(p,f).units>=22);
    const deck = buildDeck(p,f);
    assert.ok(cardsFor(f).some(x=>x.i===cardIndex("decoy")));
    for (let level=0;level<3;level++) for(let n=0;n<20;n++) {
        const op=opponentDeck(level,f);
        const cards = Object.fromEntries(op.cards.map(x=>[x.index,x.count]));
        const s=deckStats(cards);
        assert.ok(s.units>=22 && s.specials<=10, f+" "+level);
        assert.equal(op.leader.deck,f);
        for (const x of op.cards) {
            assert.ok(compatible(card_dict[x.index],f));
            assert.ok(x.count>0 && x.count<=limit(card_dict[x.index]), card_dict[x.index].name);
        }
    }
}
console.log("OK: all images, starter, 22 leaders, 255 copies, reward exhaustion, five factions and 300 legal AI decks");
`, g);

