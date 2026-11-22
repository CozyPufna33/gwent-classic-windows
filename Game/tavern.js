"use strict";

const byId = id => document.getElementById(id);
const illustrations = c => "img/lg/" + c.deck + "_" + c.filename + ".jpg";
const crest = faction => "img/icons/deck_shield_" + faction + ".png";
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const rowLabels = {leader:"Leader", close:"Close combat", ranged:"Ranged combat", siege:"Siege", agile:"Agile"};
const labelFor = c => rowLabels[c.row] || (c.deck === "weather" ? "Weather" : "Special card");
const opponentNames = ["Innkeeper", "Merchant", "Tournament Master"];
const difficultyNotes = ["A modest deck and a forgiving opponent.", "A balanced deck and a more tactical opponent.", "A tournament deck built around powerful combinations."];
const catalogue = card_dict.map((c,i) => ({c,i})).filter(({c}) => limit(c) > 0);
const collectionName = house => house === "all" ? "All cards" : house === "neutral" ? "Neutral" : factions[house].name;
const descFor = c => c.ability.split(" ").map(a => ability_dict[a]?.description).filter(Boolean).join(" ") || "A unit with no additional ability.";
const deckGroup = c => special(c) ? 2 : c.ability.split(" ").includes("hero") ? 0 : 1;
const rankCards = (a,b) => deckGroup(a.c) - deckGroup(b.c) || Number(b.c.strength) - Number(a.c.strength) || a.c.name.localeCompare(b.c.name) || a.i - b.i;
const portraitStyle = p => `background-image:url('img/sm/${p.art}.jpg');background-position:${p.x}% ${p.y}%`;

class Tavern {
    constructor() {
        this.userName = localStorage.getItem(activeNameKey) || "";
        this.profile = readProfile(profileKey(this.userName));
        this.page = lan.notice ? "multiplayer" : "home";
        this.filter = "all";
        this.collectionHouse = "all";
        this.battleSettings = false;
        document.documentElement.style.setProperty("--card-travel", this.profile.animationMs + "ms");
        this.elem = byId("deck-customization");
        this.elem.addEventListener("click", e => this.click(e));
        this.elem.addEventListener("submit", e => {
            if (e.target.id !== "profile-form") return;
            e.preventDefault();
            this.switchProfile(byId("user-name").value);
        });
        this.elem.addEventListener("change", e => {
            if (e.target.id === "display-mode") this.setDisplayMode(e.target.value);
            if (e.target.id === "opponent-faction") {
                this.profile.opponentFaction = e.target.value;
                this.save();
            }
            if (e.target.id === "collection-faction") {
                this.collectionHouse = e.target.value;
                this.render();
            }
        });
        this.elem.addEventListener("input", e => {
            if (e.target.dataset.volume) {
                const key = e.target.dataset.volume;
                this.profile.volumes[key] = e.target.valueAsNumber;
                byId("value-" + key).value = e.target.value + "%";
                applyAudioLevels();
                this.save();
                return;
            }
            if (e.target.id !== "animation-speed") return;
            this.profile.animationMs = e.target.valueAsNumber;
            const duration = this.profile.animationMs + " ms";
            byId("animation-value").value = duration;
            e.target.setAttribute("aria-valuetext", duration);
            document.documentElement.style.setProperty("--card-travel", this.profile.animationMs + "ms");
            this.save();
        });
        this.dialog = byId("detail");
        this.rewardDialog = byId("victory-reward");
        this.rewardDialog.addEventListener("cancel", e => e.preventDefault());
        this.rewardDialog.addEventListener("click", e => {
            const button = e.target.closest("[data-reward]");
            if (!button) return;
            const i = Number(button.dataset.reward);
            const next = {...this.profile, owned:{...this.profile.owned}};
            if (!claimReward(next,i)) return;
            this.save(next);
            this.rewardDialog.close();
            const c = card_dict[i];
            byId("match-reward").innerHTML = `<img src="${illustrations(c)}" alt=""><div><small>CARD WON</small><strong>${esc(c.name)}</strong><span>${next.owned[i]} / ${limit(c)} owned</span></div>`;
            if (!this.elem.classList.contains("hide")) this.render();
        });
        this.dialog.addEventListener("click", e => {
            if (e.target.closest("[data-load-cards]")) {
                const name = byId("collection-file").value;
                this.dialog.close();
                this.transferCards("read", name);
                return;
            }
            if (e.target.closest("[data-reset-confirm]")) {
                this.dialog.close();
                this.profile = startingProfile();
                Settings.music.enable();
                Settings.soundEffects.enable();
                Settings.notifications.enable();
                this.filter = this.collectionHouse = "all";
                document.documentElement.style.setProperty("--card-travel", this.profile.animationMs + "ms");
                applyAudioLevels();
                playMusic();
                this.setDisplayMode(this.profile.displayMode);
                this.go("decks");
                return;
            }
            const choice = e.target.closest("[data-leader]");
            if (choice) {
                const i = Number(choice.dataset.leader);
                if (!factionProgress(this.profile,this.faction).leaders.includes(i)) return;
                const deck = this.deck;
                deck.leader = i;
                this.profile.decks[this.faction] = deck;
                this.save();
                this.dialog.close();
                this.render();
            } else if (e.target === this.dialog || e.target.closest("[data-close]")) {
                this.dialog.close();
            }
        });
        document.addEventListener("keydown", e => {
            if (this.rewardDialog.open) return;
            if (e.key === "Enter" && e.target.id === "lan-ip" && !lan.role) {
                e.preventDefault();
                lan.lobbyAction("join");
                return;
            }
            if (e.key === "Escape" && !this.dialog.open && !this.elem.classList.contains("hide") && this.page !== "home") {
                e.preventDefault();
                if (this.battleSettings) this.closeBattleSettings();
                else if (lan.role && this.page === "decks") this.go("multiplayer");
                else if (lan.role) lan.leave();
                else this.go("home");
            }
        });
        EventManager.customizationOpened.bind(event => this.go(event.detail.page));
        this.render();
        this.showRewardOffer();
    }
    save(profile = this.profile) {
        localStorage.setItem(profileKey(this.userName), JSON.stringify(profile));
        this.profile = profile;
    }
    switchProfile(input) {
        const name = input.trim().normalize("NFC");
        if (!name || name.length > 32 || /[\u0000-\u001f\u007f]/.test(name)) {
            byId("profile-status").textContent = "Enter a name of 1–32 characters.";
            return;
        }
        const existing = profileNames().find(n => n.toLowerCase() === name.toLowerCase());
        const next = existing || name;
        if (this.userName === next) { byId("user-name").value = next; return; }
        try {
            if (!existing) {
                localStorage.setItem(profileKey(next), JSON.stringify(this.userName ? startingProfile() : this.profile));
                if (!this.userName) {
                    for (const option of [Settings.music, Settings.notifications, Settings.soundEffects]) {
                        localStorage.setItem(option.key + "/" + next, String(option.isEnabled()));
                    }
                }
            }
            localStorage.setItem(activeNameKey, next);
            location.reload();
        } catch {
            byId("profile-status").textContent = "The profile could not be saved.";
        }
    }
    async transferCards(action, name = "") {
        const status = byId("transfer-status");
        if (!status || this.transferPending) return;
        this.transferPending = true;
        try {
            const host = window.chrome?.webview;
            if (!host) throw Error("Open Gwent.exe to use the Cards folder.");
            const id = crypto.randomUUID();
            const request = {id, action, name};
            if (action === "export") {
                request.name = this.userName || "Player";
                request.content = JSON.stringify(exportCollection(this.profile, this.userName), null, 2);
            }
            const result = await new Promise((resolve, reject) => {
                const receive = e => {
                    if (e.data?.id !== id) return;
                    clean();
                    if (e.data.error) reject(Error(e.data.error)); else resolve(e.data.result);
                };
                const clean = () => { clearTimeout(timer); host.removeEventListener("message", receive); };
                const timer = setTimeout(() => { clean(); reject(Error("The game did not respond.")); }, 8000);
                host.addEventListener("message", receive);
                try { host.postMessage("cards:" + JSON.stringify(request)); }
                catch (error) { clean(); reject(error); }
            });
            if (!status.isConnected) return;
            if (action === "list") {
                if (!result.length) { status.textContent = "No collections found. Put an exported JSON file in the Cards folder."; return; }
                byId("detail-content").innerHTML = '<section class="import-prompt"><h2>Import Cards</h2><label for="collection-file">Collection in the Cards folder</label><select id="collection-file"></select><p>Import missing copies into your active collection. Existing cards and decks are kept.</p><button data-close>Cancel</button><button class="gold" data-load-cards>Import</button></section>';
                for (const file of result) byId("collection-file").add(new Option(file, file));
                this.dialog.showModal();
            } else if (action === "export") {
                status.textContent = "Saved to Cards/" + result;
            } else {
                let backup;
                try { backup = JSON.parse(result); } catch { throw Error("This file does not contain a valid collection."); }
                const before = this.totalOwned;
                const merged = mergeCollection(this.profile, backup);
                localStorage.setItem(profileKey(this.userName), JSON.stringify(merged));
                this.profile = merged;
                this.render();
                const added = this.totalOwned - before;
                byId("transfer-status").textContent = added ? "Imported " + added + (added === 1 ? " card copy." : " card copies.") : "You already own every copy in this file.";
            }
        } catch (error) {
            status.textContent = error.message;
        } finally {
            this.transferPending = false;
        }
    }
    setDisplayMode(mode) {
        if (!Object.hasOwn(displayModes, mode)) return;
        this.profile.displayMode = mode;
        this.save();
        window.chrome?.webview?.postMessage("display:" + mode);
        if (byId("display-mode")) byId("display-mode").value = mode;
    }
    openBattleSettings() {
        if ((!game.isPlaying() && !lan.guestPlaying) || this.battleSettings) return;
        this.battleSettings = true;
        document.querySelector("main").inert = true;
        this.elem.classList.remove("hide");
        this.go("settings");
        this.elem.querySelector(".back").focus();
    }
    closeBattleSettings() {
        this.battleSettings = false;
        this.elem.classList.add("hide");
        document.querySelector("main").inert = false;
        if (Carousel.curr) Carousel.curr.previews[2].focus();
        else document.querySelector("main").focus({preventScroll:true});
    }
    get faction() { return this.profile.faction; }
    get deck() { return buildDeck(this.profile,this.faction); }
    get totalOwned() { return Object.values(this.profile.owned).reduce((sum,n) => sum + n, 0); }
    playable(deck = this.deck) {
        const s = deckStats(deck.cards);
        return deck.leader !== undefined && s.units >= 22 && s.specials <= 10;
    }
    go(page) { this.page = page; this.render(); }
    render() {
        const views = {home:()=>this.home(), multiplayer:()=>lan.menu(this), decks:()=>this.decks(), settings:()=>this.settings(), cards:()=>this.cards(), rules:()=>this.rules()};
        this.elem.dataset.screen = this.page;
        this.elem.innerHTML = views[this.page]();
    }
    header(title) {
        const back = this.battleSettings ? '<button class="back" data-resume>‹ &nbsp; Resume Match</button>' : lan.role && this.page === "decks" ? '<button class="back" data-page="multiplayer">‹ &nbsp; LAN Lobby</button>' : '<button class="back" data-page="home">‹ &nbsp; Main Menu</button>';
        return `<header class="screen-header">${back}<h1>${title}</h1><span class="record"><img src="img/icons/deck_stats_count.png" alt="">${this.totalOwned} / ${catalogueTotal}</span></header>`;
    }
    home() {
        return `<div class="title-stage">
            <form id="profile-form"><label for="user-name">User Name</label><div><input id="user-name" type="text" maxlength="32" required autocomplete="off" list="profile-names" placeholder="Enter your name" value="${esc(this.userName)}"><datalist id="profile-names">${profileNames().map(n=>`<option value="${esc(n)}"></option>`).join("")}</datalist><button class="gold" type="submit">Save</button></div><small role="status" id="profile-status"></small></form>
            <section class="title-menu"><div class="game-title"><h1>GWENT</h1><p>The Witcher 3 <span>◆</span> Wild Hunt</p></div>
            <nav aria-label="Main menu"><button class="primary-menu" data-page="decks">New Game</button><button data-new-start>New Start</button><button data-page="multiplayer">Multiplayer</button><button data-page="cards">Cards</button><button data-page="settings">Settings</button><button data-page="rules">How to Play</button><button data-exit>Exit Game</button></nav></section>
            <div class="tableau" aria-hidden="true"><img src="img/lg/neutral_yennefer.jpg" alt=""><img src="img/lg/neutral_ciri.jpg" alt=""><img src="img/lg/neutral_geralt.jpg" alt=""></div>
            <footer class="home-footer"><span>${this.profile.wins} wins <b>·</b> ${this.totalOwned} / ${catalogueTotal} cards</span></footer></div>`;
    }
    cardButton(i, action, count, disabled = false) {
        const c = card_dict[i];
        const verb = action === "plus" ? "Add" : "Remove";
        return `<button class="deck-card-tile" data-${action}="${i}" aria-label="${verb} ${esc(c.name)}" title="${verb} one copy of ${esc(c.name)}" ${disabled ? "disabled":""}><img src="${illustrations(c)}" alt="${esc(c.name)}"><span class="copies">×${count}</span></button>`;
    }
    decks() {
        const deck = this.deck, s = deckStats(deck.cards);
        const cards = cardsFor(this.faction).filter(({c,i}) => c.row !== "leader" && this.profile.owned[i]).sort(rankCards);
        const bank = [], included = [];
        let heroes = 0;
        for (const {c,i} of cards) {
            const n = deck.cards[i] || 0, spare = this.profile.owned[i] - n;
            if (spare) bank.push(this.cardButton(i,"plus",spare,special(c) && s.specials >= 10));
            if (n) included.push(this.cardButton(i,"minus",n));
            if (c.ability.split(" ").includes("hero")) heroes += n;
        }
        const leader = card_dict[deck.leader];
        const stat = (icon,label,value,bad=false) => `<div class="deck-stat"><img src="img/icons/deck_stats_${icon}.png" alt=""><dt>${label}</dt><dd ${bad ? 'class="shortfall"':''}>${value}</dd></div>`;
        const column = (title,count,tiles,id,empty) => `<section class="card-pane"><h2>${title} <small>${count}</small></h2><div id="${id}" class="pane-scroll">${tiles.length ? '<div class="deck-grid">'+tiles.join("")+'</div>' : '<div class="empty-pane">'+empty+'</div>'}</div></section>`;
        return this.header("Deck Builder") + `<div class="faction-heading">
            <button class="arrow" data-cycle="-1" aria-label="Previous faction">‹</button><div><img src="${crest(this.faction)}" alt=""><h2>${factions[this.faction].name}</h2></div><button class="arrow" data-cycle="1" aria-label="Next faction">›</button>
            <p>${factions[this.faction].description}</p></div>
            <div class="deck-workspace">
            ${column("Card Collection",cards.reduce((n,{i})=>n+this.profile.owned[i]-(deck.cards[i]||0),0),bank,"reserve",cards.length ? "All available cards are in your deck." : "Win matches to collect cards for this faction.")}
            <aside class="commander"><h2>Leader</h2><button class="leader-picker" data-leaders title="Change leader">${leader ? '<img src="'+illustrations(leader)+'" alt="'+esc(leader.name)+'">' : '<span>No leader owned</span>'}</button>
            <button class="text-action" data-leaders>Change Leader</button>
            <dl>${stat("count","Total cards",s.units+s.specials)}${stat("unit","Unit cards",s.units+" / 22",s.units<22)}${stat("special","Special cards",s.specials+" / 10",s.specials>10)}${stat("strength","Unit strength",s.strength)}${stat("hero","Hero cards",heroes)}</dl></aside>
            ${column("Cards in Deck",s.units+s.specials,included,"equipped","Select cards from your collection to build this deck.")}</div>
            <footer class="action-bar"><p>${this.playable(deck) ? "Select a card to move one copy between panels." : "Select a leader and at least 22 unit cards. Up to 10 special cards are allowed."}</p><button class="gold" id="start-game" ${this.playable(deck) ? "" : "disabled"}>${lan.role ? "Ready" : "Start Match"} &nbsp; ›</button></footer>`;
    }
    settings() {
        const p = this.profile;
        const soundSwitch = (key, label, enabled) => `<button class="sound-switch" data-${key} aria-label="${label}" aria-pressed="${enabled}"><span>${label}</span><strong>${enabled ? "On" : "Off"}</strong></button>`;
        const volume = (key, label) => `<div class="volume-control"><label for="volume-${key}">${label}</label><input type="range" id="volume-${key}" data-volume="${key}" min="0" max="100" value="${p.volumes[key]}"><output id="value-${key}" for="volume-${key}">${p.volumes[key]}%</output></div>`;
        const display = `<section class="display-settings"><h2>Display</h2><label for="display-mode">Window mode</label><select id="display-mode">${Object.entries(displayModes).map(([id, name]) => `<option value="${id}" ${id === p.displayMode ? "selected" : ""}>${name}</option>`).join("")}</select>${soundSwitch("messages","Game messages",Settings.notifications.isEnabled())}</section>`;
        return this.header("Settings") + `<div class="settings-scroll"><div class="settings-layout">
            <div><section><h2>Player portrait</h2><div class="portrait-grid">${playerPortraits.map(person => `<button data-portrait="${person.id}" aria-pressed="${p.portrait === person.id}"><span class="character-portrait" style="${portraitStyle(person)}"></span>${person.name}</button>`).join("")}</div></section>${display}</div>
            <div class="settings-options"><section><h2>Audio</h2>${volume("master","Master volume")}${volume("music","Music volume")}${volume("effects","Sound effects volume")}<div class="audio-options">${soundSwitch("music","Music",Settings.music.isEnabled())}${soundSwitch("sound","Sound effects",Settings.soundEffects.isEnabled())}</div></section>
            <section><h2>Animations</h2><div class="speed-label"><label for="animation-speed">Card movement</label><output id="animation-value" for="animation-speed">${p.animationMs} ms</output></div>
            <input type="range" id="animation-speed" min="100" max="500" step="50" value="${p.animationMs}" aria-valuetext="${p.animationMs} ms"><div class="speed-ends"><span>Faster · 100 ms</span><span>Slower · 500 ms</span></div></section>
            <section ${this.battleSettings ? 'hidden' : ''}><h2>Opponent</h2><label for="opponent-faction">Deck</label><select id="opponent-faction"><option value="random">Random faction</option>${houses.map(f=>`<option value="${f}" ${p.opponentFaction===f ? "selected":""}>${factions[f].name}</option>`).join("")}</select>
            <h3>Difficulty</h3><div class="tabs">${levels.map((l,i)=>`<button data-level="${i}" aria-pressed="${p.difficulty===i}">${l}</button>`).join("")}</div><p class="difficulty-note">${difficultyNotes[p.difficulty]}</p></section></div></div></div>`;
    }
    collectionBar(house, cards) {
        let owned = 0, total = 0;
        for (const {c,i} of cards) {
            owned += this.profile.owned[i] || 0;
            total += limit(c);
        }
        const name = esc(collectionName(house));
        const percent = Number((100 * owned / total).toFixed(1)) + "%";
        return `<div class="collection-bar" data-house="${house}"><strong>${name}</strong><span>${owned === total ? "Complete · " : ""}${percent}</span>
            <progress aria-label="${name}" aria-valuetext="${owned} of ${total} copies, ${percent}" value="${owned}" max="${total}"></progress><small>${owned} / ${total}</small></div>`;
    }
    cards() {
        const pool = catalogue.filter(({c}) => this.collectionHouse === "all" || houseOf(c) === this.collectionHouse);
        const groups = ["all",...houses,"neutral"];
        const bars = this.collectionHouse === "all"
            ? groups.map(house => this.collectionBar(house, house === "all" ? pool : pool.filter(({c})=>houseOf(c) === house))).join("")
            : this.collectionBar(this.collectionHouse,pool);
        const matches = pool.filter(({c,i}) => {
            const n = this.profile.owned[i] || 0;
            return this.filter === "owned" ? n > 0 : this.filter === "missing" ? n < limit(c) : true;
        }).sort((a,b)=>a.c.name.localeCompare(b.c.name) || a.i-b.i);
        return this.header("Cards") + `<div class="archive-toolbar"><div class="tabs">${["all","owned","missing"].map(f=>`<button data-filter="${f}" aria-pressed="${this.filter===f}">${f[0].toUpperCase()+f.slice(1)}</button>`).join("")}</div>
            <div class="collection-actions"><button data-transfer="list">Import Cards</button><button data-transfer="export">Export Cards</button><select id="collection-faction" aria-label="Filter by faction">${groups.map(f=>`<option value="${f}" ${this.collectionHouse===f ? "selected":""}>${esc(collectionName(f))}</option>`).join("")}</select></div></div><div id="transfer-status" role="status"></div>
            <section class="collection-progress" aria-label="Collection progress">${bars}</section>
            <div class="archive-scroll"><div class="archive-grid">${matches.map(({c,i})=>{
                const n = this.profile.owned[i] || 0;
                return `<button class="archive-card ${n ? "" : "unowned"}" data-detail="${i}"><img loading="lazy" src="${illustrations(c)}" alt=""><strong>${esc(c.name)}</strong><small>${n} / ${limit(c)} owned</small></button>`;
            }).join("")}</div>${matches.length ? "" : '<p class="empty-pane">No cards match this filter.</p>'}</div>`;
    }
    rules() {
        return this.header("How to Play") + `<article class="rules">
          <section><h2>Build your deck</h2><p>Choose a faction and one leader. Include at least 22 unit cards and up to 10 special cards. Neutral cards can be used in every faction’s deck.</p></section>
          <section><h2>Play a turn</h2><p>Draw ten cards and exchange up to two before the first round. Select a card in your hand, then its highlighted row or target. Press <kbd>X</kbd> on your turn to use your available leader ability.</p></section>
          <section><h2>Win the match</h2><p>Press <kbd>Space</kbd> or click Pass to stop playing for the round. Once both sides pass, the side with fewer points loses a gem. A tie costs both sides a gem unless exactly one side is Nilfgaard. Your hand carries over. Losing both gems ends the match.</p></section>
          <section><h2>Collect cards</h2><p>After a victory, choose one of up to three cards to add to your collection. Your first offer includes Zoltan if you still need him.</p></section></article>`;
    }
    openLeaders() {
        const options = cardsFor(this.faction).filter(({c})=>c.row==="leader");
        byId("detail-content").innerHTML = `<section class="leader-dialog"><header><h2>Choose Leader</h2><button data-close>Close</button></header><div>${options.map(({c,i})=>`<button data-leader="${i}" ${this.profile.owned[i] ? "" : "disabled"}><img src="${illustrations(c)}" alt=""><strong>${esc(c.name)}</strong><small>${this.deck.leader===i ? "Selected" : this.profile.owned[i] ? "Owned" : "Missing"}</small><p>${descFor(c)}</p></button>`).join("")}</div></section>`;
        this.dialog.showModal();
    }
    detail(i) {
        const c = card_dict[i], n = this.profile.owned[i] || 0, house = houseOf(c);
        byId("detail-content").innerHTML = `<div class="card-detail"><img src="${illustrations(c)}" alt=""><section><small>${house==="neutral" ? "Neutral" : factions[house].name} · ${labelFor(c)}</small><h2>${esc(c.name)}</h2><p>${descFor(c)}</p><p>${n} of ${limit(c)} owned · ${limit(c)-n} missing</p><button data-close class="gold">Close</button></section></div>`;
        this.dialog.showModal();
    }
    moveCard(i, adding) {
        const deck = this.deck, c = card_dict[i], n = deck.cards[i] || 0;
        if (!c || !compatible(c,this.faction) || c.row === "leader") return;
        if (adding ? n >= (this.profile.owned[i] || 0) || (special(c) && deckStats(deck.cards).specials >= 10) : n <= 0) return;
        const panes = ["reserve","equipped"].map(id => [id,byId(id).scrollTop]);
        deck.cards[i] = n + (adding ? 1 : -1);
        this.profile.decks[this.faction] = deck;
        this.save();
        this.render();
        for (const [id,top] of panes) byId(id).scrollTop = top;
    }
    click(event) {
        const b = event.target.closest("button");
        if (!b || b.disabled) return;
        const d = b.dataset;
        if (d.lan) return lan.lobbyAction(d.lan);
        if (d.page === "home" && lan.role) { lan.leave(); return; }
        if (b.type === "submit" && b.form?.id === "profile-form") return;
        if (d.transfer) return this.transferCards(d.transfer);
        if (d.resume !== undefined) return this.closeBattleSettings();
        if (d.exit !== undefined) { window.chrome?.webview?.postMessage("exit-game"); return; }
        if (d.newStart !== undefined) {
            byId("detail-content").innerHTML = '<section class="reset-prompt"><h2>Start over?</h2><p>Your collection, decks, match record and settings will be reset. You will begin again with the Northern Realms starter deck.</p><button data-close autofocus>Cancel</button><button class="gold" data-reset-confirm>Reset and Start</button></section>';
            this.dialog.showModal();
            return;
        }
        if (d.page) { this.go(d.page); return; }
        if (d.detail !== undefined) return this.detail(Number(d.detail));
        if (d.leaders !== undefined) return this.openLeaders();
        if (d.plus !== undefined || d.minus !== undefined) return this.moveCard(Number(d.plus ?? d.minus),d.plus !== undefined);
        if (b.id === "start-game") return lan.role ? lan.ready() : this.startNewGame();
        if (d.cycle) this.profile.faction = houses[(houses.indexOf(this.faction)+Number(d.cycle)+houses.length)%houses.length];
        else if (d.level !== undefined) this.profile.difficulty = Number(d.level);
        else if (d.portrait) {
            this.profile.portrait = d.portrait;
            if (this.battleSettings && !lan.role) this.applyPortrait();
        }
        else if (d.filter) { this.filter = d.filter; this.render(); return; }
        else if (d.music !== undefined) { Settings.music.toggle(); playMusic(); }
        else if (d.sound !== undefined) { Settings.soundEffects.toggle(); applyAudioLevels(); }
        else if (d.messages !== undefined) Settings.notifications.toggle();
        this.save();
        if (d.portrait || d.level !== undefined) {
            for (const choice of b.parentElement.children) choice.setAttribute("aria-pressed", choice === b);
            if (d.level !== undefined) this.elem.querySelector(".difficulty-note").textContent = difficultyNotes[this.profile.difficulty];
        } else if (d.music !== undefined || d.sound !== undefined || d.messages !== undefined) {
            const enabled = (d.messages !== undefined ? Settings.notifications : d.music !== undefined ? Settings.music : Settings.soundEffects).isEnabled();
            b.setAttribute("aria-pressed", enabled);
            b.querySelector("strong").textContent = enabled ? "On" : "Off";
        } else this.render();
    }
    constructOpponentDeck() { return opponentDeck(this.profile.difficulty,this.profile.opponentFaction); }
    applyPortrait(name = this.userName) {
        const portrait = playerPortraits.find(person => person.id === this.profile.portrait);
        const avatar = document.querySelector("#stats-me .profile-img");
        avatar.style.cssText = portraitStyle(portrait);
        avatar.setAttribute("aria-label", portrait.name);
        avatar.setAttribute("role", "img");
        player_me.name = name || portrait.name;
        byId("name-me").textContent = player_me.name;
    }
    startNewGame() {
        const deck = this.deck;
        if (!this.playable(deck)) return;
        player_me = new Player(0,"",engineDeck(this.faction,deck));
        this.applyPortrait();
        player_op = new Player(1,opponentNames[this.profile.difficulty],this.constructOpponentDeck());
        this.elem.classList.add("hide");
        game.startGame();
    }
    finish() {
        if (this.battleSettings) this.closeBattleSettings();
        const result = player_me.health === 0 ? (player_op.health === 0 ? "draws":"losses") : "wins";
        this.recordResult(result);
    }
    recordResult(result) {
        const next = {...this.profile, pendingReward:[...this.profile.pendingReward]};
        awardResult(next,result);
        this.save(next);
        byId("match-reward").textContent = result === "wins" && !next.pendingReward.length ? "Collection complete." : "";
        this.showRewardOffer();
    }
    showRewardOffer() {
        if (!this.profile.pendingReward.length) return;
        byId("reward-options").innerHTML = this.profile.pendingReward.map(i => {
            const c = card_dict[i], faction = factions[houseOf(c)]?.name || "Neutral";
            const type = labelFor(c) + (special(c) || c.row === "leader" ? "" : " · " + c.strength + " strength");
            return `<button type="button" data-reward="${i}" title="${esc(descFor(c))}"><img src="${illustrations(c)}" alt=""><strong>${esc(c.name)}</strong><span>${type}</span><span>${esc(faction)} · ${this.profile.owned[i] || 0} / ${limit(c)} owned</span></button>`;
        }).join("");
        this.rewardDialog.showModal();
    }
}

