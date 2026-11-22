"use strict";

// The guest draws only its own hand and public zones. Moves are indices into the host's current prompt.
class LanBoard {
    constructor(session) {
        this.session = session;
        this.selectedHand = null;
        dm.elem.classList.add("hide");
        this.main = document.querySelector("main");
        this.main.classList.add("lan-board");
        this.main.classList.remove("noclick");
        byId("battle-settings").hidden = false;
        this.status = document.createElement("div");
        this.status.className = "lan-turn";
        this.status.setAttribute("role","status");
        this.main.append(this.status);
        this.panel = document.createElement("section");
        this.panel.className = "lan-choice";
        this.panel.hidden = true;
        this.panel.setAttribute("role","dialog");
        this.panel.setAttribute("aria-label","Match choices");
        this.main.append(this.panel);
        this.main.addEventListener("click",e => {
            if (!this.session.guestPlaying) return;
            e.stopImmediatePropagation();
            this.click(e.target);
        },true);
        document.addEventListener("keydown",e => {
            if (!this.session.guestPlaying || dm.battleSettings || dm.dialog.open || e.repeat) return;
            if (e.code === "Escape") {
                if (this.selectedHand !== null || this.inspecting) this.dismiss();
                else if (!this.question || this.question.kind === "turn") this.confirmLeave();
            } else if (this.panel.hidden && (e.code === "Space" || e.code === "KeyX")) {
                this.action(e.code === "Space" ? "pass" : "leader",true);
            } else return;
            e.preventDefault();
            e.stopImmediatePropagation();
        },true);
        for (const [tag,name,portrait,faction] of [
            ["me",session.myName,dm.profile.portrait,session.localDeck.faction],
            ["op",session.peer.name,session.peer.portrait,session.peerDeck.faction]
        ]) {
            byId("name-"+tag).textContent = name;
            byId("deck-name-"+tag).textContent = factions[faction].name;
            const avatar = byId("stats-"+tag).querySelector(".profile-img");
            avatar.style.cssText = portraitStyle(playerPortraits.find(p=>p.id === portrait));
            avatar.querySelector("div > div > div").style.backgroundImage = iconURL("deck_shield_"+faction);
            const deck = byId("deck-"+tag);
            deck.innerHTML = '<div class="deck-card"></div><div class="deck-counter center"></div>';
            deck.firstChild.style.backgroundImage = iconURL("deck_back_"+faction,"jpg");
        }
        this.status.textContent = "Dealing cards…";
        AudioManager.playSFX("game_opening");
    }
    cards(elem,entries,hand=false) {
        const signature = JSON.stringify(entries);
        if (elem.dataset.cards === signature) return;
        elem.dataset.cards = signature;
        elem.replaceChildren(...entries.map((entry,i) => {
            const [id,power] = Array.isArray(entry) ? entry : [entry];
            if (!Number.isInteger(id) || !card_dict[id]) throw Error();
            const c = new Card(card_dict[id],null);
            if (Number.isFinite(power) && (c.isUnit() || c.isHero())) c.setPower(power);
            c.elem.dataset.cardId = id;
            if (hand) c.elem.dataset.hand = i;
            return c.elem;
        }));
        if (hand || elem.classList.contains("row-cards"))
            CardContainer.prototype.resizeCardContainer.call({elem},hand ? 11 : 10,.075,hand ? .00225 : .00325);
    }
    update(state) {
        const previous = this.state;
        this.state = state;
        for (const tag of ["me","op"]) {
            const s = state[tag];
            this.cards(byId("leader-"+tag).firstElementChild,[s.leader]);
            byId("leader-"+tag).firstElementChild.classList.toggle("fade",!s.available);
            const active = state.turn === (tag === "me" ? "op" : "me");
            byId("leader-"+tag).lastElementChild.classList.toggle("hide",!s.available || !active);
            byId("stats-"+tag).classList.toggle("current-turn",active);
            byId("score-total-"+tag).classList.toggle("score-leader",s.score > state[tag === "me" ? "op":"me"].score);
            byId("score-total-"+tag).firstElementChild.textContent = s.score;
            byId("hand-count-"+tag).textContent = s.handCount;
            byId("passed-"+tag).classList.toggle("passed",s.passed);
            for (let i=1;i<=2;i++) byId("gem"+i+"-"+tag).classList.toggle("gem-on",s.health >= i);
            const deck = byId("deck-"+tag);
            deck.lastElementChild.textContent = s.deckCount;
            deck.firstElementChild.hidden = !s.deckCount;
            this.cards(byId("grave-"+tag),s.grave.slice(-1));
        }
        this.cards(byId("hand-row"),state.hand,true);
        this.cards(byId("weather"),state.weather);
        state.rows.forEach((r,i) => {
            const row = board.row[i];
            this.cards(row.elem,r.cards);
            this.cards(row.elem_special,r.special === null ? [] : [r.special]);
            row.elem_parent.querySelector(".row-score").textContent = r.total;
            const overlay = row.elem_parent.querySelector(".row-weather");
            overlay.className = "row-weather " + ({close:"frost",ranged:"fog",siege:"rain"}[row.type]);
            overlay.style.opacity = r.weather ? "1" : "0";
        });
        if (previous && previous.turn !== state.turn && state.round) AudioManager.playSFX(state.turn === "op" ? "turn_me" : "turn_op");
        if (this.panel.hidden && (this.selectedHand !== null || this.question?.kind === "row")) this.markTargets();
        this.updateStatus();
    }
    updateStatus() {
        const round = this.state?.round;
        let title = this.question?.title || (round ? (this.state.turn === "me" ? "Waiting for " + this.session.peer.name : "Resolving turn…") : "Preparing hands…");
        if (this.selectedHand !== null) title = this.main.querySelector("[data-lan-move]") ? "Choose a highlighted target" : "No valid target for this card";
        this.status.textContent = (round ? "Round " + round + " · " : "") + title;
        this.main.classList.toggle("lan-my-turn",this.question?.kind === "turn");
    }
    played(p) {
        if (!Number.isInteger(p.card) || !card_dict[p.card]) throw Error();
        const card = card_dict[p.card];
        if (Settings.notifications.isEnabled()) {
            this.lastPlay ||= document.createElement("div");
            this.lastPlay.className = "lan-last-play";
            this.lastPlay.textContent = (p.by === "me" ? this.session.peer.name : this.session.myName) + " played " + card.name;
            this.main.append(this.lastPlay);
            clearTimeout(this.playTimer);
            this.playTimer = setTimeout(()=>this.lastPlay.remove(),2400);
        }
        AudioManager.playSFX(card.row === "leader" ? "leader" : "open");
    }
    prompt(p) {
        if (!Array.isArray(p.options) || !p.options.length || !Number.isSafeInteger(p.id)) throw Error();
        this.question = p;
        this.dismiss();
        this.updateStatus();
    }
    show(title,buttons,card,canClose=false) {
        this.clearTargets();
        this.selectedHand = null;
        const art = Number.isInteger(card) && card_dict[card] ? '<div class="lan-preview"><img src="' + illustrations(card_dict[card]) + '" alt=""><p>' + esc(descFor(card_dict[card])) + '</p></div>' : '';
        this.panel.innerHTML = '<h2>'+esc(title)+'</h2>'+art+'<div class="lan-options">'+buttons.join("")+'</div>'+(canClose ? '<button data-dismiss>Back</button>' : '');
        this.panel.hidden = false;
        this.panel.scrollTop = 0;
        this.panel.querySelector("button")?.focus({preventScroll:true});
    }
    choiceButton(o,i,images) {
        const img = images && Number.isInteger(o.card) && card_dict[o.card] ? '<img src="'+illustrations(card_dict[o.card])+'" alt="">' : '';
        return '<button data-choice="'+i+'">'+img+esc(o.label)+'</button>';
    }
    dismiss() {
        this.inspecting = false;
        this.selectedHand = null;
        this.clearTargets();
        const q = this.question;
        if (q?.kind === "row") { this.panel.hidden = true; this.markTargets(); }
        else if (q && q.kind !== "turn") this.show(q.title,q.options.map((o,i)=>this.choiceButton(o,i,true)));
        else { this.panel.hidden = true; this.main.focus({preventScroll:true}); }
        this.updateStatus();
    }
    clearTargets() {
        for (const elem of this.main.querySelectorAll("[data-lan-move]")) delete elem.dataset.lanMove;
        this.main.querySelector(".lan-selected")?.classList.remove("lan-selected");
    }
    markTargets() {
        this.clearTargets();
        if (this.selectedHand !== null) byId("hand-row").children[this.selectedHand]?.classList.add("lan-selected");
        this.question.options.forEach((o,i) => {
            if (this.question.kind !== "row" && o.hand !== this.selectedHand) return;
            if (o.row === "any") {
                for (const r of board.row) r.elem_parent.dataset.lanMove = i;
                return;
            }
            const r = board.row[o.row];
            const target = o.row === "weather" ? byId("weather") : Number.isInteger(o.unit) ? r?.elem.children[o.unit] : r?.elem_parent;
            if (target) target.dataset.lanMove = i;
        });
    }
    action(name,immediate=false) {
        const q = this.question;
        if (q?.kind !== "turn") return;
        const i = q.options.findIndex(o=>o.action === name);
        if (i < 0) return;
        if (name === "pass" || immediate) this.answer(i);
        else this.select(q.options[i].card,(o)=>o.action === name);
    }
    select(card,filter) {
        this.inspecting = true;
        const buttons = [];
        this.question?.options.forEach((o,i) => { if (filter(o)) buttons.push(this.choiceButton(o,i,false)); });
        this.show(card_dict[card].name,buttons,card,true);
    }
    answer(i) {
        const q = this.question;
        if (!q || !Number.isInteger(i) || !q.options[i]) return;
        this.question = null;
        this.dismiss();
        this.updateStatus();
        this.session.send({t:"answer",id:q.id,index:i});
    }
    confirmLeave() {
        this.inspecting = true;
        this.show("Leave this match?",['<button data-leave>Leave Match</button>'],null,true);
    }
    click(target) {
        const btn = target.closest("button");
        if (btn?.hasAttribute("data-dismiss")) return this.dismiss();
        if (btn?.hasAttribute("data-leave")) return this.session.leave();
        if (btn?.hasAttribute("data-choice")) return this.answer(Number(btn.dataset.choice));
        if (btn?.hasAttribute("data-inspect")) return this.select(Number(btn.dataset.inspect),()=>false);
        if (target.closest("#exit-game")) return this.confirmLeave();
        if (!this.panel.hidden || !this.state) return;
        const move = target.closest("[data-lan-move]");
        if (move) return this.answer(Number(move.dataset.lanMove));
        if (this.question?.kind === "row") return;
        if (target.closest("#pass-button")) return this.action("pass");
        if (target.closest("#leader-me") && this.question?.options.some(o=>o.action === "leader")) return this.action("leader");
        const grave = target.closest(".grave"), card = target.closest("[data-card-id]");
        if (card?.hasAttribute("data-hand") && this.question?.kind === "turn") {
            const hand = Number(card.dataset.hand);
            // Older hosts advertise button choices without board coordinates.
            if (this.question.options.some(o=>o.hand === hand && o.row === undefined))
                return this.select(Number(card.dataset.cardId),o=>o.hand === hand);
            this.selectedHand = this.selectedHand === hand ? null : hand;
            this.markTargets();
            this.updateStatus();
            return;
        }
        if (this.selectedHand !== null) return;
        if (grave) {
            const ids = this.state[grave.id === "grave-me" ? "me" : "op"].grave;
            this.inspecting = true;
            return this.show(ids.length ? "Discard pile" : "Discard pile is empty",ids.map(id=>'<button data-inspect="'+Number(id)+'"><img src="'+illustrations(card_dict[id])+'" alt="">'+esc(card_dict[id].name)+'</button>'),null,true);
        }
        if (card) this.select(Number(card.dataset.cardId),o=>card.hasAttribute("data-hand") && o.hand === Number(card.dataset.hand));
    }
    close() {
        this.clearTargets();
        clearTimeout(this.playTimer);
        this.lastPlay?.remove();
        this.question = null;
        this.panel.remove();
        this.status.remove();
        this.main.classList.remove("lan-board","lan-my-turn");
    }
}
