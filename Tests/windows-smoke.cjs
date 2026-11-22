"use strict";
// Run via windows-smoke.ps1, which starts a separate WebView2 profile.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const delay = ms => new Promise(r => setTimeout(r, ms));
const port = Number(process.env.GWENT_TEST_PORT);
const temp = process.env.WEBVIEW2_USER_DATA_FOLDER;
if (!port || !path.basename(temp).startsWith("gwent-qa-")) throw Error("Use the isolated test launcher.");
async function main() {
    let target;
    for (let i=0; i<100 && !target; i++) {
        try {
            const list = await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
            target = list.find(x => x.url === "https://gwent.local/index.html");
        } catch {}
        if (!target) await delay(150);
    }
    assert.ok(target,"Native application did not open the game");
    const ws = new WebSocket(target.webSocketDebuggerUrl), pending=new Map(), errors=[];
    await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let id=0;
    ws.onmessage = e => {
        const msg=JSON.parse(e.data);
        if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); }
        if (msg.method==="Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    };
    const send = (method,params={}) => new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
    async function js(expression) {
        const msg=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
        if (msg.error || msg.result.exceptionDetails) throw Error(JSON.stringify(msg.error || msg.result.exceptionDetails));
        return msg.result.result.value;
    }
    async function until(expression, timeout=12000) {
        const end=Date.now()+timeout;
        while(Date.now()<end) {
            if(errors.length) throw Error(errors.join("\n"));
            if(await js(expression)) return;
            await delay(35);
        }
        throw Error("Timeout: "+expression+" "+await js("JSON.stringify({state:game.state.val,round:game.roundCount,turn:game.currPlayer?.name,carousel:Carousel.curr?.title,focus:document.activeElement.outerHTML.slice(0,120),canAct:ui.canUseTurnAction(),leader:player_me?.leaderAvailable,passed:player_me?.passed,leaderClass:player_me?.elem_leader.className,settings:dm.battleSettings})"));
    }
    const snap = async name => {
        const shot=await send("Page.captureScreenshot",{format:"jpeg",quality:82});
        fs.writeFileSync(path.join(temp,name+".jpg"),Buffer.from(shot.result.data,"base64"));
    };
    await send("Runtime.enable");
    await until("document.querySelector('[data-page=decks]') && dm.page==='home'");
    const click = selector => js("document.querySelector("+JSON.stringify(selector)+").click()");
    await snap("main-menu");
    await click("[data-page=settings]");
    const keypress = async (key,code) => {
        await send("Input.dispatchKeyEvent",{type:"keyDown",key,code});
        await send("Input.dispatchKeyEvent",{type:"keyUp",key,code});
    };
    const setControl = (id,value,type) => js(`{ const input=byId(${JSON.stringify(id)}); input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true})); }`);
    assert.equal(await js("byId('display-mode').value"),"fullscreen");
    const fullWidth = await js("innerWidth");
    await setControl("display-mode","windowed","change");
    await until("innerWidth < "+fullWidth);
    await setControl("display-mode","borderless","change");
    await setControl("volume-master",50,"input");
    await setControl("volume-music",40,"input");
    await setControl("volume-effects",60,"input");
    assert.equal(await js("soundtrack.volume"),.2);
    await js("AudioManager.playSFX('open'); void 0");
    assert.equal(await js("AudioManager.source.get(audioURL('open')).volume"),.3);
    await setControl("volume-master",0,"input");
    assert.ok(await js("soundtrack.volume===0 && AudioManager.source.get(audioURL('open')).volume===0"));
    await setControl("volume-master",50,"input");
    await click("[data-messages]");
    assert.deepEqual(await js("[byId('animation-speed').min,byId('animation-speed').max,byId('animation-speed').step,byId('animation-speed').value]"),["100","500","50","250"]);
    await js("byId('animation-speed').focus()");
    for (const [key,ms] of [["Home",100],["ArrowRight",150],["End",500],["ArrowLeft",450]]) {
        await send("Input.dispatchKeyEvent",{type:"keyDown",key});
        await send("Input.dispatchKeyEvent",{type:"keyUp",key});
        assert.equal(await js("byId('animation-value').value"),ms+" ms");
        assert.equal(await js("getComputedStyle(document.documentElement).getPropertyValue('--card-travel').trim()"),ms+"ms");
        assert.equal(await js("animationDuration(250)"),ms);
    }
    await click("[data-portrait=triss]");
    await click("[data-level='2']");
    await js("byId('opponent-faction').value='realms';byId('opponent-faction').dispatchEvent(new Event('change',{bubbles:true}))");
    await click("[data-music]"); await click("[data-sound]");
    await send("Page.reload");
    await until("typeof dm!=='undefined' && dm.page==='home'");
    await click("[data-page=settings]");
    assert.deepEqual(await js("[dm.profile.displayMode,dm.profile.volumes,Settings.notifications.isEnabled()]"),["borderless",{master:50,music:40,effects:60},false]);
    await setControl("display-mode","fullscreen","change");
    await until("innerWidth === "+fullWidth);
    assert.deepEqual(await js("[byId('animation-speed').value,byId('opponent-faction').value,dm.profile.difficulty,dm.profile.portrait,Settings.music.isEnabled(),Settings.soundEffects.isEnabled()]"),
        ["450","realms",2,"triss",false,false]);
    assert.ok(await js("document.querySelector('[data-portrait=triss]').getAttribute('aria-pressed')==='true' && document.querySelectorAll('[data-portrait]').length===9"));
    await snap("settings");
    await click("[data-music]"); await click("[data-sound]");
    await click("[data-level='0']");
    await click("[data-page=home]");
    await click("[data-page=cards]");
    assert.equal(await js("document.querySelector('.record').textContent.includes('29 / 255')"),true);
    const bars = () => js("Array.from(document.querySelectorAll('.collection-bar'), b => [b.dataset.house,b.querySelector('progress').value,b.querySelector('progress').max,b.querySelector('span').textContent])");
    assert.deepEqual(await bars(), [["all",29,255,"11.4%"],["realms",23,43,"53.5%"],["nilfgaard",0,42,"0%"],["monsters",0,46,"0%"],["scoiatael",0,43,"0%"],["skellige",0,40,"0%"],["neutral",6,41,"14.6%"]]);
    await click("[data-filter=missing]");
    assert.ok(await js("!!document.querySelector('[data-detail=\"'+cardIndex('frost')+'\"]')"));
    assert.equal(await js("!!document.querySelector('[data-detail=\"'+cardIndex('dethmold')+'\"]')"),false);
    await js("document.querySelector('#collection-faction').value='neutral';document.querySelector('#collection-faction').dispatchEvent(new Event('change',{bubbles:true}))");
    assert.deepEqual(await bars(),[["neutral",6,41,"14.6%"]]);
    await js("document.querySelector('[data-detail=\"'+cardIndex('decoy')+'\"]').click()");
    assert.ok(await js("byId('detail').open && byId('detail').textContent.includes('3 missing')"));
    await click("[data-close]");
    await click("[data-filter=owned]");
    assert.deepEqual(await bars(),[["neutral",6,41,"14.6%"]]);
    assert.ok(await js(`(()=>{const previous=dm.profile.owned;
        try { dm.profile.owned={...previous}; for(const {c,i} of catalogue) if(houseOf(c)==="neutral") dm.profile.owned[i]=limit(c);
            dm.render(); return document.querySelector(".collection-bar span").textContent==="Complete · 100%"; }
        finally { dm.profile.owned=previous; dm.render(); }
    })()`));
    assert.ok(await js("document.querySelectorAll('.archive-card').length === 4"));
    await snap("cards");
    await click("[data-page=home]");
    await click("[data-page=decks]");
    await click("[data-cycle='1']");
    assert.equal(await js("byId('start-game').disabled"),true);
    await click("[data-cycle='-1']");
    await click("[data-leaders]");
    await js("document.querySelector('[data-leader]:enabled').click()");
    const stennis = await js("cardIndex('stennis')");
    await click('[data-minus="'+stennis+'"]');
    assert.ok(await js("byId('start-game').disabled"));
    await snap("deck-builder");
    await click('[data-plus="'+stennis+'"]');
    async function mouseClick(selector) {
        const {x,y} = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,x,y});
        await send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,x,y});
    }
    // Keep real dealing, movement, abilities, scoring, game flow and UI actions. Skip animation waits.
    const dealStarted = Date.now();
    await mouseClick('#start-game');
    await until("!!Carousel.curr",25000);
    console.log("Match start to redraw: " + (Date.now()-dealStarted) + " ms");
    assert.ok(await js("player_op.deck.faction==='realms' && player_op.name==='Innkeeper' && getComputedStyle(document.querySelector('#stats-me .profile-img')).backgroundImage.includes('neutral_triss.jpg')"));
    assert.ok(await js("soundtrack.readyState>=2 && !soundtrack.paused"));
    await js(`Settings.soundEffects.disable(); Settings.notifications.disable();
        sleep = async () => {}; fade = async (on,el) => {el.classList.toggle('hide',!on);el.style.opacity=on?'1':'0';};`);
    assert.equal(await js("player_me.hand.cards.length"),10);
    await mouseClick("#battle-settings");
    assert.ok(await js("dm.battleSettings && document.querySelector('main').inert && Carousel.curr.count===2"));
    await keypress("x","KeyX");
    await keypress("Escape","Escape");
    assert.ok(await js("!dm.battleSettings && Carousel.curr.count===2 && !document.querySelector('main').inert"));
    const centre = ".carousel-cards button:nth-child(3)";
    const position = () => js("document.querySelector('.carousel-position').textContent");
    assert.equal(await position(), "1 / 10");
    await mouseClick(".carousel-next");
    await mouseClick(".carousel-cards button:nth-child(5)");
    assert.equal(await position(), "4 / 10");
    await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowLeft"});
    await send("Input.dispatchKeyEvent", {type:"keyUp",key:"ArrowLeft"});
    assert.equal(await position(), "3 / 10");
    const point = await js("(()=>{const r=Carousel.curr.previews[2].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await send("Input.dispatchMouseEvent",{type:"mouseWheel",deltaX:0,deltaY:110,...point});
    await until("Carousel.curr.index === 3");
    for (let i=4; i<10; i++) await mouseClick(".carousel-next");
    assert.equal(await position(), "10 / 10");
    assert.equal(await js("document.querySelector('.carousel-next').disabled"),true);
    await js("const lastOpeningCard = player_me.hand.cards[9]");
    await mouseClick(centre);
    await until("Carousel.curr?.count === 1 && !player_me.hand.cards.includes(lastOpeningCard)");
    await mouseClick(".carousel-prev");
    await js("const secondExchange = player_me.hand.cards[8]");
    await mouseClick(centre);
    await until("!Carousel.curr && !player_me.hand.cards.includes(secondExchange)");
    await until("game.currPlayer===player_me && game.roundCount===1 && !document.querySelector('main').classList.contains('noclick')");
    assert.ok(await js("player_me.hand.cards.every((c,i,a)=>c.elem===byId('hand-row').children[i] && (!i || Card.compare(a[i-1],c)<=0))"));
    await keypress("x","KeyX");
    await until("!player_me.leaderAvailable && ui.canUseTurnAction()");
    await js(`const fixtureCard = file => new Card(card_dict[cardIndex(file)], player_me);
        const reviveTarget = fixtureCard("vesemir");
        [reviveTarget, ...["frost","zoltan","ciri","dethmold","blue_stripes"].map(fixtureCard)].forEach(c=>player_me.grave.addCard(c));
        const medicSelection = ability_dict.medic.placed(fixtureCard("banner_nurse"));
        void 0;`);
    assert.equal(await position(), "1 / 4");
    for (let i=1; i<4; i++) await mouseClick(".carousel-next");
    assert.equal(await position(), "4 / 4");
    assert.equal(await js("Carousel.curr.previews[2].getAttribute('aria-label')"),"Select Vesemir");
    await mouseClick(centre);
    await js("medicSelection");
    assert.ok(await js("board.row.some(row=>row.cards.includes(reviveTarget)) && !player_me.grave.cards.includes(reviveTarget)"));
    await js("board.toGrave(reviveTarget, board.getRow(reviveTarget,reviveTarget.row))");
    await js("player_me.grave.reset(); ui.enablePlayer(true)");
    console.log("OK: full opening hand navigation, both redraws and filtered Medic selection by mouse, keyboard and wheel");
    await snap("board");
    await js(`const unit = player_me.hand.cards.find(c=>c.isUnit() && c.row !== 'agile');
        unit.elem.click();board.getRow(unit,unit.row).elem.click();`);
    await until("board.row.some(r=>r.cards.length) && game.currPlayer===player_me && !document.querySelector('main').classList.contains('noclick')");
    // Pass through an actual match, checking its result and return path.
    for(let n=0;n<20;n++){
        await until("game.state===GameState.END_SCREEN || (game.currPlayer===player_me && !player_me.passed && !document.querySelector('main').classList.contains('noclick'))");
        if (await js("game.state===GameState.END_SCREEN")) break;
        await keypress(" ","Space");
        await delay(70);
    }
    await until("game.state===GameState.END_SCREEN");
    assert.ok(await js("dm.profile.wins+dm.profile.losses+dm.profile.draws===1"));
    if (await js("dm.rewardDialog.open")) await click("#reward-options button");
    await js("game.customize_elem.click()");
    await until("dm.page==='home' && !dm.elem.classList.contains('hide')");
    await click("[data-page=decks]");
    // A passing fixture opponent makes the reward path reproducible.
    await js(`
        Game.prototype.initialRedraw = async function(){
            player_op.controller.startTurn = async player => player.passRound();
        };
        byId("start-game").click();`);
    for(let n=0;n<2;n++){
        await until("game.currPlayer===player_me && !player_me.passed && !document.querySelector('main').classList.contains('noclick')");
        await js(`{ const unit=player_me.hand.cards.find(c=>c.isUnit() && !c.abilities.includes("spy") && c.basePower>0);
            unit.elem.click();board.getRow(unit,unit.row).elem.click(); }`);
        await until("player_me.winning && game.currPlayer===player_me && !document.querySelector('main').classList.contains('noclick')");
        await js("byId('pass-button').click()"); await delay(80);
    }
    await until("game.state===GameState.END_SCREEN");
    assert.equal(await js("document.querySelectorAll('#reward-options button').length"),3);
    await click("#reward-options button");
    assert.ok(await js("player_op.health===0 && player_me.health>0 && byId('match-reward').textContent.includes('CARD WON')"));
    await js("game.newGame_elem.click()");
    await until("dm.page==='decks' && !dm.elem.classList.contains('hide')");
    const saved=await js("JSON.stringify(dm.profile)");
    await send("Page.reload"); await delay(300);
    await until("typeof dm!=='undefined' && !!dm.profile");
    assert.equal(await js("dm.profile.wins"), JSON.parse(saved).wins);
    assert.equal(await js("dm.profile.owned[cardIndex('zoltan')]"),1);
    await js(`const savedCardsProfile = dm.profile;
        dm.profile = startingProfile();
        for (const file of ['ciri','geralt','zoltan','decoy','frost','blue_stripes','stennis']) {
            const id = cardIndex(file);
            dm.profile.owned[id] = limit(card_dict[id]);
        }
        const testDeck = dm.profile.decks.realms;
        for (const file of ['ciri','zoltan','decoy']) testDeck.cards[cardIndex(file)]=1;
        dm.go('decks');`);
    for (const action of ['plus','minus']) {
        assert.ok(await js(`Array.from(document.querySelectorAll('[data-${action}]'), b=>card_dict[Number(b.dataset.${action})]).every((c,i,cards)=>{
            if (!i) return true;
            const group = c => c.deck === 'special' || c.deck === 'weather' ? 2 : c.ability.includes('hero') ? 0 : 1;
            const a=cards[i-1]; return group(a)<group(c) || (group(a)===group(c) && (Number(a.strength)||0)>=(Number(c.strength)||0));
        })`));
    }
    await js("dm.profile=savedCardsProfile; dm.go('home')");
    if(errors.length) throw Error(errors.join("\n"));
    console.log(await js(fs.readFileSync(path.join(__dirname,"board-cases.js"),"utf8")));
    if(errors.length) throw Error(errors.join("\n"));
    console.log(await js(fs.readFileSync(path.join(__dirname,"factions.js"),"utf8")));
    if(errors.length) throw Error(errors.join("\n"));
    console.log(await js(fs.readFileSync(path.join(__dirname,"leaders.js"),"utf8")));
    if(errors.length) throw Error(errors.join("\n"));
    const firstName = "QA-" + Date.now();
    async function switchTo(name) {
        await js(`byId('user-name').value=${JSON.stringify(name)};byId('profile-form').requestSubmit()`);
        await until("typeof dm!=='undefined' && dm.page==='home' && dm.userName==="+JSON.stringify(name));
    }
    await switchTo(firstName);
    assert.equal(await js("dm.profile.wins"),JSON.parse(saved).wins);
    await click("[data-page=cards]");
    await click("[data-transfer=export]");
    await until("byId('transfer-status').textContent.startsWith('Saved to Cards/')");
    const exported = await js("byId('transfer-status').textContent.slice('Saved to Cards/'.length)");
    assert.ok(exported.startsWith("Cards-"+firstName+"-") && path.basename(exported)===exported);
    const file = path.join(__dirname,"..","Cards",exported);
    try {
        const backup = JSON.parse(fs.readFileSync(file,"utf8"));
        assert.equal(backup.userName,firstName);
        assert.equal(backup.cards["neutral/zoltan"],1);
        await click("[data-page=home]");
        await switchTo(firstName+"-B");
        assert.equal(await js("dm.totalOwned"),29);
        const importFile = async () => {
            await click("[data-transfer=list]");
            await until("byId('detail').open && !!byId('collection-file')");
            await js("byId('collection-file').value="+JSON.stringify(exported));
            await click("[data-load-cards]");
            await until("!dm.transferPending && !byId('detail').open");
        };
        await click("[data-page=cards]");
        await importFile();
        assert.equal(await js("dm.profile.owned[cardIndex('zoltan')]"),1);
        assert.equal(await js("dm.profile.wins"),0);
        const copies = await js("dm.totalOwned");
        await importFile();
        assert.equal(await js("dm.totalOwned"),copies);
        await send("Page.reload");
        await until("typeof dm!=='undefined' && dm.page==='home' && dm.totalOwned==="+copies);
        assert.equal(await js("byId('user-name').value"),firstName+"-B");
        await switchTo(firstName);
        assert.equal(await js("dm.profile.wins"),JSON.parse(saved).wins);
        console.log("OK: existing progress adopted, named profiles persisted, on-disk export, cross-profile import and repeat import");
    } finally {
        fs.unlinkSync(file);
    }
    await click("[data-new-start]");
    await click("[data-close]");
    assert.equal(await js("dm.profile.wins"), JSON.parse(saved).wins);
    await click("[data-new-start]");
    await click("[data-reset-confirm]");
    assert.ok(await js("dm.page==='decks' && JSON.stringify(dm.profile)===JSON.stringify(startingProfile()) && Settings.notifications.isEnabled() && Settings.music.isEnabled() && Settings.soundEffects.isEnabled()"));
    await send("Page.reload"); await delay(300);
    await until("typeof dm!=='undefined' && dm.page==='home' && dm.profile.wins===0 && dm.totalOwned===29");
    console.log("OK: Windows host, lobby, collection, legal move, full match, victory reward and profile reload. Screenshots: "+temp);
    const closed = new Promise(resolve => ws.addEventListener("close",resolve,{once:true}));
    await js("setTimeout(()=>document.querySelector('[data-exit]').click(),80);void 0");
    await closed;
}
const guard=setTimeout(()=>{console.error("Smoke timeout");process.exit(2);},65000);
main().then(()=>clearTimeout(guard)).catch(e=>{console.error(e);process.exit(1)});

