import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, X, Gamepad2, Star, Clock, Users, Fullscreen, Play } from "lucide-react";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Games — Sleepy" },
      { name: "description", content: "Play hundreds of free web games instantly." },
    ],
  }),
  component: GamesPage,
});

type Game = {
  id: string;
  name: string;
  thumbnail: string;
  url: string;
  category: string;
  description: string;
};

// Curated list of web games (embeddable)
const GAMES: Game[] = [
  // Arcade
  { id: "1", name: "2048", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/2048_%28video_game%29.png/220px-2048_%28video_game%29.png", url: "https://play2048.co/", category: "Puzzle", description: "Slide and combine tiles to reach 2048" },
  { id: "2", name: "Tetris", thumbnail: "https://tetris.com/wp-content/uploads/2020/09/tetris-logo-black.png", url: "https://tetris.com/play-tetris/", category: "Arcade", description: "Classic block-stacking game" },
  { id: "3", name: "Snake", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Snake_game.jpg/240px-Snake_game.jpg", url: "https://www.google.com/fbx?fbx=snake_arcade", category: "Arcade", description: "Grow your snake, avoid the walls" },
  { id: "4", name: "Pac-Man", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Pac-Man.svg/200px-Pac-Man.svg.png", url: "https://www.google.com/fbx?fbx=pacman_arcade", category: "Arcade", description: "Eat dots, flee ghosts" },
  { id: "5", name: "Minesweeper", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Minesweeper_9x9_10_mines.svg/200px-Minesweeper_9x9_10_mines.svg.png", url: "https://minesweeper.today/", category: "Puzzle", description: "Find mines logic game" },
  { id: "6", name: "Sudoku", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Sudoku_Puzzle_by_L2G-20050714_standardized_layout.svg/200px-Sudoku_Puzzle_by_L2G-20050714_standardized_layout.svg.png", url: "https://www.sudoku.com/", category: "Puzzle", description: "Fill the grid with digits 1-9" },
  { id: "7", name: "Solitaire", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Klondike_Solitaire_0.png/220px-Klondike_Solitaire_0.png", url: "https://www.solitaire.com/", category: "Card", description: "Classic card solo game" },
  { id: "8", name: "Minesweeper Online", thumbnail: "https://minesweeper.today/favicon.ico", url: "https://minesweeper.today/", category: "Puzzle", description: "Multiplayer minesweeper" },

  // Action
  { id: "9", name: "Slither.io", thumbnail: "https://slither.io/favicon.png", url: "https://slither.io/", category: "Action", description: "Snake multiplayer battle" },
  { id: "10", name: "Agar.io", thumbnail: "https://agar.io/favicon.ico", url: "https://agar.io/", category: "Action", description: "Cell eating multiplayer" },
  { id: "11", name: "Diep.io", thumbnail: "https://diep.io/favicon.png", url: "https://diep.io/", category: "Action", description: "Tank battle arena" },
  { id: "12", name: "Wings.io", thumbnail: "https://wings.io/favicon.png", url: "https://wings.io/", category: "Action", description: "Dogfight shooter" },
  { id: "13", name: "Surviv.io", thumbnail: "https://surviv.io/favicon.png", url: "https://surviv.io/", category: "Action", description: "Battle royale 2D" },
  { id: "14", name: "Zombs.io", thumbnail: "https://zombs.io/favicon.png", url: "https://zombs.io/", category: "Action", description: "Zombie survival base" },
  { id: "15", name: "Moomoo.io", thumbnail: "https://moomoo.io/favicon.png", url: "https://moomoo.io/", category: "Action", description: "Build and survive" },
  { id: "16", name: "Krunker.io", thumbnail: "https://krunker.io/favicon.png", url: "https://krunker.io/", category: "FPS", description: "FPS in browser" },
  { id: "17", name: "Shell Shockers", thumbnail: "https://shellshock.io/favicon.ico", url: "https://shellshock.io/", category: "FPS", description: "Egg shooter FPS" },
  { id: "18", name: "Venge.io", thumbnail: "https://venge.io/favicon.png", url: "https://venge.io/", category: "FPS", description: "Shooting game" },
  { id: "19", name: "1v1.lol", thumbnail: "https://1v1.lol/favicon.ico", url: "https://1v1.lol/", category: "Action", description: "Building and shooting" },
  { id: "20", name: "Bonk.io", thumbnail: "https://bonk.io/favicon.png", url: "https://bonk.io/", category: "Action", description: "Physics multiplayer" },

  // Puzzle
  { id: "21", name: "Wordle", thumbnail: "https://www.nytimes.com/games-assets/images/logos/wordle-logo.png", url: "https://www.nytimes.com/games/wordle/index.html", category: "Puzzle", description: "Guess the 5-letter word" },
  { id: "22", name: "Quordle", thumbnail: "https://www.quordle.com/favicon.ico", url: "https://www.quordle.com/", category: "Puzzle", description: "Four Wordles at once" },
  { id: "23", name: "Worldle", thumbnail: "https://worldle.teuteuf.fr/favicon.ico", url: "https://worldle.teuteuf.fr/", category: "Puzzle", description: "Guess the country" },
  { id: "24", name: "Heardle", thumbnail: "https://www.heardle.app/favicon.ico", url: "https://www.heardle.app/", category: "Puzzle", description: "Guess the song" },
  { id: "25", name: "Nerdle", thumbnail: "https://nerdlegame.com/favicon.ico", url: "https://nerdlegame.com/", category: "Puzzle", description: "Math equation game" },
  { id: "26", name: "GeoGuessr", thumbnail: "https://www.geoguessr.com/favicon.ico", url: "https://www.geoguessr.com/", category: "Puzzle", description: "Guess location from street view" },
  { id: "27", name: "Setris", thumbnail: "https://setris.com/favicon.ico", url: "https://setris.com/", category: "Puzzle", description: "Tetris with sand physics" },
  { id: "28", name: "Mahjongg", thumbnail: "https://www.247mahjong.com/favicon.ico", url: "https://www.247mahjong.com/", category: "Puzzle", description: "Classic tile matching" },

  // Card & Board
  { id: "29", name: "Blackjack", thumbnail: "https://www.blackjack.com/favicon.ico", url: "https://www.blackjack.com/", category: "Card", description: "Beat the dealer to 21" },
  { id: "30", name: "Chess.com", thumbnail: "https://www.chess.com/bundles/web/favicons/favicon-32.png", url: "https://www.chess.com/play/online", category: "Board", description: "Play chess online" },
  { id: "31", name: "Lichess", thumbnail: "https://lichess1.org/assets/logo/lichess-favicon-32.png", url: "https://lichess.org/", category: "Board", description: "Free online chess" },
  { id: "32", name: "Checkers", thumbnail: "https://www.checkers.com/favicon.ico", url: "https://www.checkers.com/", category: "Board", description: "Classic checkers" },
  { id: "33", name: "Backgammon", thumbnail: "https://www.backgammon.com/favicon.ico", url: "https://www.backgammon.com/", category: "Board", description: "Roll and move" },
  { id: "34", name: "Dominoes", thumbnail: "https://www.dominoes.com/favicon.ico", url: "https://www.dominoes.com/", category: "Board", description: "Match the dots" },
  { id: "35", name: "Spades", thumbnail: "https://www.spades.com/favicon.ico", url: "https://www.spades.com/", category: "Card", description: "Trick-taking card game" },
  { id: "36", name: "Hearts", thumbnail: "https://www.hearts.com/favicon.ico", url: "https://www.hearts.com/", category: "Card", description: "Avoid hearts" },
  { id: "37", name: "Gin Rummy", thumbnail: "https://www.gin-rummy.com/favicon.ico", url: "https://www.gin-rummy.com/", category: "Card", description: "Classic rummy game" },

  // Adventure
  { id: "38", name: "Cookie Clicker", thumbnail: "https://orteil.dashnet.org/cookieclicker/favicon.ico", url: "https://orteil.dashnet.org/cookieclicker/", category: "Idle", description: "Bake cookies forever" },
  { id: "39", name: "Universal Paperclips", thumbnail: "https://www.decisionproblem.com/paperclips/favicon.ico", url: "https://www.decisionproblem.com/paperclips/", category: "Idle", description: "AI takeover simulator" },
  { id: "40", name: "A Dark Room", thumbnail: "https://adarkroom.doublespeakgames.com/favicon.ico", url: "https://adarkroom.doublespeakgames.com/", category: "Adventure", description: "Minimalist adventure" },
  { id: "41", name: "Kingdom of Loathing", thumbnail: "https://www.kingdomofloathing.com/favicon.ico", url: "https://www.kingdomofloathing.com/", category: "RPG", description: "Comedy RPG" },
  { id: "42", name: "Neopets", thumbnail: "https://www.neopets.com/favicon.ico", url: "https://www.neopets.com/", category: "Virtual Pet", description: "Virtual pets world" },

  // Sports
  { id: "43", name: "Football Legends", thumbnail: "https://www.footballlegends.net/favicon.ico", url: "https://www.footballlegends.net/", category: "Sports", description: "Arcade soccer" },
  { id: "44", name: "Basketball Legends", thumbnail: "https://www.basketballlegends.net/favicon.ico", url: "https://www.basketballlegends.net/", category: "Sports", description: "Arcade basketball" },
  { id: "45", name: "8 Ball Pool", thumbnail: "https://www.miniclip.com/games/8-ball-pool/", url: "https://www.miniclip.com/games/8-ball-pool/", category: "Sports", description: "Online pool" },
  { id: "46", name: "Mini Golf", thumbnail: "https://www.minigolf.com/favicon.ico", url: "https://www.minigolf.com/", category: "Sports", description: "Mini golf courses" },

  // Racing
  { id: "47", name: "Madalin Stunt Cars", thumbnail: "https://madalinstuntcars2.io/favicon.ico", url: "https://madalinstuntcars2.io/", category: "Racing", description: "3D stunt driving" },
  { id: "48", name: "Drift Hunters", thumbnail: "https://drifthunters.io/favicon.ico", url: "https://drifthunters.io/", category: "Racing", description: "Drift simulator" },
  { id: "49", name: "Moto X3M", thumbnail: "https://www.crazygames.com/assets/crazygames-64.png", url: "https://www.crazygames.com/game/moto-x3m", category: "Racing", description: "Motorbike stunts" },
  { id: "50", name: "Hill Climb", thumbnail: "https://www.hillclimbracing.com/favicon.ico", url: "https://www.hillclimbracing.com/", category: "Racing", description: "Physics driving" },

  // Casual
  { id: "51", name: "Crossy Road", thumbnail: "https://www.crossyroad.com/favicon.ico", url: "https://www.crossyroad.com/", category: "Casual", description: "Cross the road" },
  { id: "52", name: "Flappy Bird", thumbnail: "https://flappybird.io/favicon.ico", url: "https://flappybird.io/", category: "Casual", description: "Tap to fly" },
  { id: "53", name: "Geometry Dash", thumbnail: "https://geometrydash.io/favicon.ico", url: "https://geometrydash.io/", category: "Rhythm", description: "Jump to the beat" },
  { id: "54", name: "Stickman Hook", thumbnail: "https://www.stickmanhook.com/favicon.ico", url: "https://stickmanhook.com/", category: "Casual", description: "Swing to finish" },
  { id: "55", name: "Among Us Online", thumbnail: "https://www.among-us.com/favicon.ico", url: "https://www.among-us.com/play/", category: "Casual", description: "Find the impostor" },

  // More IO games
  { id: "56", name: "Hole.io", thumbnail: "https://holeio.com/favicon.png", url: "https://holeio.com/", category: "Action", description: "Black hole eating" },
  { id: "57", name: "Paper.io 2", thumbnail: "https://paperio2.site/favicon.ico", url: "https://paperio2.site/", category: "Action", description: "Claim territory" },
  { id: "58", name: "Skribbl.io", thumbnail: "https://skribbl.io/favicon.png", url: "https://skribbl.io/", category: "Casual", description: "Drawing and guessing" },
  { id: "59", name: "Gartic Phone", thumbnail: "https://garticphone.com/favicon.ico", url: "https://garticphone.com/", category: "Casual", description: "Telephone game" },
  { id: "60", name: "Codenames", thumbnail: "https://codenames.game/favicon.ico", url: "https://codenames.game/", category: "Board", description: "Word association" },

  // More puzzle
  { id: "61", name: "Jigsaw Planet", thumbnail: "https://www.jigsawplanet.com/favicon.ico", url: "https://www.jigsawplanet.com/", category: "Puzzle", description: "Online jigsaw puzzles" },
  { id: "62", name: "Nonogram", thumbnail: "https://www.nonograms.org/favicon.ico", url: "https://www.nonograms.org/", category: "Puzzle", description: "Picture cross logic" },
  { id: "63", name: "Kakuro", thumbnail: "https://www.kakuro.com/favicon.ico", url: "https://www.kakuro.com/", category: "Puzzle", description: "Cross-sum puzzles" },
  { id: "64", name: "Crossword", thumbnail: "https://www.dictionary.com/crossword/favicon.ico", url: "https://www.dictionary.com/crossword", category: "Puzzle", description: "Daily crossword" },

  // Trivia
  { id: "65", name: "Sporcle", thumbnail: "https://www.sporcle.com/favicon.ico", url: "https://www.sporcle.com/", category: "Trivia", description: "Trivia quizzes" },
  { id: "66", name: "Kahoot", thumbnail: "https://kahoot.com/favicon.ico", url: "https://kahoot.it/", category: "Trivia", description: "Interactive quizzes" },
  { id: "67", name: "Quizizz", thumbnail: "https://quizizz.com/favicon.ico", url: "https://quizizz.com/", category: "Trivia", description: "Fun quizzes" },

  // .io games continued
  { id: "68", name: "Little Big Snake", thumbnail: "https://littlebigsnake.com/favicon.png", url: "https://littlebigsnake.com/", category: "Action", description: "Snake with flying" },
  { id: "69", name: "Wormate.io", thumbnail: "https://wormate.io/favicon.png", url: "https://wormate.io/", category: "Action", description: "Worm battle" },
  { id: "70", name: "Worms Zone", thumbnail: "https://worms.zone/favicon.png", url: "https://worms.zone/", category: "Action", description: "Eat and grow" },
  { id: "71", name: "Defly.io", thumbnail: "https://defly.io/favicon.png", url: "https://defly.io/", category: "Action", description: "Build and shoot" },
  { id: "72", name: "BuildRoyale.io", thumbnail: "https://buildroyale.io/favicon.png", url: "https://buildroyale.io/", category: "Action", description: "Build and battle" },
  { id: "73", name: "Yohoho.io", thumbnail: "https://yohoho.io/favicon.png", url: "https://yohoho.io/", category: "Action", description: "Pirate battle" },
  { id: "74", name: "Starve.io", thumbnail: "https://starve.io/favicon.png", url: "https://starve.io/", category: "Survival", description: "Survive the wild" },
  { id: "75", name: "Mope.io", thumbnail: "https://mope.io/favicon.png", url: "https://mope.io/", category: "Action", description: "Animal evolution" },

  // Strategy
  { id: "76", name: "Twitch", thumbnail: "https://www.twitch.tv/favicon.ico", url: "https://www.twitch.tv/directory/game/Just%20Chatting", category: "Strategy", description: "Watch games live" },
  { id: "77", name: "Web Sudoku", thumbnail: "https://websudoku.com/favicon.ico", url: "https://www.websudoku.com/", category: "Puzzle", description: "Random sudoku puzzles" },
  { id: "78", name: "CrazyGames", thumbnail: "https://www.crazygames.com/assets/crazygames-64.png", url: "https://www.crazygames.com/", category: "All", description: "1000+ browser games" },
  { id: "79", name: "Poki", thumbnail: "https://poki.com/favicon.ico", url: "https://poki.com/", category: "All", description: "Free online games" },
  { id: "80", name: "Y8 Games", thumbnail: "https://www.y8.com/favicon.ico", url: "https://www.y8.com/", category: "All", description: "Flash games archive" },

  // More classics
  { id: "81", name: "Pong", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Pong.png/220px-Pong.png", url: "https://www.ponggame.net/", category: "Arcade", description: "Classic pong" },
  { id: "82", name: "Breakout", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/VideoGameBreakout.png/220px-VideoGameBreakout.png", url: "https://www.go playbreakout.com/", category: "Arcade", description: "Brick breaker" },
  { id: "83", name: "Space Invaders", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/ sixty/SpaceInvaders.png/220px-SpaceInvaders.png", url: "https://www.spaceinvaders.com/", category: "Arcade", description: "Classic shooter" },
  { id: "84", name: "Asteroids", thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Asteroids-arcade-game.png/220px-Asteroids-arcade-game.png", url: "https://www.asteroids.com/", category: "Arcade", description: "Space shooter" },

  // Platformers
  { id: "85", name: "Run 3", thumbnail: "https://www.run3game.com/favicon.ico", url: "https://www.run3game.com/", category: "Platformer", description: "Endless runner" },
  { id: "86", name: "Vex 4", thumbnail: "https://www.vex4.com/favicon.ico", url: "https://www.vex4.com/", category: "Platformer", description: "Parkour sticks" },
  { id: "87", name: "Fireboy Watergirl", thumbnail: "https://www.fireboyandwatergirl.com/favicon.ico", url: "https://www.fireboyandwatergirl.com/", category: "Platformer", description: "Co-op puzzle platformer" },
  { id: "88", name: "Red Ball", thumbnail: "https://www.redball4.com/favicon.ico", url: "https://www.redball4.com/", category: "Platformer", description: "Roll and jump" },

  // Tower Defense
  { id: "89", name: "Bloons TD", thumbnail: "https://ninjakiwi.com/favicon.ico", url: "https://ninja kiwi.com/Games/Bloons-TD-5.html", category: "Strategy", description: "Pop balloons towers" },
  { id: "90", name: "Kingdom Rush", thumbnail: "https://www.kingdomrush.com/favicon.ico", url: "https://www.kingdomrush.com/", category: "Strategy", description: "Fantasy tower defense" },
  { id: "91", name: "Cursed Treasure", thumbnail: "https://www.cursedtreasure.com/favicon.ico", url: "https://armorgames.com/play/16880/cursed-treasure-level-pack", category: "Strategy", description: "Protect gems" },

  // Clicker/Idle
  { id: "92", name: "Clicker Heroes", thumbnail: "https://www.clickerheroes.com/favicon.ico", url: "https://www.clickerheroes.com/", category: "Idle", description: "Click to defeat monsters" },
  { id: "93", name: "Adventure Capitalist", thumbnail: "https://www.adventurecapitalist.com/favicon.ico", url: "https://www.adventurecapitalist.com/", category: "Idle", description: "Business idle game" },
  { id: "94", name: "Realm Grinder", thumbnail: "https://www.realmgrinder.com/favicon.ico", url: "https://www.realmgrinder.com/", category: "Idle", description: "Fantasy incremental" },

  // More sports
  { id: "95", name: "Soccer Stars", thumbnail: "https://www.soccerstars.com/favicon.ico", url: "https://www.soccerstars.com/", category: "Sports", description: "Table soccer" },
  { id: "96", name: "Golf Battle", thumbnail: "https://www.golfbattle.com/favicon.ico", url: "https://www.golfbattle.com/", category: "Sports", description: "Multiplayer golf" },
  { id: "97", name: "Tennis Masters", thumbnail: "https://www.tennismasters.com/favicon.ico", url: "https://www.tennismasters.com/", category: "Sports", description: "Tennis game" },

  // Puzzle extras
  { id: "98", name: "Bloxorz", thumbnail: "https://www.coolmathgames.com/favicon.ico", url: "https://www.coolmathgames.com/0-bloxorz", category: "Puzzle", description: "Block rolling puzzle" },
  { id: "99", name: "Sugar Sugar", thumbnail: "https://www.coolmathgames.com/favicon.ico", url: "https://www.coolmathgames.com/0-sugar-sugar", category: "Puzzle", description: "Draw to guide sugar" },
  { id: "100", name: "Tipping Point", thumbnail: "https://www.coolmathgames.com/favicon.ico", url: "https://www.coolmathgames.com/0-tipping-point", category: "Puzzle", description: "Balance puzzle" },

  // More action games
  { id: "101", name: "Happy Wheels", thumbnail: "https://totaljerkface.com/favicon.ico", url: "https://totaljerkface.com/happy_wheels.php", category: "Action", description: "Physics ragdoll racer" },
  { id: "102", name: "Runescape", thumbnail: "https://www.runescape.com/favicon.ico", url: "https://www.runescape.com/", category: "MMO", description: "Classic MMORPG" },
  { id: "103", name: "Eternal Card Game", thumbnail: "https://www.direwolfdigital.com/favicon.ico", url: "https://www.direwolfdigital.com/eternal/", category: "Card", description: "Strategy card game" },
  { id: "104", name: "Hearthstone", thumbnail: "https://playhearthstone.com/favicon.ico", url: "https://playhearthstone.com/", category: "Card", description: "Blizzard card game" },

  // Even more games
  { id: "105", name: "Fall Guys", thumbnail: "https://www.fallguys.com/favicon.ico", url: "https://www.fallguys.com/", category: "Casual", description: "Party obstacle game" },
  { id: "106", name: "Roblox", thumbnail: "https://www.roblox.com/favicon.ico", url: "https://www.roblox.com/", category: "Platform", description: "User-created games" },
  { id: "107", name: "Nitro Type", thumbnail: "https://www.nitrotype.com/favicon.ico", url: "https://www.nitrotype.com/", category: "Racing", description: "Typing racing" },
  { id: "108", name: "Type Racer", thumbnail: "https://play.typeracer.com/favicon.ico", url: "https://play.typeracer.com/", category: "Casual", description: "Competitive typing" },

  // Drawing/Creative
  { id: "109", name: "Autodraw", thumbnail: "https://www.autodraw.com/favicon.ico", url: "https://www.autodraw.com/", category: "Creative", description: "AI-assisted drawing" },
  { id: "110", name: "Quick Draw", thumbnail: "https://quickdraw.with google.com/favicon.ico", url: "https://quickdraw.withgoogle.com/", category: "Creative", description: "Google AI drawing game" },

  // Word games
  { id: "111", name: "Words with Friends", thumbnail: "https://www.zynga.com/favicon.ico", url: "https://www.zynga.com/games/words-friends", category: "Word", description: "Scrabble-style word game" },
  { id: "112", name: "Scrabble", thumbnail: "https://www.scrabble.com/favicon.ico", url: "https://www.scrabble.com/", category: "Word", description: "Classic word game" },
  { id: "113", name: "Boggle", thumbnail: "https://www.boggle.com/favicon.ico", url: "https://www.boggle.com/", category: "Word", description: "Find words fast" },

  // Strategy games
  { id: "114", name: "Age of War", thumbnail: "https://www.ageofwar.com/favicon.ico", url: "https://www.ageofwar.com/", category: "Strategy", description: "Evolution warfare" },
  { id: "115", name: "Clash of Clans", thumbnail: "https://supercell.com/favicon.ico", url: "https://clashofclans.com/", category: "Strategy", description: "Base building war" },
  { id: "116", name: "Plague Inc", thumbnail: "https://www.ndemiccreations.com/favicon.ico", url: "https://www.ndemiccreations.com/en/projects/plague-inc/", category: "Strategy", description: "Pandemic simulator" },

  // Escape rooms
  { id: "117", name: "Escape Simulator", thumbnail: "https://escapesimulator.com/favicon.ico", url: "https://escapesimulator.com/", category: "Puzzle", description: "Virtual escape rooms" },
  { id: "118", name: "Cube Escape", thumbnail: "https://www.rustylake.com/favicon.ico", url: "https://www.rustylake.com/", category: "Puzzle", description: "Mystery escape" },

  // Music games
  { id: "119", name: "Beatstar", thumbnail: "https://www.beatstar.com/favicon.ico", url: "https://www.beatstar.com/", category: "Rhythm", description: "Rhythm tapping" },
  { id: "120", name: "Piano Tiles", thumbnail: "https://www.pianotiles.com/favicon.ico", url: "https://www.pianotiles.com/", category: "Rhythm", description: "Tap the black tiles" },

  // More multiplayer
  { id: "121", name: "Golf with Friends", thumbnail: "https://www.golfwithyourfriends.com/favicon.ico", url: "https://www.golfwithyourfriends.com/", category: "Sports", description: "Multiplayer mini golf" },
  { id: "122", name: "Uno Online", thumbnail: "https://www.uno.com/favicon.ico", url: "https://www.uno.com/", category: "Card", description: "Classic card matching" },
  { id: "123", name: "Monopoly Online", thumbnail: "https://monopoly.com/favicon.ico", url: "https://monopoly.com/", category: "Board", description: "Property trading game" },

  // Classic flash style games
  { id: "124", name: "Age of Empires Online", thumbnail: "https://www.ageofempires.com/favicon.ico", url: "https://www.ageofempires.com/", category: "Strategy", description: "RTS classic" },
  { id: "125", name: "Town of Salem", thumbnail: "https://www.blankmediagames.com/favicon.ico", url: "https://www.blankmediagames.com/", category: "Social", description: "Social deduction" },
  { id: "126", name: "Shell Shockers", thumbnail: "https://shellshock.io/favicon.ico", url: "https://shellshock.io/", category: "FPS", description: "Egg FPS shooter" },

  // More casual
  { id: "127", name: "Toca Boca", thumbnail: "https://tocaboca.com/favicon.ico", url: "https://tocaboca.com/", category: "Casual", description: "Creative play" },
  { id: "128", name: "Subway Surfers", thumbnail: "https://www.subwaysurfers.com/favicon.ico", url: "https://www.subwaysurfers.com/", category: "Endless", description: "Train hop runner" },
  { id: "129", name: "Temple Run", thumbnail: "https://www.templerun.com/favicon.ico", url: "https://www.templerun.com/", category: "Endless", description: "Jungle runner" },
  { id: "130", name: "Jetpack Joyride", thumbnail: "https://www.jetpackjoyride.com/favicon.ico", url: "https://www.jetpackjoyride.com/", category: "Endless", description: "Jetpack flyer" },

  // Battle royale
  { id: "131", name: "Fortnite", thumbnail: "https://www.fortnite.com/favicon.ico", url: "https://www.fortnite.com/", category: "Battle Royale", description: "Build and shoot BR" },
  { id: "132", name: "Apex Legends", thumbnail: "https://www.ea.com/favicon.ico", url: "https://www.ea.com/games/apex-legends", category: "Battle Royale", description: "Hero shooter BR" },
  { id: "133", name: "Valorant", thumbnail: "https://playvalorant.com/favicon.ico", url: "https://playvalorant.com/", category: "FPS", description: "Tactical shooter" },

  // MMORPG
  { id: "134", name: "AdventureQuest 3D", thumbnail: "https://www.aq3d.com/favicon.ico", url: "https://www.aq3d.com/", category: "MMO", description: "Fantasy browser MMO" },
  { id: "135", name: "Drakensang Online", thumbnail: "https://www.drakensang.com/favicon.ico", url: "https://www.drakensang.com/", category: "MMO", description: "Action browser MMO" },
  { id: "136", name: "Pirate101", thumbnail: "https://www.pirate101.com/favicon.ico", url: "https://www.pirate101.com/", category: "MMO", description: "Pirate MMO" },

  // Racing more
  { id: "137", name: "Trackmania", thumbnail: "https://trackmania.com/favicon.ico", url: "https://trackmania.com/", category: "Racing", description: "Stunt racing" },
  { id: "138", name: "F1 Racing", thumbnail: "https://www.formula1.com/favicon.ico", url: "https://www.formula1.com/", category: "Racing", description: "Formula 1 racing" },
  { id: "139", name: "Need for Speed", thumbnail: "https://www.ea.com/favicon.ico", url: "https://www.ea.com/games/need-for-speed", category: "Racing", description: "Street racing" },

  // Horror games
  { id: "140", name: "Five Nights at Freddys", thumbnail: "https://fnaf.com/favicon.ico", url: "https://fnaf.com/", category: "Horror", description: "Survival horror" },
  { id: "141", name: "Poppy Playtime", thumbnail: "https://www.poppyplaytime.com/favicon.ico", url: "https://www.poppyplaytime.com/", category: "Horror", description: "Toy factory horror" },
  { id: "142", name: "Baldi's Basics", thumbnail: "https://mystman12.itch.io/favicon.ico", url: "https://mystman12.itch.io/baldis-basics", category: "Horror", description: "Educational horror" },

  // Card games
  { id: "143", name: "Legends of Runeterra", thumbnail: "https://www.riotgames.com/favicon.ico", url: "https://www.riotgames.com/en/legendsofruneterra", category: "Card", description: "League card game" },
  { id: "144", name: "Gwent", thumbnail: "https://www.playgwent.com/favicon.ico", url: "https://www.playgwent.com/", category: "Card", description: "Witcher card game" },
  { id: "145", name: "Magic The Gathering", thumbnail: "https://magic.wizards.com/favicon.ico", url: "https://magic.wizards.com/", category: "Card", description: "Classic TCG online" },

  // Battle games
  { id: "146", name: "Brawlhalla", thumbnail: "https://www.brawlhalla.com/favicon.ico", url: "https://www.brawlhalla.com/", category: "Fighting", description: "Platform fighter" },
  { id: "147", name: "Brawl Stars", thumbnail: "https://supercell.com/favicon.ico", url: "https://supercell.com/en/games/brawlstars/", category: "Action", description: "Team shooting brawler" },

  // Puzzle games
  { id: "148", name: "Portal", thumbnail: "https://www.thinkwithportals.com/favicon.ico", url: "https://www.thinkwithportals.com/", category: "Puzzle", description: "Portal puzzle game" },
  { id: "149", name: "The Witness", thumbnail: "https://the-witness.com/favicon.ico", url: "https://the-witness.com/", category: "Puzzle", description: "Mystery island puzzles" },
  { id: "150", name: "Baba Is You", thumbnail: "https://www.hempuli.com/favicon.ico", url: "https://www.hempuli.com/baba/", category: "Puzzle", description: "Change the rules puzzle" },

  // Idle games extras
  { id: "151", name: "Antimatter Dimensions", thumbnail: "https://ivark.github.io/favicon.ico", url: "https://ivark.github.io/", category: "Idle", description: "Scale up infinity" },
  { id: "152", name: "Egg Inc", thumbnail: "https://www.auxbrain.com/favicon.ico", url: "https://www.auxbrain.com/", category: "Idle", description: "Egg farming idle" },
  { id: "153", name: "NGU IDLE", thumbnail: "https://www.kongregate.com/favicon.ico", url: "https://www.kongregate.com/games/4g_idle/ngu-idle", category: "Idle", description: "Number go up idle" },

  // Music
  { id: "154", name: "Fuser", thumbnail: "https://www.fuser.com/favicon.ico", url: "https://www.fuser.com/", category: "Music", description: "DJ mixing game" },
  { id: "155", name: "Beat Saber", thumbnail: "https://beatsaber.com/favicon.ico", url: "https://beatsaber.com/", category: "Rhythm", description: "VR rhythm slicing" },

  // Sports management
  { id: "156", name: "Football Manager", thumbnail: "https://www.footballmanager.com/favicon.ico", url: "https://www.footballmanager.com/", category: "Sports", description: "Soccer management" },
  { id: "157", name: "Out of the Park Baseball", thumbnail: "https://www.ootpdevelopments.com/favicon.ico", url: "https://www.ootpdevelopments.com/", category: "Sports", description: "Baseball management" },

  // More board games
  { id: "158", name: "Ticket to Ride", thumbnail: "https://www.daysofwonder.com/favicon.ico", url: "https://www.daysofwonder.com/ticket-to-ride/", category: "Board", description: "Train route building" },
  { id: "159", name: "Catan Universe", thumbnail: "https://www.catan.com/favicon.ico", url: "https://www.catan.com/", category: "Board", description: "Settlers online" },
  { id: "160", name: "Carousel Rummy", thumbnail: "https://www.rummy.com/favicon.ico", url: "https://www.rummy.com/", category: "Card", description: "Rummy card game" },

  // More casual games
  { id: "161", name: "Bejeweled", thumbnail: "https://www.popcap.com/favicon.ico", url: "https://www.pogo.com/games/bejeweled3", category: "Puzzle", description: "Match-3 gem swapping" },
  { id: "162", name: "Zuma", thumbnail: "https://www.popcap.com/favicon.ico", url: "https://www.pogo.com/games/zuma", category: "Puzzle", description: "Ball shooting chain" },
  { id: "163", name: "Insaniquarium", thumbnail: "https://www.popcap.com/favicon.ico", url: "https://www.popcap.com/games/insaniquarium-deluxe", category: "Casual", description: "Fish tank tycoon" },

  // Tower defense more
  { id: "164", name: "Elemental Tower Defense", thumbnail: "https://defensegamestudio.com/favicon.ico", url: "https://defensegamestudio.com/", category: "Strategy", description: "Element-based TD" },
  { id: "165", name: "Orcs Must Die", thumbnail: "https://www.robotentertainment.com/favicon.ico", url: "https://www.robotentertainment.com/games/orcs-must-die", category: "Strategy", description: "Trap-based TD" },

  // Puzzle platformer
  { id: "166", name: "Inside", thumbnail: "https://www.insideplaydead.com/favicon.ico", url: "https://www.insideplaydead.com/", category: "Adventure", description: "Dark atmospheric platformer" },
  { id: "167", name: "Limbo", thumbnail: "https://www.limbogame.org/favicon.ico", url: "https://www.limbogame.org/", category: "Adventure", description: "Noire puzzle platformer" },
  { id: "168", name: "Little Nightmares", thumbnail: "https://www.little-nightmares.com/favicon.ico", url: "https://www.little-nightmares.com/", category: "Horror", description: "Creepy platformer" },

  // Word puzzle
  { id: "169", name: "Bananagrams", thumbnail: "https://bananagrams.com/favicon.ico", url: "https://bananagrams.com/", category: "Word", description: "Speed word game" },
  { id: "170", name: "Boggle Online", thumbnail: "https://www.boggle.com/favicon.ico", url: "https://www.boggle.com/", category: "Word", description: "Find words grid" },

  // Space games
  { id: "171", name: "EVE Online", thumbnail: "https://www.eveonline.com/favicon.ico", url: "https://www.eveonline.com/", category: "MMO", description: "Space sandbox MMO" },
  { id: "172", name: "Star Trek Online", thumbnail: "https://www.arcgames.com/favicon.ico", url: "https://www.arcgames.com/en/games/star-trek-online", category: "MMO", description: "Sci-fi MMORPG" },
  { id: "173", name: "Elite Dangerous", thumbnail: "https://www.elitedangerous.com/favicon.ico", url: "https://www.elitedangerous.com/", category: "Simulation", description: "Space simulation" },

  // Farming
  { id: "174", name: "Stardew Valley", thumbnail: "https://www.stardewvalley.net/favicon.ico", url: "https://www.stardewvalley.net/", category: "Simulation", description: "Farm life sim" },
  { id: "175", name: "Hay Day", thumbnail: "https://supercell.com/favicon.ico", url: "https://supercell.com/en/games/hayday/", category: "Simulation", description: "Mobile farming" },

  // Building
  { id: "176", name: "Trove", thumbnail: "https://www.trionworlds.com/favicon.ico", url: "https://www.trionworlds.com/trove/", category: "MMO", description: "Voxel MMO" },
  { id: "177", name: "Creativerse", thumbnail: "https://www.creativerse.game/favicon.ico", url: "https://www.creativerse.game/", category: "Survival", description: "Voxel survival craft" },

  // .io games even more
  { id: "178", name: "Deeeep.io", thumbnail: "https://deeeep.io/favicon.png", url: "https://deeeep.io/", category: "Action", description: "Ocean evolution" },
  { id: "179", name: "Spinz.io", thumbnail: "https://spinz.io/favicon.png", url: "https://spinz.io/", category: "Action", description: "Spinner battle" },
  { id: "180", name: "Fightz.io", thumbnail: "https://fightz.io/favicon.png", url: "https://fightz.io/", category: "Action", description: "Pixel battle" },
  { id: "181", name: "Pikes.io", thumbnail: "https://pikes.io/favicon.png", url: "https://pikes.io/", category: "Action", description: "Knight battle" },
  { id: "182", name: "Knightz.io", thumbnail: "https://knightz.io/favicon.png", url: "https://knightz.io/", category: "Action", description: "Medieval battle" },
  { id: "183", name: "Gladiatorz.io", thumbnail: "https://gladiatorz.io/favicon.png", url: "https://gladiatorz.io/", category: "Action", description: "Arena fighter" },
  { id: "184", name: "Sharkz.io", thumbnail: "https://sharkz.io/favicon.png", url: "https://sharkz.io/", category: "Action", description: "Shark battle" },
  { id: "185", name: "Squadd.io", thumbnail: "https://squadd.io/favicon.png", url: "https://squadd.io/", category: "Action", description: "Team shooter" },

  // Platforming
  { id: "186", name: "Celeste", thumbnail: "https://www.celestegame.com/favicon.ico", url: "https://www.celestegame.com/", category: "Platformer", description: "Precision platformer" },
  { id: "187", name: "Super Meat Boy", thumbnail: "https://www.supermeatboy.com/favicon.ico", url: "https://www.supermeatboy.com/", category: "Platformer", description: "Hard platformer" },
  { id: "188", name: "Hollow Knight", thumbnail: "https://www.teamcherry.com.au/favicon.ico", url: "https://www.teamcherry.com.au/", category: "Metroidvania", description: "Dark exploration" },

  // Retro remakes
  { id: "189", name: "Doom Online", thumbnail: "https://bethesda.net/favicon.ico", url: "https://bethesda.net/en/game/doom", category: "FPS", description: "Classic FPS" },
  { id: "190", name: "Quake Online", thumbnail: "https://bethesda.net/favicon.ico", url: "https://bethesda.net/en/game/quake", category: "FPS", description: "Arena FPS classic" },
  { id: "191", name: "Wolfenstein", thumbnail: "https://bethesda.net/favicon.ico", url: "https://bethesda.net/en/game/wolfenstein", category: "FPS", description: "WW2 FPS classic" },

  // Simulation
  { id: "192", name: "Goat Simulator", thumbnail: "https://www.goat-simulator.com/favicon.ico", url: "https://www.goat-simulator.com/", category: "Simulation", description: "Goat chaos sim" },
  { id: "193", name: "Surgeon Simulator", thumbnail: "https://www.surgeonsim.com/favicon.ico", url: "https://www.surgeonsim.com/", category: "Simulation", description: "Medical chaos sim" },
  { id: "194", name: "Job Simulator", thumbnail: "https://www.jobsimulatorgame.com/favicon.ico", url: "https://www.jobsimulatorgame.com/", category: "Simulation", description: "VR job experience" },

  // Strategy more
  { id: "195", name: "Civilization Online", thumbnail: "https://civilization.com/favicon.ico", url: "https://civilization.com/", category: "Strategy", description: "4X strategy game" },
  { id: "196", name: "Total War", thumbnail: "https://www.totalwar.com/favicon.ico", url: "https://www.totalwar.com/", category: "Strategy", description: "Historical war" },
  { id: "197", name: "XCOM", thumbnail: "https://www.xcom.com/favicon.ico", url: "https://www.xcom.com/", category: "Strategy", description: "Turn-based tactics" },

  // More adventure
  { id: "198", name: "Terraria", thumbnail: "https://terraria.org/favicon.ico", url: "https://terraria.org/", category: "Adventure", description: "2D exploration sandbox" },
  { id: "199", name: "Hades", thumbnail: "https://www.supergiantgames.com/favicon.ico", url: "https://www.supergiantgames.com/games/hades/", category: "Action", description: "Roguelike action" },
  { id: "200", name: "Dead Cells", thumbnail: "https://www.dead-cells.com/favicon.ico", url: "https://www.dead-cells.com/", category: "Action", description: "Roguelike platformer" },
];

const CATEGORIES = ["All", "Action", "Puzzle", "Arcade", "Card", "Board", "FPS", "Racing", "Sports", "Idle", "Strategy", "Adventure", "Casual", "Rhythm", "Word", "Horror", "MMO", "Simulation", "Platformer", "Creative", "Trivia", "Survival", "Social", "Metroidvania", "Battle Royale", "Fighting", "Music", "Virtual Pet"];

function GamesPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  const filteredGames = useMemo(() => {
    return GAMES.filter((g) => {
      const matchesSearch = g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === "All" || g.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [search, category]);

  return (
    <div className="min-h-screen px-4 pb-24 pt-20 md:px-8 animate-page-in">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <Gamepad2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Games</h1>
                <p className="text-sm text-muted-foreground">{filteredGames.length} free games to play instantly</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search games..."
                className="w-full rounded-xl border border-glass-border bg-card/40 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>

            {/* Category dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowCategories(!showCategories)}
                className="flex h-10 items-center gap-2 rounded-xl border border-glass-border bg-card/40 px-4 text-sm font-medium transition hover:bg-card/60"
              >
                {category}
                <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${showCategories ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {showCategories && (
                <div className="absolute right-0 top-12 z-50 max-h-80 w-48 overflow-y-auto rounded-xl border border-white/10 bg-card/95 p-2 backdrop-blur-xl shadow-2xl">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setCategory(cat); setShowCategories(false); }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                        category === cat ? "bg-primary/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Game grid */}
        {selectedGame ? (
          /* Game player */
          <div className="space-y-4">
            <button
              onClick={() => setSelectedGame(null)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to games
            </button>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedGame.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedGame.description}</p>
              </div>
              <a
                href={selectedGame.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Fullscreen className="h-4 w-4" />
                Open Fullscreen
              </a>
            </div>

            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-glass-border bg-zinc-900">
              <iframe
                src={selectedGame.url}
                className="h-full w-full"
                allow="fullscreen; autoplay; clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            </div>
          </div>
        ) : (
          /* Games grid */
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredGames.map((game) => (
              <button
                key={game.id}
                onClick={() => setSelectedGame(game)}
                className="group overflow-hidden rounded-2xl border border-glass-border bg-card/40 text-left transition hover:border-primary/40 hover:bg-card/60"
              >
                <div className="aspect-video w-full overflow-hidden bg-zinc-800">
                  <img
                    src={game.thumbnail}
                    alt={game.name}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://via.placeholder.com/320x180/1a1a2e/666?text=Game";
                    }}
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm line-clamp-1">{game.name}</h3>
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {game.category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{game.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
