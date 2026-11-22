# Gwent for Windows

Double-click **Gwent.exe** to play. Choose **New Game**, select or edit your deck, then click **Start Match**. To choose the opposing deck and difficulty, open **Settings** from the main menu. The game runs offline on 64-bit Windows with the Microsoft Edge WebView2 Runtime. Card illustrations, effects and four music tracks are included.

## LAN multiplayer

Copy `Gwent.exe`, `Gwent.exe.config`, and the `Game` and `Native` folders to the second Windows computer. Launch the same game version on both computers and select a User Name on each. Each installation creates its own `Profil` folder. To bring a collection across, copy its exported file into `Cards` and import it from the game.

1. Connect both computers to the same home network over Wi-Fi or Ethernet.
2. On the first computer, choose **Multiplayer → Host LAN Game**. Give the other player the IPv4 address shown. If multiple addresses appear, use the one for your home Wi-Fi or Ethernet adapter.
3. On the second computer, choose **Multiplayer**, enter the host address, then click **Join LAN Game**.
4. Both computers open the deck builder once they exchange player profiles. Edit your deck and click **Ready**. The match starts when both players are ready.

If the connection times out, check that the host lobby is open and Windows Firewall allows Gwent on the private home network (TCP port 47823). A router’s guest Wi-Fi may isolate devices. Completed matches update both local profiles, and the winner receives the usual collection reward. Leaving or losing the connection during a match ends it without recording a result.

## Playing and collecting cards

Enter a **User Name** in the upper-right corner of the main menu and click **Save** or press Enter. The first name takes over your existing progress. Each additional name starts a separate profile. Enter a saved name to switch back. The game remembers the active name when you close it.

In **Cards**, select **Export Cards** to save all owned cards and their copy counts to a dated JSON file in the **Cards** folder beside **Gwent.exe**. To transfer a collection, select the destination profile, open **Cards → Import Cards**, choose the file and click **Import**. For another computer, copy the JSON into its **Cards** folder first. Import keeps the higher owned count for each card, so repeated imports preserve copy limits. Deck lists, settings and match results belong to the destination profile.

- Use **Previous** and **Next**, the left and right arrow keys, or the mouse wheel to browse your opening hand. The counter shows your position. Click the centre card to exchange it, up to twice, or click **Done** to keep the rest. The same controls let you choose a card from a discard pile.
- On your turn, select a card from your hand and click the highlighted row or target. Special and weather cards appear on the left, followed by units from weakest to strongest. Click your leader to inspect its ability, or press **X** to activate it. Press **Space** or click **Pass** to end your turns for the current round.
- In **Deck Builder**, use the arrows beside the faction name to switch decks. Click a card on the left to add one copy, or one on the right to remove a copy. Click the leader to change it. A legal deck needs one leader, at least 22 unit cards and at most 10 special cards.
- Open **Cards** from the main menu to browse the catalogue. **Owned** shows cards you have, and **Missing** includes cards for which you still need a copy. Filter by faction or click any card to inspect it.
- Your starting deck contains Foltest – King of Temeria, 22 Northern Realms units and six weather cards. After a solo or LAN victory, choose one of three cards. The first offer includes Zoltan if you still need him. Each random slot draws a reward group, then an eligible card from that group. When all groups are eligible, Northern Realms has a 30% chance, Nilfgaard, Monsters, Scoia’tael and neutral cards have 15% each, and Skellige has 10%. Near completion you may see only one or two choices. Unclaimed offers are saved with your profile. Wins continue to count after the collection is complete.
- Within the selected reward group, each special or weather card you have yet to find has twice the draw weight of an ordinary card. Additional copies of special and weather cards have 1.5 times the ordinary weight, up to their collection limit.
- Neutral cards are available to each faction. If you own one Decoy, each deck can include one. Once you own all three copies, each deck can include three. Mardroeme belongs to Skellige. All factions can use Skellige Storm.
- A faction becomes playable once you own its leader and enough units. Neutral units count toward the minimum of 22. You can browse locked factions at any time.
- **Easy**, **Normal** and **Hard** change the opposing deck and how often the AI chooses a tactically favourable move. All three use the same scoring, starting hand size and victory rewards.
- Open **Settings** from the main menu or the gear beside your leader. Set master, music and sound effects volume, toggle game messages, choose a portrait or adjust animation speed. Card movement defaults to 250 ms and ranges from 100 to 500 ms in 50 ms steps. The game starts in fullscreen by default. **Windowed** uses a resizable window, and **Windowed borderless** fills the desktop work area. Settings are saved automatically. **F11** switches between fullscreen and windowed.
- **New Game** uses your current collection. **New Start** asks for confirmation before resetting your collection, decks, results and settings and opening the starter deck. **Exit Game** closes the application.

Your collection, decks and results are saved automatically in the **Profil** subfolder. To transfer your progress, close the game and copy the entire game folder. An active match ends when you close the game.

## Card catalogue

The catalogue includes the base minigame, Hearts of Stone, Blood and Wine and the next-generation edition's Roach card. There are **255 collectible copies**, including 22 leaders. The totals count duplicate copies and distinct illustrated variants. Bovine Defense Force, Hemdall and the two transformed Vildkaarl units appear through card effects.

| Affiliation | Collectible copies including leaders | Leaders |
| --- | ---: | ---: |
| Northern Realms | 43 | 5 |
| Nilfgaardian Empire | 42 | 5 |
| Monsters | 46 | 5 |
| Scoia’tael | 43 | 5 |
| Skellige | 40 | 2 |
| Neutral, including shared special and weather cards | 41 | 0 |

## Sources and credits

- Round rules, deck construction, turns, unit abilities and special cards follow the [official CD PROJEKT RED manual](https://cdn-l-thewitcher.cdprojektred.com/media/TW3/Pdf/GwentManuals/en-Manual-Gwent-ONLINE.pdf).
- The catalogue includes all three copies of Clan Brokvar Archer and the next-generation Roach reward. [Individual card checklist](https://gwentcards.github.io/) · [Complete Edition checklist](https://primagames.com/eguides/the-witcher-3-wild-hunt-the-complete-edition-guide/gwent/complete-card-checklist-chart) · [The Witcher 3 rewards](https://www.thewitcher.com/us/en/my-rewards)
- Published starting decks vary. This version uses the recorded starter with one Ballista, two Blue Stripes Commando, two Poor Fucking Infantry and six weather cards. Other factions' leaders enter the reward pool so that only Northern Realms starts unlocked. [Starter deck research](https://gwentcards.com/archive.html) · [White Orchard and Zoltan](https://www.gamerguides.com/the-witcher-3-wild-hunt/guide/gwent/card-locations/gwent-in-white-orchard)
- This unofficial fan adaptation uses the board, illustrations, underlying game logic and effects from Arun Sundaram's Gwent Classic. Its licence is included in Game/LICENSE. The Witcher, Gwent and original artwork belong to their respective rights holders. [Gwent Classic](https://github.com/asundr/gwent-classic/tree/08592d847f2573440a34deb9f32bc855b2544cdd) · [Additional audio from Gwent Classic v3.5](https://github.com/ia2904/gwent-classic-v3.5/tree/2efc94ed626c0baeb28fc5e51c0e279ed5ee51dd)
- The Windows host uses Microsoft WebView2 SDK 1.0.3537.50. Its licence and notices are included in the Native folder.

