(async function testAbilities() {
    Settings.soundEffects.disable();
    Settings.notifications.disable();
    sleep = async () => {};
    fade = async (on, elem) => { elem.classList.toggle("hide", !on); elem.style.opacity = on ? "1" : "0"; };
    const same = (actual, expected, name) => {
        if (actual !== expected) throw Error(name + " expected " + expected + ", received " + actual);
    };
    const card = (file, owner = player_me) => new Card(card_dict[cardIndex(file)], owner);
    const add = async (file, owner = player_me) => {
        const c = card(file, owner);
        await board.toRow(c);
        return c;
    };
    game.reset();
    player_me = new Player(0, "Geralt", engineDeck("realms", startingProfile().decks.realms));
    player_op = new Player(1, "AI", opponentDeck(0, "realms"));
    game.setState(GameState.PLAYING);
    const own = board.row[3], foe = board.row[2];
    await add("blue_stripes"); await add("blue_stripes");
    same(own.total, 16, "Tight Bond");
    await add("ciri"); same(own.total, 31, "hero");
    await add("frost"); same(own.total, 19, "hero immunity and frost before bond");
    await own.addCard(card("horn")); same(own.total, 23, "horn with frost and bond");
    await add("clear"); same(own.total, 47, "clear weather");
    await ability_dict.scorch.placed(card("scorch")); same(own.total, 15, "both tied strongest non-heroes scorched");
    for (const file of ["ciri","zoltan","decoy","poor_infantry","scorch","frost"]) player_me.hand.addCard(card(file));
    const spy = await add("stennis");
    same(player_me.hand.cards.length, 8, "spy draws two");
    const hand = player_me.hand;
    same(hand.cards.every((c,i) => c.elem === hand.elem.children[i] && (!i || Card.compare(hand.cards[i-1],c) <= 0)), true, "spy draw keeps data and displayed hand in the same sorted order");
    same(spy.holder, player_op, "spy changes sides");
    same(foe.total, 5, "spy strengthens opponent");
    await board.toHand(spy, foe); await foe.addCard(card("decoy", player_op));
    same(foe.total, 0, "decoy");
    same(player_op.hand.cards.includes(spy), true, "spy in opponent hand");
    await board.toRow(spy, player_op.hand); same(player_op.hand.cards.length, 2, "replayed spy");
    const bod = card("vesemir", player_op);
    player_op.grave.addCard(bod);
    await add("banner_nurse", player_op); same(foe.cards.includes(bod), true, "medic");
    await add("berserker", player_op);
    await foe.addCard(card("mardroeme", player_op));
    same(foe.cards.some(c => c.filename === "vildkaarl"), true, "berserker transforms");
    await add("young_berserker", player_op);
    await add("ermion", player_op);
    same(board.row[1].cards.some(c => c.filename === "young_vildkaarl"), true, "Ermion");
    const cow = await add("cow");
    await board.toGrave(cow, board.row[4]); same(own.cards.some(c => c.filename === "chort"), true, "avenger");
    const muster = card("shield_maiden");
    player_me.hand.addCard(muster);
    await add("cerys"); same(own.cards.includes(muster), true, "Cerys muster");
    await add("storm");
    same(board.row[0].effects.weather && board.row[1].effects.weather && board.row[4].effects.weather && board.row[5].effects.weather, true, "Skellige storm");
    await add("clear");
    const fog = card("fog"); player_me.deck.addCard(fog);
    await ability_dict.foltest_king.activated(player_me.leader); same(board.row[4].effects.weather, true, "Foltest summons fog");
    return "OK: bond, weather, hero immunity, horn, scorch, spy, decoy, medic, berserker, avenger, muster and leader effects";
})()

