"use strict";
const assert = require("node:assert/strict");
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const sockets = [];
const errors = [];
async function client(seat) {
    const port = Number(process.env["GWENT_QA_"+seat]);
    assert(port && process.env.WEBVIEW2_USER_DATA_FOLDER?.includes("gwent-lan-qa-"));
    let page;
    for (let n=0;n<150 && !page;n++) {
        try { page = (await (await fetch("http://127.0.0.1:"+port+"/json/list")).json()).find(t=>t.url === "https://gwent.local/index.html"); } catch {}
        if (!page) await pause(150);
    }
    assert(page,"No "+seat+" test window");
    const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map();
    sockets.push(ws);
    await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let seq = 0;
    ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
        if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    };
    const send = (method,params={})=>new Promise(resolve=>{pending.set(++seq,resolve);ws.send(JSON.stringify({id:seq,method,params}));});
    await send("Runtime.enable");
    const js = async expression => {
        const m = await send("Runtime.evaluate",{expression,returnByValue:true});
        if (m.result?.exceptionDetails || m.error) throw Error(JSON.stringify(m.result?.exceptionDetails || m.error));
        return m.result.result.value;
    };
    const wait = async expression => {
        for (let n=0;n<160;n++) {
            if (errors.length) throw Error(errors.join("\n"));
            if (await js(expression)) return;
            await pause(90);
        }
        throw Error(seat+" timed out: "+expression+" "+await js("JSON.stringify({page:dm.page,notice:lan.notice,phase:lan.phase,peer:lan.peer,question:lan.view?.question?.title,pending:lan.pending?.id,round:game.roundCount,turn:game.currPlayer?.tag})"));
    };
    const click = async selector => {
        await wait("!!document.querySelector("+JSON.stringify(selector)+")");
        const point = await js(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            el.scrollIntoView({block:"nearest"});
            const r = el.getBoundingClientRect(), x = r.x + r.width/2, y = r.y + r.height/2;
            const hit = document.elementFromPoint(x,y);
            return {x,y,visible:el.contains(hit),hit:hit?.outerHTML.slice(0,100)};
        })()`);
        assert(point.visible,seat+" cannot click "+selector+" under "+point.hit);
        for (const type of ["mousePressed","mouseReleased"]) await send("Input.dispatchMouseEvent",{type,x:point.x,y:point.y,button:"left",clickCount:1});
    };
    await wait("typeof dm!=='undefined' && dm.page==='home'");
    await js("dm.switchProfile('Test "+seat+"')");
    await wait("typeof dm!=='undefined' && dm.userName==='Test "+seat+"'");
    await js("dm.profile.volumes.master=0; applyAudioLevels(); sleep=async()=>{}; fade=async(on,el)=>{el.classList.toggle('hide',!on);el.style.opacity=on?'1':'0'};");
    return {js,wait,click,send};
}
async function run() {
    const [h,g] = await Promise.all([client("HOST"),client("GUEST")]);
    async function lobby(useAdapter=false) {
        for (const c of [h,g]) if (await c.js("dm.page==='home'")) await c.click("[data-page=multiplayer]");
        await h.click("[data-lan=host]");
        await h.wait("lan.address || document.querySelector('.lan-seat')");
        const ip = useAdapter ? await h.js("lan.address.split(', ')[0]") : "127.0.0.1";
        if (useAdapter) {
            await g.click("#lan-ip");
            await g.js("byId('lan-ip').select()");
            await g.send("Input.insertText",{text:ip});
        } else assert.equal(await g.js("byId('lan-ip').value"),ip);
        await g.click("[data-lan=join]");
        for (const c of [h,g]) await c.wait("!!lan.peer && dm.page==='decks' && !!byId('start-game')");
    }
    await g.click("[data-page=multiplayer]");
    await g.click("#lan-ip");
    await g.send("Input.insertText",{text:"127.0.0.1"});
    await g.js("window.sawConnecting=false; new MutationObserver(()=>{if(document.querySelector('[data-lan=join]:disabled') && byId('lan-ip')?.value==='127.0.0.1') window.sawConnecting=true}).observe(dm.elem,{childList:true,subtree:true})");
    await g.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter"});
    await g.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter"});
    await g.wait("!lan.role && document.querySelector('.lan-message')?.textContent.includes('Connection refused by 127.0.0.1')");
    assert(await g.js("window.sawConnecting && byId('lan-ip').value==='127.0.0.1' && !document.querySelector('[data-lan=join]').disabled"));
    await lobby();
    assert.equal(await h.js("lan.peer.name"),"Test GUEST");
    assert.equal(await g.js("lan.peer.name"),"Test HOST");
    for (const c of [g,h]) {
        await c.click("#start-game");
    }
    await g.wait("lan.view?.question?.title.includes('redraw')");
    assert.equal(await g.js("lan.view.state.hand.length"),10);
    assert.equal(await g.js("Object.hasOwn(lan.view.state.op,'hand')"),false);
    await g.click(".lan-options [data-choice]");
    await g.wait("lan.view?.question?.id>=2");
    await g.click(".lan-options button:last-child");
    await h.wait("!!Carousel.curr");
    await h.click(".finish-redraw");
    let plays = 0, last = 0, usedLeader = false, hostPlayed = false;
    for (let n=0;n<350;n++) {
        if (errors.length) throw Error(errors.join("\n"));
        if (await g.js("lan.phase==='finished'")) break;
        if (await h.js("ui.canUseTurnAction()")) {
            if (!hostPlayed) {
                const move = await h.js("(()=>{const c=player_me.hand.cards.find(c=>c.isUnit() && !c.abilities.includes('spy')); return {hand:player_me.hand.cards.indexOf(c)+1,row:c.row,id:lanCardId(c)};})()");
                await h.click("#hand-row > .card:nth-child("+move.hand+")");
                await h.click('#field-me [data-row="'+move.row+'"] .row-cards');
                await g.wait("!!document.querySelector('#field-op [data-card-id=\""+move.id+"\"]')");
                hostPlayed = true;
            } else await h.click("#pass-button");
        }
        const q = await g.js("lan.view.question");
        if (q && q.id !== last) {
            last = q.id;
            if (q.kind === "turn") {
                if (!usedLeader && q.options.some(o=>o.action === "leader")) {
                    await g.js("document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyX',key:'x',bubbles:true}))");
                    await h.wait("!player_op.leaderAvailable");
                    usedLeader = true;
                    continue;
                }
                const hand = await g.js("lan.view.state.hand");
                const handIndex = await g.js("lan.view.state.hand.findIndex(id=>!special(card_dict[id]) && +card_dict[id].strength>0 && !card_dict[id].ability.includes('spy'))");
                if (await g.js("lan.view.state.me.score<=lan.view.state.op.score") && handIndex>=0 && hand.length) {
                    await g.click('[data-hand="'+handIndex+'"]');
                    assert(await g.js("lan.view.panel.hidden && !!document.querySelector('.lan-selected')"));
                    await g.click("#field-op [data-row=close] .row-cards");
                    assert.equal(await g.js("lan.view.question?.id"),q.id);
                    const row = await g.js("card_dict[lan.view.state.hand["+handIndex+"]].row");
                    await g.click('#field-me [data-row="'+row+'"] .row-cards');
                    plays++;
                } else await g.js("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}))");
            } else await g.click(".lan-options [data-choice]");
        }
        await pause(70);
    }
    await g.wait("lan.phase==='finished'");
    await h.wait("lan.phase==='finished'");
    assert(plays>=2);
    assert(usedLeader);
    assert(hostPlayed);
    assert.equal(await g.js("dm.profile.wins"),1);
    assert.equal(await h.js("dm.profile.losses"),1);
    const offer = await g.js("dm.profile.pendingReward");
    assert.equal(offer.length,3);
    assert.equal(await g.js("dm.totalOwned"),29);
    assert.equal(await h.js("dm.rewardDialog.open"),false);
    assert.deepEqual(await g.js("[...game.endScreen.querySelectorAll('tr')[1].querySelectorAll('td')].map(c=>c.textContent)"),await h.js("[...game.endScreen.querySelectorAll('tr')[2].querySelectorAll('td')].map(c=>c.textContent)"));
    // Reopening the game before choosing must restore exactly the same offer.
    await g.send("Page.reload");
    await g.wait("document.readyState==='complete' && typeof dm!=='undefined' && !lan.role && dm.rewardDialog.open");
    assert.deepEqual(await g.js("dm.profile.pendingReward"),offer);
    await g.click('[data-reward="'+offer[1]+'"]');
    await g.wait("!dm.rewardDialog.open");
    assert.equal(await g.js("dm.profile.lastReward"),offer[1]);
    assert.equal(await g.js("dm.totalOwned"),30);
    assert.equal(await g.js("dm.profile.wins"),1);
    await h.click("#end-screen button");
    await h.wait("typeof dm!=='undefined' && dm.page==='home' && !lan.role");
    await lobby(true);
    for (const c of [h,g]) await c.click("#start-game");
    await g.wait("lan.view?.question?.title.includes('redraw')");
    await g.click(".lan-options button:last-child");
    await h.wait("!!Carousel.curr");
    // Give the guest a known set of targets in this isolated second match.
    await h.js(`for (const file of ['stennis','olgierd','decoy','horn','frost','scorch']) {
        player_op.hand.addCard(new Card(card_dict[cardIndex(file)],player_op));
    }
    game.firstPlayer=player_me; sleep=async()=>{};`);
    await h.click(".finish-redraw");
    await h.wait("ui.canUseTurnAction()");
    await h.click("#pass-button");
    async function selectGuestCard(file) {
        await g.wait("lan.view.question?.kind==='turn'");
        const hand = await g.js("lan.view.state.hand.indexOf(cardIndex("+JSON.stringify(file)+"))");
        assert(hand>=0);
        await g.click('[data-hand="'+hand+'"]');
        assert(await g.js("lan.view.panel.hidden && !!document.querySelector('.lan-selected')"));
        return g.js("lan.view.question.id");
    }
    async function place(selector,id) {
        await g.click(selector);
        await g.wait("lan.view.question?.kind==='turn' && lan.view.question.id>"+id);
    }
    const spyTurn = await selectGuestCard("stennis");
    assert.equal(await g.js("document.querySelectorAll('#field-me [data-lan-move]').length"),0);
    await place('#field-op [data-row=close] .row-cards',spyTurn);
    assert(await h.js("board.row[3].cards.some(c=>c.filename==='stennis')"));
    const agileTurn = await selectGuestCard("olgierd");
    assert.equal(await g.js("document.querySelectorAll('#field-me [data-lan-move]').length"),2);
    await place('#field-me [data-row=ranged] .row-cards',agileTurn);
    const decoyTurn = await selectGuestCard("decoy");
    await g.click('#field-me [data-row=close] .row-cards');
    assert.equal(await g.js("lan.view.question.id"),decoyTurn);
    await place('#field-me [data-row=ranged] .card[data-lan-move]',decoyTurn);
    assert(await h.js("board.row[1].cards.some(c=>c.name==='Decoy') && player_op.hand.cards.some(c=>c.filename==='olgierd')"));
    await place('#field-me [data-row=siege] .row-special',await selectGuestCard("horn"));
    assert(await h.js("board.row[0].special?.filename==='horn'"));
    await place('#weather',await selectGuestCard("frost"));
    assert(await h.js("weather.cards.some(c=>c.filename==='frost')"));
    await place('#field-op [data-row=siege] .row-cards',await selectGuestCard("scorch"));
    assert(await h.js("player_op.grave.cards.some(c=>c.filename==='scorch')"));
    await h.click("#exit-game");
    await h.click("#leave-lan");
    await g.wait("typeof dm!=='undefined' && dm.page==='multiplayer' && lan.notice.includes('without a result')");
    assert.equal(await g.js("dm.profile.wins+dm.profile.losses+dm.profile.draws"),1);
    assert.deepEqual(errors,[]);
    console.log("OK: refused connection, retained IP, retry, automatic deck selection on both Windows clients, full match and disconnect over the host adapter.");
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sockets.forEach(ws=>ws.close()));
