const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const mongoose = require('mongoose');
const activeTimeouts = new Map();
const db = require('../utils/database');
const { createInstanceModels } = require('../colors/schema');
const { log } = require('../utils/logger');

// Cache for instance models
const instanceModelsCache = new Map();

// Helper function to get models for the current instance
async function getModels(instanceId) {
    if (!instanceModelsCache.has(instanceId)) {
        const models = await createInstanceModels(instanceId);
        instanceModelsCache.set(instanceId, models);
    }
    return instanceModelsCache.get(instanceId);
}

function renderBoard(board) {
    const emojiMap = { ' ': '⏺️', '❌': '❌', '⭕': '⭕' };
    let rendered = '';
    for (let i = 0; i < 9; i += 3) {
        rendered += board.slice(i, i + 3).map(cell => emojiMap[cell]).join(' ') + '\n';
    }  return rendered.trim(); }

function checkWinner(board) {
    const wins = [ [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6] ];
    for (const [a, b, c] of wins) {
        if (board[a] !== ' ' && board[a] === board[b] && board[b] === board[c]) {
            return board[a]; } }  return board.includes(' ') ? null : 'draw'; }

async function createGame(Bloom, senderJid, groupId) {
    const models = await getModels(Bloom._instanceId);
    const { TicTacToe } = models;
    
    // Check for existing ACTIVE games first
    const existingActive = await TicTacToe.findOne({
        $or: [{ 'player1.jid': senderJid }, { 'player2.jid': senderJid }],
        status: 'active'
    });
    if (existingActive) return { error: 'You are already in an active game. Use tttend to leave.' };

    // Then check for waiting games
    const existingWaiting = await TicTacToe.findOne({
        'player1.jid': senderJid, status: 'waiting' });
    if (existingWaiting) return { error: 'You already have a waiting game. Use tttend to cancel it.' };

    const roomId = uuidv4().split('-')[0];
    const game = new TicTacToe({ roomId,  groupId,
        player1: { jid: senderJid, symbol: '❌' },
        player2: { jid: null, symbol: '⭕' },
        currentTurn: senderJid, board: Array(9).fill(' '), status: 'waiting',
        timeoutAt: new Date(Date.now() + 5 * 60 * 1000) });

    await game.save();
    const timeout = setTimeout(async () => {
        const g = await TicTacToe.findOne({ roomId, status: 'waiting' });
        if (g) {
            g.status = 'ended'; await g.save();
        }
        activeTimeouts.delete(roomId);
    }, 5 * 60 * 1000);

    activeTimeouts.set(roomId, timeout);
    return { success: true, roomId };
}

async function joinGame(Bloom, senderJid, groupId) {
    const models = await getModels(Bloom._instanceId);
    const { TicTacToe } = models;
    
    // Debug log
    console.log(`[DEBUG] Attempting to join game. GroupID: ${groupId}, Sender: ${senderJid}`);
    
    // Find an available game in this group
    const game = await TicTacToe.findOne({
        groupId: groupId,
        status: 'waiting',
        'player2.jid': null
    });

    // Debug log game state
    console.log('[DEBUG] Found game:', game);

    if (!game) {
        return { error: 'No available game to join in this group.' };
    }

    if (game.player1.jid === senderJid) {
        return { error: '🚫 You cannot join your own game.' };
    }

    // Check if player is already in another game
    const existingGame = await TicTacToe.findOne({
        $or: [
            { 'player1.jid': senderJid, status: { $in: ['waiting', 'active'] } },
            { 'player2.jid': senderJid, status: 'active' }
        ]
    });

    if (existingGame) {
        return { error: '🚫 You are already in another game. End it first with !ttt end' };
    }

    // Update game state
    game.player2 = {
        jid: senderJid,
        symbol: '⭕'
    };
    game.status = 'active';
    game.currentTurn = game.player1.jid;
    await game.save();

    // Clear timeout if exists
    if (activeTimeouts.has(game.roomId)) {
        clearTimeout(activeTimeouts.get(game.roomId));
        activeTimeouts.delete(game.roomId);
    }

    console.log(`[DEBUG] Game joined successfully. Current state:`, game);
    return {
        success: true,
        roomId: game.roomId,
        board: game.board,
        player1: game.player1,
        player2: game.player2
    };
}

async function makeMove(Bloom, senderJid, position) {
    const models = await getModels(Bloom._instanceId);
    const { TicTacToe } = models;
    
    const game = await TicTacToe.findOne({
        $or: [{ 'player1.jid': senderJid }, { 'player2.jid': senderJid }],
        status: 'active'
    }).select('player1 player2 currentTurn board status');

    if (!game) return { error: 'You are not in an active game.' };
    if (senderJid !== game.currentTurn) { return { error: '⏳ Wait for your turn!' };  }
    const idx = position - 1;
    if (idx < 0 || idx > 8 || game.board[idx] !== ' ') { return { error: '⚠️ Invalid move. Choose an empty position (1-9)' }; }
    const symbol = senderJid === game.player1.jid ? '❌' : '⭕';
    game.board[idx] = symbol;

    const result = checkWinner(game.board);
    if (result === '❌' || result === '⭕') {
        game.status = 'ended'; await game.save();
        const winner = senderJid === game.player1.jid ? game.player1 : game.player2;
        return {
            status: 'win',
            winnerJid: senderJid,
            winnerName: winner.name || `Player ${senderJid === game.player1.jid ? '1' : '2'}`,
            board: game.board,
            winnerPrefix: winner.jid.split('@')[0]
        };
    }
    else if (result === 'draw') { game.status = 'ended'; await game.save(); return { status: 'draw', board: game.board }; }

    game.currentTurn = senderJid === game.player1.jid ? game.player2.jid : game.player1.jid;
    await game.save();
    const nextPlayer = game.currentTurn === game.player1.jid ? game.player1 : game.player2;

    return { status: 'continue', board: game.board, nextPlayer: { jid: nextPlayer.jid,
            name: nextPlayer.name || `Player ${nextPlayer === game.player1 ? '1' : '2'}`,
            symbol: nextPlayer === game.player1 ? '❌' : '⭕' } };; }

async function endGame(Bloom, senderJid) {
    const models = await getModels(Bloom._instanceId);
    const { TicTacToe } = models;
    
    const game = await TicTacToe.findOne({
        $or: [{ 'player1.jid': senderJid }, { 'player2.jid': senderJid }],
        status: { $ne: 'ended' } });

    if (!game) return { error: 'Game not found' };

    game.status = 'ended';  await game.save();

    if (activeTimeouts.has(game.roomId)) {
        clearTimeout(activeTimeouts.get(game.roomId));
        activeTimeouts.delete(game.roomId);
    }  return { success: true }; }

async function cleanupStaleGames(Bloom) {
    try {
        const models = await getModels(Bloom._instanceId);
        const { TicTacToe } = models;
        const now = new Date();

        const waitingResult = await TicTacToe.deleteMany({
            status: 'waiting',
            timeoutAt: { $lt: now }
        }).maxTimeMS(30000);

        const endedResult = await TicTacToe.deleteMany({
            status: { $in: ['ended', 'active'] },
            updatedAt: { $lt: new Date(now - 24 * 60 * 60 * 1000) }
        }).maxTimeMS(30000);

        console.log(`♻️ Cleaned: ${waitingResult.deletedCount} waiting, ${endedResult.deletedCount} ended games`);
    } catch (err) {
        console.error('❌ Cleanup error:', err.message);
    }
}

function initializeCleanup(Bloom) {
    const checkDB = async () => {
        try {
            await cleanupStaleGames(Bloom);
            cron.schedule('*/10 * * * *', () => cleanupStaleGames(Bloom));
            console.log('🔄 Cleanup for TicTacoe: (every 10m)');
        } catch (error) {
            console.error('❌ Failed to initialize cleanup:', error);
            setTimeout(() => checkDB(), 5000);
        }
    };
    checkDB();
}

async function tttmove(Bloom, message, fulltext){
    try {
        const sender = message.key.participant || message.key.remoteJid;
        const group = message.key.remoteJid;
        const move = parseInt(fulltext.trim());

        // Validate
        if (isNaN(move) || move < 1 || move > 9) {
            return await Bloom.sendMessage(group, { text: '⚠️ Please enter a number between 1-9' }); }
        const models = await getModels(Bloom._instanceId);
        const { TicTacToe } = models;
        const game = await TicTacToe.findOne({
            groupId: group,
            status: 'active'
        }).select('player1 player2 currentTurn board status').lean();

        if (!game) { return await Bloom.sendMessage(group, { text: '❌ No active game found. Start a new game with !ttt' }); }
        const players = [game.player1.jid, game.player2.jid];
        if (!players.includes(sender)) { return await Bloom.sendMessage(group, { text: '🚫 You are not a player in this game' }); }

        const result = await makeMove(Bloom, sender, move);

        if (result.error) { return await Bloom.sendMessage(group, { text: result.error }); }
        const boardText = renderBoard(result.board);

        if (result.status === 'win') {
            await Bloom.sendMessage(group, {
                text: `🎉 @${result.winnerPrefix} (${result.winnerName}) wins!\n\n${boardText}`,
                                    mentions: [result.winnerJid]
            });
            await endGame(Bloom, group);
        }
        else if (result.status === 'draw') {
            await Bloom.sendMessage(group, { text: `🤝 Game ended in draw!\n\n${boardText}` });
            await endGame(Bloom, group);
        }
        else {
            await Bloom.sendMessage(group, {
                text: `${boardText}\n\n🎯 @${result.nextPlayer.jid.split('@')[0]}'s turn (${result.nextPlayer.symbol})`,
                                    mentions: [result.nextPlayer.jid]  }); }

    } catch (err) {
        console.error('TTT Move Error:', err);
        const group = message?.key?.remoteJid;
        if (group) {
            await Bloom.sendMessage(group, { text: '⚠️ An error occurred during the move' }); } } }

async function startReminderChecker(Bloom) {
    if (!Bloom._instanceId) {
        log('❌ No instance ID found for reminder checker');
        return;
    }

    try {
        // Get instance-specific models
        const models = await getModels(Bloom._instanceId);
        const { Reminder } = models;
        log(`✅ Starting reminder checker for instance ${Bloom._instanceId}`);
        
        setInterval(async () => {
            try {
                const now = new Date();
                const dueReminders = await Reminder.find({ remindAt: { $lte: now }, reminded: false });
                
                for (const r of dueReminders) {
                    try {
                        await Bloom.sendMessage(r.userId, { text: `⏰ Reminder: ${r.text}` });
                        r.reminded = true;
                        await r.save();
                    } catch (e) { 
                        log(`Failed to send reminder for ${Bloom._instanceId}:`, e); 
                    } 
                }
            } catch (err) {
                log(`Error checking reminders for ${Bloom._instanceId}:`, err);
            }
        }, 60000);
    } catch (error) {
        log(`Failed to initialize reminder checker for ${Bloom._instanceId}:`, error);
        throw error;
    }
}

module.exports = {  createGame, joinGame, makeMove, endGame, renderBoard, checkWinner, initializeCleanup, tttmove, startReminderChecker };