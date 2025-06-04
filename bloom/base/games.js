const fs = require('fs');
const { createInstanceModels } = require('../../colors/schema');
const { createGame, joinGame, endGame, renderBoard, makeMove } = require('../ttthandle');
const { pokemon } = require('../../colors/pokemon');
const { openchat } = require('../../colors/setup');

// Pokemon game configuration
const pokemonNames = ['Pikachu', 'Charmander', 'Bulbasaur', 'Squirtle', 'Jigglypuff', 'Meowth', 'Psyduck', 'Eevee', 'Snorlax', 'Mewtwo'];
const animals = ['lion', 'buffalo', 'fox', 'monkey', 'ant', 'rabbit', 'dinosaur', 'zebra'];
const sizes = ['small', 'medium', 'big'];
const aquaticAnimals = ['whale', 'shark', 'fish', 'frog', 'blowfish', 'tropical_fish'];
const shopItems = { "wooden_axe": 100, "iron_axe": 200, "diamond_axe": 500, "golden_axe": 1000, "magic_wand": 2000, "fish_net": 1850, "fish_hook": 100, "spear": 450, "potion": 800, "hearb": 300 };
const itemEmojis = { "wooden_axe": "🪓", "iron_axe": "⛏️", "diamond_axe": "💎🪓", "golden_axe": "🪙🪓", "magic_wand": "🪄", "fish_net": "🎣", "fish_hook": "🪝", "spear": "⚔️", "potion": "🔮", "herb": "🫚" };
const itemCategories = { "wooden_axe": "mining", "iron_axe": "mining", "diamond_axe": "mining", "golden_axe": "mining", "magic_wand": "magic", "fish_net": "fishing", "fish_hook": "fishing", "spear": "fishing", "potion": "healing", "hearb": "healing" };
const animalEmojis = { lion: '🦁', buffalo: '🐃', fox: '🦊', monkey: '🐒', ant: '🐜', rabbit: '🐇', dinosaur: '🦖', zebra: '🦓' };
const aquaticAnimalEmojis = { whale: '🐋', shark: '🦈', fish: '🐟', frog: '🐸', blowfish: '🐡', tropical_fish: '🐠' };
const gambleMultipliers = {
    red: Math.floor(Math.random() * 1101) - 100,
    blue: Math.floor(Math.random() * 1101) - 100,
    green: Math.floor(Math.random() * 1101) - 100,
    yellow: Math.floor(Math.random() * 1101) - 100,
    purple: Math.floor(Math.random() * 1101) - 100,
    orange: Math.floor(Math.random() * 1101) - 100,
    pink: Math.floor(Math.random() * 1101) - 100,
    black: Math.floor(Math.random() * 1101) - 100,
    white: Math.floor(Math.random() * 1101) - 100
};

// Cache for instance models
const instanceModelsCache = new Map();

// Helper function to get models for the current instance
function getModels(instanceId) {
    if (!instanceModelsCache.has(instanceId)) {
        instanceModelsCache.set(instanceId, createInstanceModels(instanceId));
    }
    return instanceModelsCache.get(instanceId);
}

// Helper function to get or create user
async function getOrCreateUser(User, userId, name = null) {
    try {
        let user = await User.findById(userId);
        if (!user && name) {
            user = new User({
                _id: userId,
                name: name,
                walletBalance: 0,
                bankBalance: 0,
                inventory: {
                    mining: [],
                    magic: [],
                    fishing: [],
                    healing: [],
                    animals: [],
                    stones: [],
                    pokemons: []
                }
            });
            await user.save();
        }
        return user;
    } catch (error) {
        console.error('Error in getOrCreateUser:', error);
        return null;
    }
}

function calculateTransactionFee(arg) {
    let feePercentage = 0.02;
    if (arg <= 1000) feePercentage = 0.05;
    else if (arg <= 10000) feePercentage = 0.03;
    return arg * feePercentage;
}

module.exports = {
    bal: {
        type: 'economy',
        desc: 'Check your wallet and bank balance',
        run: async (Bloom, message, fulltext) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                
                const user = await getOrCreateUser(User, senderID);
                if (!user) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Database Error: Could not fetch your balance.' 
                    }, { quoted: message });
                }

                if (!user.name) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'You are not registered in the economy. Please register first.\n\n!reg <username>' 
                    }, { quoted: message });
                }

                const balanceInfo = {
                    user: user.name,
                    wallet: user.walletBalance.toLocaleString(),
                    bank: user.bankBalance.toLocaleString()
                };

                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: `👤 *${balanceInfo.user}'s Balance*\n\n` +
                          `💰 *Wallet:* ${balanceInfo.wallet}\n` +
                          `🏦 *Bank:* ${balanceInfo.bank}\n\n` +
                          `💵 *Total:* ${(user.walletBalance + user.bankBalance).toLocaleString()}`
                }, { quoted: message });
            } catch (error) {
                console.error('Balance check error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while checking your balance.' 
                }, { quoted: message });
            }
        }
    },

    reg: {
        type: 'economy',
        desc: 'Register or update your economy profile',
        run: async (Bloom, message, fulltext) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                const arg = fulltext.trim().split(/\s+/)[1];
                let name = arg || generateRandomName();

                if (!isValidName(name)) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'Invalid name. Name must be at least 4 characters long, contain only letters, and no symbols.' 
                    }, { quoted: message });
                }

                let user = await User.findById(senderID);
                if (user) {
                    const oldName = user.name;
                    user.name = name;
                    await user.save();
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `✅ Name updated successfully!\n\n*Old Name:* ${oldName}\n*New Name:* ${name}` 
                    }, { quoted: message });
                } else {
                    user = await getOrCreateUser(User, senderID, name);
                    if (!user) {
                        return await Bloom.sendMessage(message.key.remoteJid, { 
                            text: '❌ Registration failed. Please try again.' 
                        }, { quoted: message });
                    }
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `✨ *Welcome to the Economy!*\n\n` +
                              `👤 *Name:* ${name}\n` +
                              `💰 *Starting Balance:* 0\n\n` +
                              `Use !help economy to see available commands!`
                    }, { quoted: message });
                }
            } catch (error) {
                console.error('Registration error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred during registration.' 
                }, { quoted: message });
            }
        }
    },

    dep: {
        type: 'economy',
        desc: 'Deposit money into your bank account',
        run: async (Bloom, message, fulltext) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                const arg = parseFloat(fulltext.trim().split(/\s+/)[1]);

                if (isNaN(arg) || arg <= 0) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Please specify a valid amount to deposit.' 
                    }, { quoted: message });
                }

                const user = await getOrCreateUser(User, senderID);
                if (!user?.name) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'You need to register first. Use !reg <username>' 
                    }, { quoted: message });
                }

                if (user.walletBalance < arg) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `❌ Insufficient funds!\n\n` +
                              `💰 *Wallet Balance:* ${user.walletBalance.toLocaleString()}\n` +
                              `💸 *Amount to Deposit:* ${arg.toLocaleString()}`
                    }, { quoted: message });
                }

                if (arg > 100000) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ You cannot deposit more than 100,000 at once.' 
                    }, { quoted: message });
                }

                // Update balances
                user.walletBalance -= arg;
                user.bankBalance += arg;
                user.transactionHistory.push({
                    type: 'deposit',
                    amount: arg,
                    timestamp: new Date(),
                    result: 'success'
                });

                await user.save();

                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ *Deposit Successful!*\n\n` +
                          `💰 *Amount:* ${arg.toLocaleString()}\n` +
                          `👛 *New Wallet Balance:* ${user.walletBalance.toLocaleString()}\n` +
                          `🏦 *New Bank Balance:* ${user.bankBalance.toLocaleString()}`
                }, { quoted: message });
            } catch (error) {
                console.error('Deposit error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while processing your deposit.' 
                }, { quoted: message });
            }
        }
    },

    withd: {
        type: 'economy',
        desc: 'Withdraw money from your bank account',
        run: async (Bloom, message, fulltext) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                const arg = parseFloat(fulltext.trim().split(/\s+/)[1]);

                if (isNaN(arg) || arg <= 0) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Please specify a valid amount to withdraw.' 
                    }, { quoted: message });
                }

                const user = await getOrCreateUser(User, senderID);
                if (!user?.name) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'You need to register first. Use !reg <username>' 
                    }, { quoted: message });
                }

                if (arg > 500000) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ You cannot withdraw more than 500,000 at once.' 
                    }, { quoted: message });
                }

                const transactionFee = calculateTransactionFee(arg);
                const totalAmount = arg + transactionFee;

                if (user.bankBalance < totalAmount) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `❌ Insufficient funds!\n\n` +
                              `🏦 *Bank Balance:* ${user.bankBalance.toLocaleString()}\n` +
                              `💸 *Withdrawal Amount:* ${arg.toLocaleString()}\n` +
                              `💰 *Transaction Fee:* ${transactionFee.toLocaleString()}\n` +
                              `📊 *Total Required:* ${totalAmount.toLocaleString()}`
                    }, { quoted: message });
                }

                // Update balances
                user.bankBalance -= totalAmount;
                user.walletBalance += arg;
                user.transactionHistory.push({
                    type: 'withdraw',
                    amount: arg,
                    fee: transactionFee,
                    timestamp: new Date(),
                    result: 'success'
                });

                await user.save();

                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ *Withdrawal Successful!*\n\n` +
                          `💸 *Amount:* ${arg.toLocaleString()}\n` +
                          `💰 *Transaction Fee:* ${transactionFee.toLocaleString()}\n` +
                          `👛 *New Wallet Balance:* ${user.walletBalance.toLocaleString()}\n` +
                          `🏦 *New Bank Balance:* ${user.bankBalance.toLocaleString()}`
                }, { quoted: message });
            } catch (error) {
                console.error('Withdrawal error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while processing your withdrawal.' 
                }, { quoted: message });
            }
        }
    },

    trans: {
        type: 'economy',
        desc: 'Transfer money to another user',
        run: async (Bloom, message, fulltext) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                const args = fulltext.trim().split(/\s+/);
                const amount = parseFloat(args[1]);
                const phoneNumber = args[2];

                if (isNaN(amount) || amount <= 0) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Please specify a valid amount to transfer.' 
                    }, { quoted: message });
                }

                const sender = await getOrCreateUser(User, senderID);
                if (!sender?.name) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'You need to register first. Use !reg <username>' 
                    }, { quoted: message });
                }

                // Find receiver
                let receiver = null;
                if (phoneNumber && /^[0-9]{10,15}$/.test(phoneNumber)) {
                    const receiverId = await convertPhoneNumberToJID(phoneNumber);
                    receiver = await User.findById(receiverId);
                } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
                    const quotedUserId = message.message.extendedTextMessage.contextInfo.participant;
                    receiver = await User.findById(quotedUserId);
                }

                if (!receiver?.name) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Receiver not found or not registered in the economy.' 
                    }, { quoted: message });
                }

                if (amount > 150000) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ You cannot transfer more than 150,000 at once.' 
                    }, { quoted: message });
                }

                const transactionFee = calculateTransactionFee(amount);
                const totalAmount = amount + transactionFee;

                if (sender.walletBalance < totalAmount) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `❌ Insufficient funds!\n\n` +
                              `👛 *Your Balance:* ${sender.walletBalance.toLocaleString()}\n` +
                              `💸 *Transfer Amount:* ${amount.toLocaleString()}\n` +
                              `💰 *Transaction Fee:* ${transactionFee.toLocaleString()}\n` +
                              `📊 *Total Required:* ${totalAmount.toLocaleString()}`
                    }, { quoted: message });
                }

                // Perform transfer
                sender.walletBalance -= totalAmount;
                receiver.walletBalance += amount;

                // Record transaction history
                const timestamp = new Date();
                sender.transactionHistory.push({
                    type: 'transfer_sent',
                    amount: amount,
                    fee: transactionFee,
                    recipient: receiver._id,
                    timestamp,
                    result: 'success'
                });

                receiver.transactionHistory.push({
                    type: 'transfer_received',
                    amount: amount,
                    sender: sender._id,
                    timestamp,
                    result: 'success'
                });

                // Save both users
                await Promise.all([sender.save(), receiver.save()]);

                // Notify both users
                await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ *Transfer Successful!*\n\n` +
                          `👥 *To:* ${receiver.name}\n` +
                          `💸 *Amount:* ${amount.toLocaleString()}\n` +
                          `💰 *Fee:* ${transactionFee.toLocaleString()}\n` +
                          `👛 *New Balance:* ${sender.walletBalance.toLocaleString()}`
                }, { quoted: message });

                await Bloom.sendMessage(receiver._id, {
                    text: `💰 *Transfer Received!*\n\n` +
                          `👥 *From:* ${sender.name}\n` +
                          `💸 *Amount:* ${amount.toLocaleString()}\n` +
                          `👛 *New Balance:* ${receiver.walletBalance.toLocaleString()}`
                });

            } catch (error) {
                console.error('Transfer error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while processing your transfer.' 
                }, { quoted: message });
            }
        }
    },

    shop: {
        type: 'economy',
        desc: 'View available items in the shop',
        run: async (Bloom, message) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                
                const user = await getOrCreateUser(User, senderID);
                if (!user?.name) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'You need to register first. Use !reg <username>' 
                    }, { quoted: message });
                }

                // Create categorized shop display
                const categories = {
                    mining: '⛏️ *Mining Tools*',
                    magic: '🪄 *Magic Items*',
                    fishing: '🎣 *Fishing Gear*',
                    healing: '🧪 *Healing Items*'
                };

                let shopMessage = `🏪 *Welcome to the Shop*\n` +
                                `👤 *User:* ${user.name}\n` +
                                `💰 *Your Balance:* ${user.walletBalance.toLocaleString()}\n\n`;

                // Group items by category
                for (const [category, title] of Object.entries(categories)) {
                    shopMessage += `${title}\n`;
                    for (const [item, price] of Object.entries(shopItems)) {
                        if (itemCategories[item] === category) {
                            const emoji = itemEmojis[item] || "🛒";
                            shopMessage += `${emoji} ${item.replace(/_/g, ' ')}: ${price.toLocaleString()} 💰\n`;
                        }
                    }
                    shopMessage += '\n';
                }

                shopMessage += `\n💡 *To buy:* !buy <item_name>`;

                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: shopMessage 
                }, { quoted: message });
            } catch (error) {
                console.error('Shop error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while accessing the shop.' 
                }, { quoted: message });
            }
        }
    },

    buy: {
        type: 'economy',
        desc: 'Purchase an item from the shop',
        run: async (Bloom, message, fulltext) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                const itemName = fulltext.trim().split(/\s+/)[1]?.toLowerCase();

                if (!itemName) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Please specify an item to buy.\n\nUse !shop to see available items.' 
                    }, { quoted: message });
                }

                const user = await getOrCreateUser(User, senderID);
                if (!user?.name) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'You need to register first. Use !reg <username>' 
                    }, { quoted: message });
                }

                const itemPrice = shopItems[itemName];
                if (!itemPrice) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Invalid item. Use !shop to see available items.' 
                    }, { quoted: message });
                }

                if (user.walletBalance < itemPrice) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `❌ Insufficient funds!\n\n` +
                              `💰 *Your Balance:* ${user.walletBalance.toLocaleString()}\n` +
                              `💵 *Item Price:* ${itemPrice.toLocaleString()}\n` +
                              `📊 *Missing:* ${(itemPrice - user.walletBalance).toLocaleString()}`
                    }, { quoted: message });
                }

                // Get the category for the item
                const category = itemCategories[itemName];
                if (!category) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Item category not found.' 
                    }, { quoted: message });
                }

                // Update user's inventory and balance
                user.walletBalance -= itemPrice;
                if (!user.inventory[category]) {
                    user.inventory[category] = [];
                }
                user.inventory[category].push({
                    name: itemName,
                    purchasePrice: itemPrice,
                    purchaseDate: new Date()
                });

                // Record the purchase in transaction history
                user.transactionHistory.push({
                    type: 'purchase',
                    item: itemName,
                    amount: itemPrice,
                    category: category,
                    timestamp: new Date(),
                    result: 'success'
                });

                await user.save();

                const emoji = itemEmojis[itemName] || "🛒";
                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ *Purchase Successful!*\n\n` +
                          `${emoji} *Item:* ${itemName.replace(/_/g, ' ')}\n` +
                          `💰 *Price:* ${itemPrice.toLocaleString()}\n` +
                          `👛 *New Balance:* ${user.walletBalance.toLocaleString()}\n\n` +
                          `Use !inventory to view your items!`
                }, { quoted: message });
            } catch (error) {
                console.error('Purchase error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while processing your purchase.' 
                }, { quoted: message });
            }
        }
    },

    inv: {
        type: 'economy',
        desc: 'View your inventory',
        run: async (Bloom, message) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const user = await User.findById(senderID);
            let inventoryMessage = `╭───── ${user.name} ─────\n│-- _Your inventory_ --\n`;

            function formatItems(items, itemType) {
                const itemCount = {};
                items.forEach(item => {
                    itemCount[item.name] = (itemCount[item.name] || { count: 0, totalValue: 0 });
                    itemCount[item.name].count++;
                    itemCount[item.name].totalValue += item.value || item.miningUses;
                });

                let itemMessage = "";
                for (const [name, { count, totalValue }] of Object.entries(itemCount)) {
                    itemMessage += `│- ${name}  - ${count} | Usage: ${totalValue} time(s)\n`;
                }

                if (itemMessage === "") itemMessage = `│- No ${itemType} items\n`;
                return itemMessage;
            }

            inventoryMessage += "│──── Mining items: ⛏️ ───\n";
            inventoryMessage += formatItems(user.inventory.mining, "mining");
            inventoryMessage += "│──── Magic items: 🪄 ───\n";
            inventoryMessage += formatItems(user.inventory.magic, "magic");
            inventoryMessage += "│──── Fishing items: 🎣 ───\n";
            inventoryMessage += formatItems(user.inventory.fishing, "fishing");
            inventoryMessage += "│──── Healing items: ☮️ ───\n";
            inventoryMessage += formatItems(user.inventory.healing, "healing");
            inventoryMessage += "│──── Zoo animals: 🦁 ───\n";

            if (user.inventory.animals.length > 0) {
                const animalCount = {};
                let totalAnimalValue = 0;
                user.inventory.animals.forEach(animal => animalCount[animal.name] = (animalCount[animal.name] || 0) + 1);

                for (const [animalName, count] of Object.entries(animalCount)) {
                    const animal = user.inventory.animals.find(a => a.name === animalName);
                    const totalValue = animal.value * count;
                    totalAnimalValue += totalValue;
                    inventoryMessage += `│- ${animalName} | Count: ${count}, Value: ${totalValue} 💰\n`;
                }

                inventoryMessage += `│──>Total Animal Value: ${totalAnimalValue} 💰\n`;
            } else {
                inventoryMessage += "│- No animals\n";
            }

            inventoryMessage += "│──── Rare stones: 🪨 ───\n";

            if (user.inventory.stones.length > 0) {
                const stoneCount = {};
                let totalStoneValue = 0;

                user.inventory.stones.forEach(stone => {
                    if (!stoneCount[stone.name]) stoneCount[stone.name] = { count: 0, totalValue: 0 };
                    stoneCount[stone.name].count++;
                    stoneCount[stone.name].totalValue += stone.value;
                });

                for (const [stoneName, { count, totalValue }] of Object.entries(stoneCount)) {
                    inventoryMessage += `│- ${stoneName} - ${count} | Value: ${totalValue} 💰\n`;
                }

                for (const { totalValue } of Object.values(stoneCount)) {
                    totalStoneValue += totalValue;
                }

                inventoryMessage += `│──> Total Stones Value: ${totalStoneValue} 💰\n╰──────────────────`;
            } else {
                inventoryMessage += "│- No stones\n╰──────────────────";
            }

            Bloom.sendMessage(message.key.remoteJid, { text: inventoryMessage }, { quoted: message });
        }
    },

    hunt: {
        type: 'economy',
        desc: 'Go hunting for animals',
        run: async (Bloom, message) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                
                // Get or create user
                let user = await User.findById(senderID);
                if (!user) {
                    return Bloom.sendMessage(
                        message.key.remoteJid,
                        { text: 'You need to register first to use the hunt command. Use !reg <n> to register.' },
                        { quoted: message }
                    );
                }

                const currentDate = new Date();
                const cooldownTime = 600000; // 10 minutes in milliseconds

                // Check cooldown
                if (user.lastZooCatch) {
                    const timeDifference = currentDate - new Date(user.lastZooCatch);
                    if (timeDifference < cooldownTime) {
                        const remainingTime = Math.ceil((cooldownTime - timeDifference) / 60000);
                        return Bloom.sendMessage(
                            message.key.remoteJid,
                            { text: `🕒 You need to wait ${remainingTime} minute(s) before hunting again!` },
                            { quoted: message }
                        );
                    }
                }

                // Generate hunt results
                const randomAnimalIndex = Math.floor(Math.random() * animals.length);
                const animal = animals[randomAnimalIndex];
                const size = sizes[Math.floor(Math.random() * sizes.length)];
                const basePrice = Math.floor(Math.random() * 1000) + 100;
                const priceMultiplier = size === 'small' ? 0.5 : size === 'medium' ? 1 : 1.5;
                const finalPrice = Math.floor(basePrice * priceMultiplier);

                // Update user data
                user = await User.findByIdAndUpdate(
                    senderID,
                    {
                        $set: { lastZooCatch: currentDate },
                        $push: {
                            'inventory.animals': {
                                name: animal,
                                value: finalPrice,
                                caught: currentDate
                            },
                            transactionHistory: {
                                type: 'catch_animal',
                                arg: finalPrice,
                                animal: animal,
                                result: 'caught',
                                timestamp: currentDate
                            }
                        }
                    },
                    { new: true }
                );

                const emoji = animalEmojis[animal] || '🦁';
                await Bloom.sendMessage(
                    message.key.remoteJid,
                    {
                        text: `🎯 You went hunting and caught a ${size} ${emoji} ${animal} worth ${finalPrice} 💰!`
                    },
                    { quoted: message }
                );
            } catch (error) {
                console.error('Hunt command error:', error);
                await Bloom.sendMessage(
                    message.key.remoteJid,
                    { text: '❌ An error occurred while hunting. Please try again later.' },
                    { quoted: message }
                );
            }
        }
    },

    fish: {
        type: 'economy',
        desc: 'Go fishing for aquatic animals',
        run: async (Bloom, message) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const user = await User.findById(senderID);
            const currentDate = new Date();
            const lastCatchTime = new Date(user.lastFishCatch);
            const timeDifference = currentDate - lastCatchTime;

            if (timeDifference < 600000) return Bloom.sendMessage(message.key.remoteJid, {text: 'You need to wait a bit before you can fish again! Patience is key.'}, {quoted: message});

            user.lastFishCatch = currentDate;
            const randomAnimalIndex = Math.floor(Math.random() * aquaticAnimals.length);
            const aquaticAnimal = aquaticAnimals[randomAnimalIndex];
            const size = sizes[Math.floor(Math.random() * sizes.length)];
            const basePrice = Math.floor(Math.random() * 1000) + 100;
            const priceMultiplier = size === 'small' ? 0.5 : size === 'medium' ? 1 : 1.5;
            const finalPrice = basePrice * priceMultiplier;

            user.inventory.animals.push({ name: aquaticAnimal, value: finalPrice });
            user.transactionHistory.push({ type: 'catch_fish', arg: finalPrice, animal: aquaticAnimal, result: 'caught' });
            await user.save();

            Bloom.sendMessage(message.key.remoteJid, {text: `You went fishing and caught a ${size} ${aquaticAnimalEmojis[aquaticAnimal]} ${aquaticAnimal} worth ${finalPrice} 💰.`}, {quoted: message});
        }
    },

    gamble: {
        type: 'economy',
        desc: 'Gamble your money on colors',
        run: async (Bloom, message, fulltext) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const parts = fulltext.trim().split(/\s+/);
            const color = parts[1];
            const betAmountStr = parts[2];
            console.log(color)
            console.log(betAmountStr)
            const betAmount = parseInt(betAmountStr, 10);

            if (!gambleMultipliers[color]) return Bloom.sendMessage(message.key.remoteJid, { text: 'Invalid color. Please choose a valid color to gamble with.\neg: red, blue, green, yellow, purple, orange, pink, black, white' }, { quoted: message });
            if (isNaN(betAmount)) return Bloom.sendMessage(message.key.remoteJid, { text: 'Invalid bet amount. Please provide a valid positive number.' }, { quoted: message });

            const user = await User.findById(senderID);
            if (user.walletBalance < betAmount) return Bloom.sendMessage(message.key.remoteJid, { text: 'You do not have enough funds to gamble.' }, { quoted: message });
            if (betAmount > 10000) return Bloom.sendMessage(message.key.remoteJid, { text: 'You cannot gamble more than 10,000 💰.' }, { quoted: message });

            user.walletBalance -= betAmount;
            const multiplier = gambleMultipliers[color];
            const winnings = betAmount * (multiplier / 100);
            let resultMessage = `You chose ${color}. `;

            if (winnings > 0) {
                user.walletBalance += winnings;
                user.transactionHistory.push({type: 'gamble', arg: betAmount, result: 'win', transactionFee: 0 });
                await user.save();
                resultMessage += `Congratulations! You won ${winnings.toFixed(2)} 💰. Your new wallet balance is ${user.walletBalance} 💰.`;
            } else {
                user.transactionHistory.push({ type: 'gamble', arg: betAmount, result: 'lose', transactionFee: 0 });
                await user.save();
                resultMessage += `Sorry, you lost ${betAmount} 💰. Your new wallet balance is ${user.walletBalance} 💰.`;
            }

            Bloom.sendMessage(message.key.remoteJid, { text: resultMessage }, { quoted: message });
        }
    },

    work: {
        type: 'economy',
        desc: 'Work to earn money',
        run: async (Bloom, message) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const user = await User.findById(senderID);

            // Check if user is registered
            if (!user) {
                return Bloom.sendMessage(
                    message.key.remoteJid,
                    { text: 'You need to register first to use the work command. Use !reg <name> to register.' },
                    { quoted: message }
                );
            }

            const currentTime = new Date();
            const lastWorkTime = new Date(user.lastWork);
            const timeDifference = currentTime - lastWorkTime;

            if (timeDifference < 3600000) {
                return Bloom.sendMessage(
                    message.key.remoteJid,
                    { text: '⏳ You can work again in an hour.' },
                    { quoted: message }
                );
            }

            const jobs = {
                'scientist': 400,
                'miner': 200,
                'farmer': 150,
                'fisher': 100,
                'blacksmith': 300,
                'dentist': 350
            };
            const jobKeys = Object.keys(jobs);
            const randomJob = jobKeys[Math.floor(Math.random() * jobKeys.length)];
            const earnings = jobs[randomJob];

            user.walletBalance += earnings;
            user.lastWork = currentTime;
            user.transactionHistory.push({ type: 'work', arg: earnings, result: 'success' });
            await user.save();

            Bloom.sendMessage(
                message.key.remoteJid,
                { text: `👷‍♂️ You worked as a ${randomJob} and earned ${earnings} 💰. Your new wallet balance is ${user.walletBalance} 💰.` },
                { quoted: message }
            );
        }
    },

    daily: {
        type: 'economy',
        desc: 'Claim your daily reward',
        run: async (Bloom, message) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const user = await User.findById(senderID);

            if (!user) return Bloom.sendMessage(message.key.remoteJid, { text: 'You need to register first to claim your daily reward. Use `!reg <name>` to register.' }, { quoted: message });

            const now = new Date();
            const last = new Date(user.lastDailyClaim);
            const diff = now - last;

            if (diff < 86400000) {
                const msLeft = 86400000 - diff;
                const hours = Math.floor(msLeft / (1000 * 60 * 60));
                const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
                return Bloom.sendMessage(message.key.remoteJid, { text: `⏳ You can claim your next daily reward in ${hours} hr(s) ${minutes} min(s).` }, { quoted: message });
            }

            const reward = Math.floor(Math.random() * 500) + 100;
            user.walletBalance += reward;
            user.lastDailyClaim = now;
            user.transactionHistory.push({ type: 'daily_claim', arg: reward, result: 'success' });
            await user.save();

            Bloom.sendMessage(message.key.remoteJid, { text: `🎉 You've claimed your daily reward! You received ${reward} 💰. New wallet balance: ${user.walletBalance} 💰.` }, { quoted: message });
        }
    },

    sell: {
        type: 'economy',
        desc: 'Sell items from your inventory',
        run: async (Bloom, message, fulltext) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const arg = fulltext.trim().split(/\s+/)[1];
            const user = await User.findById(senderID);

            const animalIndex = user.inventory.animals.findIndex(item => item.name === arg);
            const stoneIndex = user.inventory.stones.findIndex(item => item.name === arg);

            if (animalIndex === -1 && stoneIndex === -1) return Bloom.sendMessage(message.key.remoteJid, { text: `You don't have a ${arg} to sell.` }, { quoted: message });

            let item;
            let itemType;
            let itemPrice;

            if (animalIndex !== -1) {
                item = user.inventory.animals[animalIndex];
                itemType = 'animal';
                itemPrice = item.value;
            }
            else if (stoneIndex !== -1) {
                item = user.inventory.stones[stoneIndex];
                itemType = 'stone';
                itemPrice = item.value;
            }

            if (!itemPrice) return Bloom.sendMessage(message.key.remoteJid, { text: `This ${arg} cannot be sold.` }, { quoted: message });

            user.walletBalance += itemPrice;

            if (itemType === 'animal') user.inventory.animals.splice(animalIndex, 1);
            else if (itemType === 'stone') user.inventory.stones.splice(stoneIndex, 1);

            user.transactionHistory.push({ type: `sell_${itemType}`, arg: itemPrice, [itemType]: arg, result: 'success' });
            await user.save();

            Bloom.sendMessage(message.key.remoteJid, { text: `You sold your ${arg} for ${itemPrice} 💰. Your new wallet balance is ${user.walletBalance} 💰.` }, { quoted: message });
        }
    },

    mine: {
        type: 'economy',
        desc: 'Mine for stones using your tools',
        run: async (Bloom, message) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const user = await User.findById(senderID);

            if (!user) return Bloom.sendMessage(message.key.remoteJid, { text: "You don't exist in the economy." }, { quoted: message });

            const toolLimits = { wooden_axe: 5, iron_axe: 10, golden_axe: 20, diamond_axe: 15 };
            const stoneTypes = {
                wooden_axe: ['coal'],
                iron_axe: ['coal','iron'],
                diamond_axe: ['coal','iron','diamond'],
                golden_axe:['coal','iron','diamond','gold']
            };

            const miningTool = user.inventory.mining.find(tool => tool.name);
            if (!miningTool) return Bloom.sendMessage(message.key.remoteJid, { text: "You don't have any mining tools!" }, { quoted: message });

            const tool = miningTool.name;
            const availableStones = stoneTypes[tool];
            const randomStone = availableStones[Math.floor(Math.random() * availableStones.length)];
            const randomSize = sizes[Math.floor(Math.random() * sizes.length)];
            let stoneValue;

            if (randomSize === 'small') stoneValue = 50;
            else if (randomSize === 'medium') stoneValue = 100;
            else stoneValue = 200;

            user.inventory.stones.push({ name: randomStone, value: stoneValue });
            let toolUsage = miningTool.miningUses || 0;
            toolUsage++;
            miningTool.miningUses = toolUsage;

            if (toolUsage >= toolLimits[tool]) {
                const toolIndex = user.inventory.mining.findIndex(t => t.name === tool);
                if (toolIndex !== -1) user.inventory.mining.splice(toolIndex, 1);
                user.transactionHistory.push({ type: 'mine', item: randomStone, result: 'success', arg: stoneValue });
                await user.save();
                return Bloom.sendMessage(message.key.remoteJid, { text: `You used your ${tool} and mined a ${randomSize} ${randomStone} rock worth ${stoneValue} 💰.\n\nYour ${tool} has broken after ${toolUsage} uses! You need a new one.` }, { quoted: message });
            }

            user.transactionHistory.push({ type: 'mine', item: randomStone, result: 'success', arg: stoneValue });
            await user.save();

            return Bloom.sendMessage(message.key.remoteJid, { text: `You used your ${tool} and mined a ${randomSize} ${randomStone} rock worth ${stoneValue} 💰. Your ${tool} has ${toolLimits[tool] - toolUsage} uses left.` }, { quoted: message });
        }
    },
    reset: {
        type: 'economy',
        desc: 'Reset your Economy account (warning: irreversible)',
        run: async (Bloom, message) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const user = await User.findById(senderID);

            user.walletBalance = 0;
            user.bankBalance = 0;
            user.inventory = { mining: [], magic: [], fishing: [], healing: [], animals: [], stones: [], miningUses: new Map() };
            user.transactionHistory = [];
            user.lastDailyClaim = new Date();
            user.lastZooCatch = new Date();
            user.lastGamble = new Date();
            user.lastWork = new Date();

            await user.save();

            Bloom.sendMessage(message.key.remoteJid, { text: `Your account has been purged and reset to default values, ${user.name}. All items and balances have been cleared.` }, { quoted: message });
        }
    },

    catch: {
        type: 'games',
        desc: 'Catch a Pokémon that has appeared',
        run: async (Bloom, message, fulltext) => {
            const { Pokemon } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            const arg = fulltext.trim().split(/\s+/)[1];
            const pokemon = await Pokemon.findOne({ name: { $regex: new RegExp('^' + arg + '$', 'i') } });

            if (!pokemon) return Bloom.sendMessage(message.key.remoteJid, { text: 'No claimable Pokémon found with that name, check your spelling mistake and try again.' }, { quoted: message });

            const currentTime = new Date();
            if (currentTime.getTime() > pokemon.timeout.getTime()) return Bloom.sendMessage(message.key.remoteJid, { text: `The Pokémon ${pokemon.name} has expired and is no longer available for claim.` }, { quoted: message });

            const user = await User.findOne({ _id: senderID });
            if (!user) return Bloom.sendMessage(message.key.remoteJid, { text: 'You are not registered yet. Please register first using the command: !reg <name>' }, { quoted: message });

            user.inventory.pokemons.push({
                name: pokemon.name,
                height: pokemon.height,
                weight: pokemon.weight,
                image: pokemon.image,
                description: pokemon.description
            });

            await user.save();
            await Pokemon.deleteOne({ name: pokemon.name });

            return Bloom.sendMessage(message.key.remoteJid, {
                text: `Congratulations! You have successfully claimed ${pokemon.name}\n\n${pokemon.description}.\nHeight: ${pokemon.height} \t\t\t Weight: ${pokemon.weight}`
            }, { quoted: message });
        }
    },
    pokes: {
        type: 'games',
        desc: 'View your Pokémon collection',
        run: async (Bloom, message) => {
            try {
                const { User } = getModels(Bloom._instanceId);
                const senderID = message.key.participant || message.key.remoteJid;
                const user = await User.findById(senderID);

                if (!user || !user.inventory || !user.inventory.pokemons || user.inventory.pokemons.length === 0) {
                    await Bloom.sendMessage(message.key.remoteJid, { text: "You don't have any Pokémon in your inventory yet! You avent caught any." }, { quoted: message });
                    return;
                }

                const pokemons = user.inventory.pokemons;
                let messageContent = "Here are the Pokémon in your inventory:\n\n";

                pokemons.forEach(pokemon => {
                    messageContent += `*${pokemon.name}*\n`;
                    messageContent += `- Height: ${pokemon.height} decimeters\n`;
                    messageContent += `- Weight: ${pokemon.weight} hectograms\n\n`;
                });

                await Bloom.sendMessage(message.key.remoteJid, { text: messageContent }, { quoted: message });
            } catch (error) {
                console.error('Error in pokedex function:', error);
                await Bloom.sendMessage(message.key.remoteJid, { text: "Oops! Something went wrong while fetching your Pokémon. Please try again later." }, { quoted: message });
            }
        }
    },
    pokedex: {
        type: 'games',
        desc: 'View any Pokémon details by name or ID',
        run: async (Bloom, message, fulltext) => {
            const { Pokemon } = getModels(Bloom._instanceId);
            const input = fulltext.trim().split(/\s+/)[1]?.toLowerCase();
            const chatId = message.key.remoteJid;

            if (!input) {
                await Bloom.sendMessage(chatId, { text: "Please provide a Pokémon name or ID to search for." }, { quoted: message });
                return;
            }

            try {
                const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${input}`);
                if (!res.ok) {
                    await Bloom.sendMessage(chatId, { text: `❌ Pokémon "${input}" does not exist.` }, { quoted: message });
                    return;
                }

                const pokemon = await res.json();
                // Get description from species endpoint
                const speciesRes = await fetch(pokemon.species.url);
                const speciesData = await speciesRes.json();

                const flavorEntry = speciesData.flavor_text_entries.find(entry => entry.language.name === 'en');
                const pokemonDescription = flavorEntry?.flavor_text || "No description available.";
                const cleanedDescription = pokemonDescription.replace(/\f/g, ' ').replace(/\n/g, ' ');

                const msg = `*${pokemon.name.toUpperCase()}*\n` +
                `Height: ${pokemon.height} decimeters\n` +
                `Weight: ${pokemon.weight} hectograms\n` +
                `Description: ${cleanedDescription}`;

                await Bloom.sendMessage(chatId, { text: msg }, { quoted: message });

            } catch (error) {
                console.error('Error in pokedex lookup:', error);
                await Bloom.sendMessage(chatId, { text: "⚠️ An error occurred while fetching Pokémon data. Please try again later." }, { quoted: message });
            }
        }
    },
    ttt: {
        type: 'games',
        desc: 'Tic Tac Toe game (create, join, end)',
        usage: `🎮 *TIC TAC TOE HELP* 🎮
        *Commands*:
        ➼ \`!ttt\` - Create new game (you're ❌)
        ➼ \`!ttt join\` - Join waiting game (you're ⭕)
        ➼ \`!ttt end\` - End current game
        ➼ \`1-9\` - Make a move (during game)

        *Rules*:
        1. ❌ always goes first
        2. Win by getting 3 in a row
        3. 5-min timeout for waiting games`,
        run: async (Bloom, message, fulltext) => {
            try {
                const sender = message.key.participant || message.key.remoteJid;
                const groupId = message.key.remoteJid;
                const arg = fulltext.trim().split(' ')[1];

                if (!groupId.endsWith('@g.us')) {
                    return await Bloom.sendMessage(groupId, {
                        text: '❌ This command only works in group chats.'
                    });
                }

                if (!arg) {
                    const res = await createGame(Bloom, sender, groupId);
                    if (res.error) {
                        return await Bloom.sendMessage(groupId, { text: res.error });
                    }

                    return await Bloom.sendMessage(groupId, {
                        text: `🎮 Tic Tac Toe game created!\n\n` +
                        `👤 Player 1: @${sender.split('@')[0]} (❌)\n` +
                        `Type *ttt join* to join as Player 2 (⭕)\n` +
                        `Game ID: ${res.roomId}`,
                        mentions: [sender]
                    });
                }

                if (arg === 'join') {
                    const res = await joinGame(Bloom, sender, groupId);
                    if (res.error) {
                        return await Bloom.sendMessage(groupId, { text: res.error });
                    }

                    const board = renderBoard(res.board);
                    return await Bloom.sendMessage(groupId, {
                        text: `✅ Game started!\n\n` +
                        `❌: @${res.player1.name || res.player1.jid.split('@')[0]}\n` +
                        `⭕: @${res.player2.name || res.player2.jid.split('@')[0]}\n\n` +
                        `${board}\n\n` +
                        `▶️ @${res.player1.jid.split('@')[0]}'s turn first (❌)`,
                        mentions: [res.player1.jid, res.player2.jid]
                    });
                }

                if (arg === 'end') {
                    const res = await endGame(Bloom, sender);
                    if (res.error) {
                        return await Bloom.sendMessage(groupId, { text: res.error });
                    }
                    return await Bloom.sendMessage(groupId, {
                        text: `✅ Game ended by @${sender.split('@')[0]}`,
                        mentions: [sender]
                    });
                }
                return await Bloom.sendMessage(groupId, {
                    text: '❗ Invalid command. Use:\n' +
                    '• `ttt` - Create game\n' +
                    '• `ttt join` - Join game\n' +
                    '• `ttt end` - End game'
                });

            } catch (err) {
                console.error('TTT Command Error:', err);
                const groupId = message?.key?.remoteJid;
                if (groupId) {
                    await Bloom.sendMessage(groupId, {
                        text: '⚠️ An error occurred while processing the game command'
                    });
                }
            }
        }
    },
    async _autoStartGame(Bloom) {
        const { Pokemon, BotSettings } = getModels(Bloom._instanceId);
        let isRunning = true;

        // Check if this is the active instance from BotSettings
        const settings = await BotSettings.findOne({});
        if (!settings || settings.activeInstance !== Bloom._instanceId) {
            console.log('This instance is not the active instance. Pokemon game will not run.');
            return () => { isRunning = false; };
        }

        console.log('Starting Pokemon game loop in the active instance');
        
        const gameLoop = async () => {
            if (!isRunning) {
                console.log('Pokemon game loop stopped');
                return;
            }
            
            // Verify this is still the active instance
            const currentSettings = await BotSettings.findOne({});
            if (!currentSettings || currentSettings.activeInstance !== Bloom._instanceId) {
                console.log('This instance is no longer active. Stopping Pokemon game.');
                isRunning = false;
                return;
            }
            
            try {
                await loadPokemons(Bloom);
                await handleExpiredPokemons(Bloom);
            } catch (error) {
                console.error('Pokemon game error:', error);
            }
            
            // Schedule next run in 30 minutes
            if (isRunning) {
                setTimeout(gameLoop, 30 * 60 * 1000); // 30 minutes in milliseconds
            }
        };

        // Start the first iteration
        gameLoop();

        // Return cleanup function
        return () => { 
            console.log('Stopping Pokemon game loop');
            isRunning = false; 
        };
    }
};

// Helper functions

async function loadPokemons(Bloom) {
    const { Pokemon } = getModels(Bloom._instanceId);
    try {
        const count = await Pokemon.countDocuments();
        if (count === 0) { // Only spawn if there are no active Pokemon
            const newPokemon = await pokemon();
            if (!newPokemon) {
                console.error('Failed to fetch Pokemon data');
                return;
            }
            const timeout = new Date(Date.now() + 5 * 60 * 1000);
            
            const pokemonDoc = new Pokemon({
                name: newPokemon.name,
                weight: newPokemon.weight,
                height: newPokemon.height,
                image: newPokemon.image,
                description: newPokemon.description,
                timeout
            });
            
            await pokemonDoc.save();
            await Bloom.sendMessage(openchat, {
                image: { url: newPokemon.image },
                caption: `🎮 A wild ${newPokemon.name} appeared!\nUse !catch ${newPokemon.name} to catch it!\nExpires in 5 minutes.`
            });
        }
    } catch (error) {
        console.error('Error loading pokemons:', error);
    }
}

async function handleExpiredPokemons(Bloom) {
    const { Pokemon } = getModels(Bloom._instanceId);
    try {
        const expiredPokemons = await Pokemon.find({ timeout: { $lt: new Date() } });
        for (const pokemon of expiredPokemons) {
            await Pokemon.findByIdAndDelete(pokemon._id);
            await Bloom.sendMessage(openchat, { text: `⌛ The wild ${pokemon.name} has fled!` });
        }
    } catch (error) {
        console.error('Error handling expired pokemons:', error);
    }
}

async function convertPhoneNumberToJID(value) {
    return `${value}@s.whatsapp.net`;
}

function generateRandomName() {
    const randomIndex = Math.floor(Math.random() * pokemonNames.length);
    return pokemonNames[randomIndex];
}

function isValidName(name) {
    const regex = /^[A-Za-z]{4,}$/;
    return regex.test(name);
}

/* Helper function to render the TTT board
function renderBoard(board) {
    const cells = board.map(cell => cell || '　');
    return `╭───┬───┬───╮
│ ${cells[0]} │ ${cells[1]} │ ${cells[2]} │
├───┼───┼───┤
│ ${cells[3]} │ ${cells[4]} │ ${cells[5]} │
├───┼───┼───┤
│ ${cells[6]} │ ${cells[7]} │ ${cells[8]} │
╰───┴───┴───╯`;
}

*/