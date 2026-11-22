"use strict";

const lanCardIds = new Map(card_dict.map((c,i) => [c.deck + "/" + c.filename, i]));
const lanCardId = c => lanCardIds.get(c.faction + "/" + c.filename);
// Snapshots list combat rows from the guest's perspective.
const guestRowIndex = row => board.row.length - 1 - board.row.indexOf(row);

function validLanDeck(deck) {
    if (!deck || !houses.includes(deck.faction) || !Number.isInteger(deck.leader)) return false;
    const leader = card_dict[deck.leader];
    if (leader?.row !== "leader" || leader.deck !== deck.faction || !deck.cards ||
        typeof deck.cards !== "object" || Array.isArray(deck.cards)) return false;
    for (const [key,n] of Object.entries(deck.cards)) {
        const c = card_dict[Number(key)];
        if (String(Number(key)) !== key || !c || !compatible(c,deck.faction) || c.row === "leader" ||
            !Number.isInteger(n) || n < 1 || n > limit(c)) return false;
    }
    const stats = deckStats(deck.cards);
    return stats.units >= 22 && stats.specials <= 10;
}

class LanSession {
    constructor() {
        this.notice = sessionStorage.getItem("lan-notice") || "";
        this.joinAddress = sessionStorage.getItem("lan-address") || "";
        sessionStorage.removeItem("lan-notice");
        this.bridge = window.chrome?.webview;
        this.bridge?.addEventListener("message", e => {
            if (!this.role || !e.data?.lan) return;
            try { this.nativeEvent(e.data.lan, e.data.value); }
            catch { this.disconnect("The other copy of Gwent sent an incompatible message. Use the same game version on both computers."); }
        });
    }
    get inMatch() { return this.phase === "playing" || this.phase === "finished"; }
    get hostPlaying() { return this.role === "host" && this.phase === "playing"; }
    get guestPlaying() { return this.role === "guest" && this.phase === "playing"; }
    get myName() { return dm.userName || (this.role === "host" ? "Host" : "Guest"); }
    send(packet) { this.bridge.postMessage("lan:send:" + JSON.stringify(packet)); }
    refresh() { if (dm.page === "multiplayer") dm.render(); }
    menu(tavern) {
        const header = tavern.header("Multiplayer");
        const msg = '<p class="lan-message" role="status">' + esc(this.notice) + '</p>';
        const joining = this.role === "guest" && !this.peer;
        if (!this.role || joining) return header + `<div class="lan-lobby"><div class="lan-columns">
            <section><h2>Host a game</h2><p>Open a table and share your local address with the other player.</p><button class="gold" data-lan="host" ${joining ? "disabled" : ""}>Host LAN Game</button></section>
            <section><h2>Join a game</h2><p>Connect both computers to the same home network.</p><label for="lan-ip">Host IPv4 address</label><input id="lan-ip" value="${esc(this.joinAddress)}" placeholder="192.168.1.10" inputmode="decimal" autocomplete="off" ${joining ? "readonly" : ""}><button class="gold" data-lan="join" ${joining ? "disabled" : ""}>${joining ? "Connecting…" : "Join LAN Game"}</button>
            ${joining ? '<button class="lan-secondary" data-lan="cancel">Cancel</button>' : ''}${msg}</section></div></div>`;
        const seat = (name,deck) => `<p class="lan-seat"><strong>${esc(name)}</strong><span>${deck ? esc(factions[deck.faction].name) + " · Ready" : "Choosing a deck"}</span></p>`;
        return header + `<div class="lan-lobby"><section><h2>${this.role === "host" ? "Host lobby" : "Guest lobby"}</h2>
            ${this.address ? '<p>Host IPv4 address</p><strong class="lan-address">' + esc(this.address.split(", ")[0]) + '</strong>' : ''}
            ${this.address?.includes(", ") ? '<p>Other adapter addresses: ' + esc(this.address.split(", ").slice(1).join(", ")) + '</p>' : ''}
            ${this.peer ? seat(this.myName + " (you)",this.localDeck) + seat(this.peer.name,this.peerDeck) : '<p>' + (this.role === "host" ? 'Waiting for a player to join… If Windows asks, allow Gwent on private networks.' : 'Connecting to host…') + '</p>'}
            ${this.peer && !this.localDeck ? '<button class="gold" data-lan="deck">Choose Deck</button>' : ''}
            <button class="lan-secondary" data-lan="leave">Leave Lobby</button>${msg}</section></div>`;
    }
    lobbyAction(action) {
        if (action === "cancel") return this.reset("Connection cancelled.");
        if (action === "leave") return this.leave();
        if (action === "deck" && this.peer && !this.localDeck) return dm.go("decks");
        if (!["host","join"].includes(action) || this.role) return;
        const ip = byId("lan-ip").value.trim();
        if (action === "join") this.joinAddress = ip;
        if (!this.bridge) { this.notice = "Open Gwent.exe to play on LAN."; return this.refresh(); }
        if (action === "join" && (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split(".").some(n => +n > 255))) {
            byId("lan-ip").focus();
            document.querySelector(".lan-message").textContent = "Enter the IPv4 address shown in the host lobby.";
            return;
        }
        if (action === "join") {
            this.joinAddress = ip.split(".").map(Number).join(".");
            sessionStorage.setItem("lan-address",this.joinAddress);
        }
        this.notice = action === "join" ? "Connecting to " + this.joinAddress + " on TCP port 47823…" : "";
        this.role = action === "host" ? "host" : "guest";
        this.phase = "lobby";
        this.address = action === "join" ? this.joinAddress : "";
        this.seq = 0;
        this.refresh();
        this.connectionTimer = setTimeout(() => this.disconnect("The Windows game did not respond. Update Gwent.exe and the Game folder together, then reopen the game."),15000);
        try { this.bridge.postMessage(action === "host" ? "lan:host" : "lan:join:" + this.joinAddress); }
        catch { this.disconnect("The Windows game could not start the LAN connection. Reopen Gwent.exe."); }
    }
    nativeEvent(kind,value) {
        if (kind === "closed") return this.disconnect(value);
        if (kind === "listening") { clearTimeout(this.connectionTimer); this.address = value; return this.refresh(); }
        if (kind === "connected") {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = setTimeout(() => this.disconnect("The connection opened, but the other game did not identify itself. Use the same game version on both computers."),10000);
            this.notice = "Connected. Waiting for the other player's profile…";
            this.refresh();
            this.lastHeard = Date.now();
            this.heartbeat = setInterval(() => {
                if (Date.now() - this.lastHeard > 45000) this.disconnect("The other computer stopped responding.");
                else this.send({t:"ping"});
            },5000);
            this.send({t:"hello",version:1,role:this.role,name:this.myName,portrait:dm.profile.portrait});
            return;
        }
        if (kind !== "packet") return;
        const p = JSON.parse(value);
        this.lastHeard = Date.now();
        if (p.t === "ping") return;
        if (p.t === "hello" && this.phase === "lobby" && !this.peer) {
            if (p.version !== 1 || p.role !== (this.role === "host" ? "guest" : "host") ||
                typeof p.name !== "string" || !p.name.trim() || p.name.length > 32 ||
                !playerPortraits.some(x => x.id === p.portrait)) throw Error();
            this.peer = {name:p.name, portrait:p.portrait};
            clearTimeout(this.connectionTimer);
            this.notice = "";
            return dm.go("decks");
        }
        if (!this.peer) throw Error();
        if (p.t === "ready" && this.phase === "lobby" && !this.peerDeck) {
            if (!houses.includes(p.deck?.faction) || (this.role === "host" && !validLanDeck(p.deck))) throw Error();
            this.peerDeck = p.deck;
            this.refresh();
            return this.startIfReady();
        }
        if (this.role === "host") {
            const q = this.pending;
            if (this.hostPlaying && p.t === "answer" && q && p.id === q.id && Number.isInteger(p.index) && p.index >= 0 && p.index < q.count) {
                this.pending = null;
                q.resolve(p.index);
            }
            return;
        }
        if (p.t === "start" && this.phase === "lobby" && this.localDeck && this.peerDeck) {
            this.phase = "playing";
            this.view = new LanBoard(this);
            return;
        }
        if (!this.guestPlaying) return;
        if (p.t === "state") this.view.update(p.state);
        if (p.t === "prompt") this.view.prompt(p);
        if (p.t === "played") this.view.played(p);
        if (p.t === "finish") this.finishGuest(p);
    }
    ready() {
        if (this.phase !== "lobby" || !this.peer || this.localDeck) return;
        const deck = {...dm.deck, faction:dm.faction};
        if (!validLanDeck(deck)) return;
        this.localDeck = deck;
        dm.save();
        this.send({t:"ready",deck:this.role === "host" ? {faction:deck.faction} : deck});
        dm.go("multiplayer");
        this.startIfReady();
    }
    startIfReady() {
        if (this.role !== "host" || !this.localDeck || !this.peerDeck || this.phase !== "lobby") return;
        this.phase = "playing";
        player_me = new Player(0,this.myName,engineDeck(this.localDeck.faction,this.localDeck));
        dm.applyPortrait(this.myName);
        player_op = new Player(1,this.peer.name,engineDeck(this.peerDeck.faction,this.peerDeck));
        player_op.controller = new RemotePlayer();
        const avatar = document.querySelector("#stats-op .profile-img");
        avatar.style.cssText = portraitStyle(playerPortraits.find(p=>p.id === this.peer.portrait));
        avatar.classList.add("lan-portrait");
        dm.elem.classList.add("hide");
        this.hostStatus = document.createElement("div");
        this.hostStatus.className = "lan-turn lan-host-status";
        this.hostStatus.setAttribute("role","status");
        document.body.append(this.hostStatus);
        byId("exit-game").classList.add("lan-exit");
        this.send({t:"start"});
        this.sync = setInterval(() => this.publish(),120);
        this.publish();
        game.startGame();
    }
    snapshot() {
        const ids = container => container.cards.map(lanCardId);
        const seat = p => ({leader:lanCardId(p.leader),available:p.leaderAvailable,score:p.total,
            handCount:p.hand.cards.length,deckCount:p.deck.cards.length,health:p.health,passed:p.passed,grave:ids(p.grave)});
        return {round:game.roundCount,turn:game.currPlayer?.tag,me:seat(player_op),op:seat(player_me),
            hand:ids(player_op.hand), weather:ids(weather),
            rows:board.row.slice().reverse().map(r => ({cards:r.cards.map(c => [lanCardId(c),c.power]),total:r.total,
                special:r.special ? lanCardId(r.special) : null,weather:r.effects.weather}))};
    }
    publish() {
        if (!this.hostPlaying) return;
        const status = (game.roundCount ? "Round " + game.roundCount + " · " : "") +
            (this.pending ? "Waiting for " + this.peer.name : game.currPlayer === player_me ? "Your turn" : game.roundCount ? this.peer.name + "’s turn" : "Preparing hands…");
        if (status !== this.hostStatus.textContent) this.hostStatus.textContent = status;
        const state = this.snapshot();
        const serialized = JSON.stringify(state);
        if (serialized === this.lastState) return;
        this.lastState = serialized;
        this.send({t:"state",state});
    }
    ask(title,options,kind="choice") {
        this.publish();
        const id = ++this.seq;
        return new Promise(resolve => {
            this.pending = {id,count:options.length,resolve};
            this.send({t:"prompt",kind,id,title,options});
        });
    }
    async remoteCards(container,count,action,predicate,sort,optional,title) {
        for (let n=0; n<count; n++) {
            const available = container.cards.filter(c => !predicate || predicate(c));
            if (!available.length) return;
            if (sort) available.sort(Card.compare);
            const options = available.map(c => ({label:c.name,card:lanCardId(c)}));
            if (optional) options.push({label:"Done"});
            const i = await this.ask(title || "Choose a card",options);
            if (i === available.length) return;
            await action(container,container.cards.indexOf(available[i]));
            if (game.currPlayer === player_op) ui.enablePlayer(false);
        }
    }
    remoteRedraw() {
        return this.remoteCards(player_op.hand,2,(hand,i) => player_op.deck.swap(hand,hand.cards[i]),null,false,true,"Choose up to 2 cards to redraw");
    }
    async remoteRow(card) {
        const rows = ["close","ranged"];
        const i = await this.ask("Choose a row for " + card.name,rows.map(r=>({label:rowLabels[r],row:guestRowIndex(board.getRow(card,r))})),"row");
        return board.getRow(card,rows[i]);
    }
    finishHost() {
        this.publish();
        this.hostStatus.remove();
        if (dm.dialog.open) dm.dialog.close();
        this.phase = "finished";
        clearInterval(this.sync);
        this.send({t:"finish",result:player_op.health ? "wins" : player_me.health ? "losses" : "draws",
            rounds:game.roundHistory.map(r=>[r.score_op,r.score_me,r.winner?.tag])});
        game.rematch_elem.hidden = game.newGame_elem.hidden = true;
    }
    finishGuest(p) {
        if (!["wins","losses","draws"].includes(p.result) || !Array.isArray(p.rounds) || p.rounds.length < 2 || p.rounds.length > 3) throw Error();
        this.phase = "finished";
        this.view.close();
        if (dm.battleSettings) dm.closeBattleSettings();
        dm.recordResult(p.result);
        const end = game.endScreen, rows = end.querySelectorAll("tr");
        [this.myName,this.peer.name].forEach((name,j) => {
            const cells = rows[j+1].children;
            cells[0].textContent = name;
            for (let i=1;i<=3;i++) {
                cells[i].textContent = p.rounds[i-1]?.[j] ?? 0;
                cells[i].style.color = p.rounds[i-1]?.[2] === (j ? "me" : "op") ? "goldenrod" : "";
            }
        });
        end.children[0].className = {wins:"end-win",losses:"end-lose",draws:"end-draw"}[p.result];
        game.rematch_elem.hidden = game.newGame_elem.hidden = true;
        byId("battle-settings").hidden = true;
        ui.enablePlayer(true);
        AudioManager.playSFX(p.result === "wins" ? "game_win" : "game_lose");
        end.classList.remove("hide");
    }
    leave() { this.reset(""); }
    confirmLeave() {
        if (dm.dialog.open) return;
        byId("detail-content").innerHTML = '<section class="reset-prompt"><h2>Leave this match?</h2><p>Leaving ends this LAN match for both players without recording a result.</p><button data-close autofocus>Resume Match</button><button class="gold" id="leave-lan">Leave Match</button></section>';
        byId("leave-lan").addEventListener("click",()=>this.leave(),{once:true});
        dm.dialog.showModal();
    }
    disconnect(reason) {
        if (this.phase === "finished") { clearInterval(this.heartbeat); return; }
        this.reset(reason || "The connection closed.");
    }
    reset(reason) {
        clearTimeout(this.connectionTimer);
        clearInterval(this.heartbeat);
        clearInterval(this.sync);
        this.bridge?.postMessage("lan:stop");
        if (this.inMatch) {
            this.phase = "leaving";
            if (reason) sessionStorage.setItem("lan-notice",reason + " The match ended without a result.");
            location.reload();
            return;
        }
        this.role = this.phase = this.peer = this.peerDeck = this.localDeck = this.address = null;
        this.notice = reason;
        dm.go(reason ? "multiplayer" : "home");
    }
}

class RemotePlayer {
    async startTurn(player) {
        const options = [], moves = [];
        const add = (option,move) => { options.push(option); moves.push(move); };
        player.hand.cards.forEach((c,hand) => {
            const play = (target,label,move) => add({hand,card:lanCardId(c),label,...target},move);
            if (c.name === "Decoy") {
                for (const r of board.row.slice(0,3)) for (const target of r.cards.filter(x=>x.isUnit())) {
                    play({row:guestRowIndex(r),unit:r.cards.indexOf(target)},"Return " + target.name + " · " + rowLabels[r.type], async () => {
                        await board.toHand(target,r);
                        await player.playCardToRow(c,r);
                    });
                }
            } else if (c.isSpecial() || c.row === "agile") {
                for (const r of board.row.slice(0,3)) {
                    if (c.isSpecial() ? r.special : r.type === "siege") continue;
                    play({row:guestRowIndex(r)},"Play to " + rowLabels[r.type],() => player.playCardToRow(c,r));
                }
            } else if (c.name === "Scorch") play({row:"any"},"Play Scorch",() => player.playScorch(c));
            else {
                const row = c.row === "weather" ? "weather" : guestRowIndex(board.getRow(c,c.row));
                play({row},"Play " + c.name,() => player.playCard(c));
            }
        });
        if (player.leaderAvailable) add({action:"leader",label:"Use leader",card:lanCardId(player.leader)},()=>player.activateLeader());
        add({action:"pass",label:"Pass round"},()=>player.passRound());
        const index = await lan.ask("Your turn",options,"turn");
        await moves[index]();
    }
}

const lan = new LanSession();
