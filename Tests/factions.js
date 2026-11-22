(async function testFactions() {
    // These fixtures run in the isolated native test profile after the board cases.
    function check(ok, message) { if (!ok) throw Error(message); }
    function setup(f1, f2, leader1, leader2) {
        game.reset();
        const p = startingProfile();
        for (const [i,c] of card_dict.entries()) p.owned[i] = limit(c);
        const deck = (f,l) => {
            const result = buildDeck(p,f);
            result.leader = cardIndex(l);
            return engineDeck(f,result);
        };
        player_me = new Player(0, "Geralt", deck(f1,leader1));
        player_op = new Player(1, "AI", deck(f2,leader2));
        game.initPlayers(player_me, player_op);
    }
    const add = async (file,owner=player_me) => {
        const c = new Card(card_dict[cardIndex(file)],owner);
        await board.toRow(c); return c;
    };
    setup("monsters","realms","eredin_copper","foltest_copper");
    await add("fiend"); await add("wyvern"); await add("imlerith");
    await game.runEffects(game.roundEnd); await board.clearRound();
    check(board.row.slice(3).flatMap(r=>r.cards).length===1,"Monsters retains one");
    check(!board.row.slice(3).flatMap(r=>r.cards)[0].hero,"Monsters retains ordinary unit");
    game.roundCount=2; game.roundHistory=[{winner:player_op}];
    await game.runEffects(game.roundStart);
    check(player_op.hand.cards.length===1,"Northern Realms winner draw");
    setup("realms","skellige","foltest_copper","king_bran");
    for (const file of ["blueboy","svanrige","holger","hjalmar"]) player_op.grave.addCard(new Card(card_dict[cardIndex(file)],player_op));
    game.roundCount=3; game.roundHistory=[{winner:player_me},{winner:player_op}]; await game.runEffects(game.roundStart);
    check(board.row.slice(0,3).flatMap(r=>r.cards).length===2,"Skellige resurrects two");
    check(player_op.grave.cards.some(c=>c.hero),"Skellige excludes heroes");
    await add("rain");
    check(board.row[0].effects.halfWeather && !board.row[5].effects.halfWeather,"King Bran affects owner only");
    setup("realms","scoiatael","foltest_copper","francesca_copper");
    await game.runEffects(game.gameStart);
    check(!!game.firstPlayer,"Scoia'tael chooses starting player");
    check(player_op.hand.cards.length===1,"Daisy of the Valley draws an extra card");
    setup("realms","nilfgaard","foltest_copper","emhyr_silver");
    check(!player_me.leaderAvailable && !player_op.leaderAvailable,"White Flame disables leaders");
    // Exercise a tied final round with both players on one gem.
    async function finalTie(f1, f2, l1, l2, expected) {
        setup(f1,f2,l1,l2); game.roundCount=2; game.currPlayer=player_me;
        player_me.health=1; player_op.health=1; game.resultRecorded=false;
        await game.endRound(); check(game.roundHistory.at(-1).winner===expected(),"Tie-break for "+f1+"/"+f2);
    }
    await finalTie("realms","nilfgaard","foltest_copper","emhyr_copper",()=>player_op);
    await finalTie("nilfgaard","nilfgaard","emhyr_copper","emhyr_copper",()=>null);
    return "OK: five faction perks, passive leaders, two Nilfgaard tie cases";
})()

