(async function testLeaders() {
    const checks = {
        foltest_king: () => weather.types.fog.count === 1,
        foltest_lord: () => !weather.cards.length,
        foltest_siegemaster: () => board.row[0].effects.horn === 1,
        foltest_steelforged: () => board.row[5].cards.length === 0,
        foltest_son: () => board.row[4].cards.length === 0,
        emhyr_imperial: () => weather.types.rain.count === 1,
        emhyr_emperor: () => player_me.hand.cards.length === 3,
        emhyr_whiteflame: () => !player_me.leaderAvailable && !player_op.leaderAvailable,
        emhyr_relentless: () => !player_me.grave.cards.length && player_op.hand.cards.length === 4,
        emhyr_invader: () => game.randomRespawn,
        eredin_commander: () => board.row[2].effects.horn === 1,
        eredin_bringer_of_death: () => !player_op.grave.cards.length && player_op.hand.cards.length === 4,
        eredin_destroyer: () => player_op.hand.cards.length === 2 && player_op.grave.cards.length === 3,
        eredin_king: () => weather.cards.length === 1,
        eredin_treacherous: () => game.doubleSpyPower,
        francesca_queen: () => board.row[3].cards.length === 0,
        francesca_beautiful: () => board.row[1].effects.horn === 1,
        francesca_daisy: () => player_op.hand.cards.length === 4,
        francesca_pureblood: () => weather.types.frost.count === 1,
        francesca_hope: () => board.row[1].cards.some(c=>c.filename==="ida") === false && board.row[1].cards.some(c=>c.filename==="yaevinn"),
        crach_an_craite: () => !player_me.grave.cards.length && !player_op.grave.cards.length,
        king_bran: () => board.row[0].effects.halfWeather && !board.row[5].effects.halfWeather
    };
    for (const leader of card_dict.filter(c => c.row === "leader")) {
        game.reset();
        const testDeck = {faction:leader.deck,leader,cards:["frost","fog","rain","ves"].map(f=>({index:cardIndex(f),count:1}))};
        player_me = new Player(0,"Geralt",engineDeck("realms",startingProfile().decks.realms));
        player_op = new Player(1,"AI",testDeck);
        game.currPlayer = player_op;
        const card = (file,owner) => new Card(card_dict[cardIndex(file)],owner);
        for (const owner of [player_me,player_op]) {
            owner.grave.addCard(card("ves",owner));
            for (const file of ["sabrina","dethmold","siegfried"]) owner.hand.addCard(card(file,owner));
        }
        for (const file of ["ballista","ballista_1","dethmold","dethmold","ves","ves"]) {
            await board.toRow(card(file,player_me));
        }
        if (leader.ability === "foltest_lord") await board.toRow(card("rain",player_me));
        if (leader.ability === "francesca_hope") {
            await board.row[2].addCard(card("yaevinn",player_op));
            await board.toRow(card("frost",player_me));
        }
        game.initPlayers(player_me,player_op);
        await game.runEffects(game.gameStart);
        if (player_op.leader.activated.length) await player_op.leader.activated[0](player_op.leader);
        if (!checks[leader.ability]()) throw Error("Leader failed: "+leader.name);
    }
    // Leader choices must be able to open another carousel and resume the original action.
    game.reset();
    game.currPlayer = player_me;
    const returned = new Card(card_dict[cardIndex("zoltan")],player_op);
    player_op.grave.reset(); player_op.grave.addCard(returned);
    const emhyr = new Card(card_dict.find(c=>c.ability==="emhyr_relentless"),player_me);
    const outer = ui.viewCard(emhyr, () => ability_dict.emhyr_relentless.activated(emhyr));
    const click = {stopPropagation(){}};
    const inner = Carousel.curr.select(click);
    if (Carousel.curr?.container !== player_op.grave) throw Error("Second leader selection did not open");
    await Carousel.curr.select(click);
    await Promise.all([outer,inner]);
    if (!player_me.hand.cards.includes(returned) || Carousel.curr) throw Error("Nested leader selection did not finish");
    return "OK: all 22 leader abilities and a nested player choice";
})()

