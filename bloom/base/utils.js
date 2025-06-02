// Required dependencies
const moment = require('moment-timezone');
const { createInstanceModels } = require('../../colors/schema');
const setup = require('../../colors/setup');
const { isBloomKing } = require('../../colors/auth');
const mess = require('../../colors/mess');
const { timezone } = setup;

// Cache for instance models and logschats
const instanceModelsCache = new Map();
const logschatCache = new Map();

// Helper function to get models for the current instance
function getModels(instanceId) {
    if (!instanceModelsCache.has(instanceId)) {
        instanceModelsCache.set(instanceId, createInstanceModels(instanceId));
    }
    return instanceModelsCache.get(instanceId);
}

// Helper function to get logschat for the current instance
function getLogschat(instanceId) {
    if (!logschatCache.has(instanceId)) {
        try {
            // Use getInstanceConfig to get instance-specific configuration
            const config = setup.getInstanceConfig(instanceId);
            const logschat = config?.logschat;
            logschatCache.set(instanceId, logschat);
            
            if (!logschat) {
                console.warn(`⚠️ Warning: LOGS_CHAT is not configured for instance ${instanceId}. Logs will be disabled.`);
            }
        } catch (error) {
            console.error(`Error loading logschat for instance ${instanceId}:`, error);
            logschatCache.set(instanceId, null);
        }
    }
    return logschatCache.get(instanceId);
}

// Get current date in configured timezone
const getCurrentDate = () => moment().tz(timezone).format('MMMM Do YYYY, h:mm:ss a');

// Store pending deletions
const pendingDeletions = new Map();

// Helper function to safely send logs
async function sendLog(Bloom, message, skipQuote = false) {
    if (!Bloom?._instanceId) {
        console.warn('⚠️ Warning: No instance ID available for logging');
        return;
    }

    const logschat = getLogschat(Bloom._instanceId);
    if (!logschat) return; // Skip if logschat is not configured

    try {
        await Bloom.sendMessage(logschat, 
            skipQuote ? message : { ...message, quoted: null }
        );
    } catch (error) {
        console.error('Failed to send log message:', error);
    }
}

// Clear instance caches on cleanup
function cleanup() {
    instanceModelsCache.clear();
    logschatCache.clear();
    pendingDeletions.clear();
}

module.exports = {
    cleanup,
    ticket: {
        type: 'utility',
        desc: 'Create, check, list, mark or delete ticket(s)',
        usage: `ticket - (to list all tickets)
        ticket <issue> - to create new ticket
        ticket <ticketID> - check ticket details
        ticket <ticketID> <del/ongoing/resolved> - to delete or mark as ongoing/resolved
        ticket clear [all/open/closed] - clear tickets (admin only)`,
        run: async (Bloom, message, fulltext) => {
            try {
                const sender = message.key.remoteJid;
                const authorized = isBloomKing(sender, message);

                if (sender?.endsWith('@g.us') && !authorized) {
                    await Bloom.sendMessage(sender, { 
                        text: `❌ Ticket module works in private chats only, unless you are the bot admin.` 
                    }, { quoted: message });
                    return;
                }

                const parts = fulltext.trim().split(' ');
                const arg = parts[1] || '';
                const value = parts[2] || '';
                const ticketIdPattern = /^BB-\d{4}[A-Z]$/;

                // Handle confirmation first
                if (arg === 'confirm' && authorized) {
                    const pendingKey = `${sender}_${Bloom._instanceId}`;
                    const pending = pendingDeletions.get(pendingKey);
                    
                    if (!pending || Date.now() - pending.timestamp > 30000) {
                        await Bloom.sendMessage(sender, {
                            text: '❌ No pending ticket deletion or confirmation timeout.',
                            quoted: message
                        });
                        return;
                    }

                    try {
                        const { Ticket } = getModels(Bloom._instanceId);
                        const result = await Ticket.deleteMany(pending.query);
                        
                        await Bloom.sendMessage(sender, {
                            text: `✅ Successfully deleted ${result.deletedCount} ticket(s).`,
                            quoted: message
                        });

                        await sendLog(Bloom, {
                            text: `🗑️ Bulk ticket deletion by ${sender.split('@')[0]}:\n` +
                                 `• Deleted: ${result.deletedCount} ticket(s)\n` +
                                 `• Query: ${JSON.stringify(pending.query)}\n` +
                                 `• Date: ${getCurrentDate()}`
                        });

                    } catch (err) {
                        console.error('Error confirming ticket deletion:', err);
                        await Bloom.sendMessage(sender, {
                            text: `❌ Failed to delete tickets: ${err.message}`,
                            quoted: message
                        });
                    } finally {
                        pendingDeletions.delete(pendingKey);
                    }
                    return;
                }

                // Handle other commands
                if (!arg) {
                    await list(Bloom, sender, authorized);
                } else if (arg === 'clear' && authorized) {
                    await clearTickets(Bloom, message, value);
                } else if (ticketIdPattern.test(arg)) {
                    if (!value) {
                        await check(Bloom, message, arg, sender, authorized);
                    } else if (value === 'del') {
                        await del(Bloom, message, arg, sender, authorized);
                    } else if (['ongoing', 'resolved'].includes(value)) {
                        await mark(Bloom, message, arg, value, sender, authorized);
                    } else {
                        await Bloom.sendMessage(sender, { text: `❌ Invalid action.` });
                    }
                } else {
                    await create(Bloom, message, fulltext, sender);
                }
            } catch (error) {
                console.error('Ticket command error:', error);
                try {
                    await Bloom.sendMessage(message.key.remoteJid, {
                        text: '❌ An error occurred while processing your request.',
                        quoted: message
                    });
                } catch (sendError) {
                    console.error('Failed to send error message:', sendError);
                }
            }
        }
    },
    reminder: {
        type: 'utility',
        desc: 'Set a reminder. time & message',
        usage: 'reminder 10 Take a break',
        run: async (Bloom, message, fulltext) => {
            try {
                const { Reminder } = getModels(Bloom._instanceId);
                const args = fulltext.trim().split(' ');
                
                if (args.length < 3) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'Usage: reminder <minutes> <message>' 
                    });
                }

                const minutes = parseInt(args[1]);
                if (isNaN(minutes) || minutes <= 0) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: 'Please provide a valid number of minutes.' 
                    });
                }

                const reminderText = args.slice(2).join(' ');
                const remindAt = new Date(Date.now() + minutes * 60000);

                // Save reminder to DB
                const newReminder = new Reminder({
                    userId: message.key.participant || message.key.remoteJid,
                    chatId: message.key.remoteJid,
                    text: reminderText,
                    remindAt
                });

                await newReminder.save();

                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: `✅ Reminder set for ${minutes} minutes from now.` 
                });

            } catch (error) {
                console.error('Reminder command error:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ Failed to set reminder.' 
                });
            }
        }
    }
};

// ===== Sub-functions ===== //

async function generateTicketId(Counter) {
    try {
        const counter = await Counter.findOneAndUpdate(
            { name: 'ticket' }, {},
            { upsert: true, new: true }
        );

        let { number = 0, letter = 'A' } = counter;
        const id = `BB-${number.toString().padStart(4, '0')}${letter}`;

        if (letter === 'Z') {
            letter = 'A';
            number += 1;
        } else {
            letter = String.fromCharCode(letter.charCodeAt(0) + 1);
        }

        await Counter.findOneAndUpdate(
            { name: 'ticket' },
            { $set: { number, letter } }
        );

        return id;
    } catch (err) {
        console.error('Error generating ticket ID:', err);
        throw new Error('Failed to generate ticket ID');
    }
}

async function create(Bloom, message, fulltext, senderJid) {
    const { Ticket, Counter } = getModels(Bloom._instanceId);
    const realSender = message.key.participant || senderJid;
    const args = fulltext.trim().split(' ');
    const subject = args.slice(1).join(' ');

    if (!subject) {
        await Bloom.sendMessage(senderJid, { 
            text: mess.ticketarg 
        }, { quoted: message });
        return;
    }

    try {
        const openTicketCount = await Ticket.countDocuments({ 
            userId: realSender, 
            status: 'open'
        });

        if (openTicketCount >= 3) {
            await Bloom.sendMessage(senderJid, { 
                text: mess.limited 
            });
            return;
        }

        const ticketId = await generateTicketId(Counter);

        const newTicket = await Ticket.create({
            ticketId: ticketId,
            userId: realSender,
            subject: subject,
            status: 'open',
            messages: [{
                sender: realSender,
                content: subject
            }]
        });

        const date = getCurrentDate();

        // Send confirmation to user
        await Bloom.sendMessage(senderJid, {
            text: `╭──── 🧠\n│ _Ticket ID: ${ticketId}_\n│ _Status: ${newTicket.status}_\n│ *Use:* !ticket ${ticketId} to track.\n╰──── 🚀`,
        }, { quoted: message });

        // Send log message if logs are configured
        await sendLog(Bloom, {
            text: `╭──── 🧠\n│ User: ${realSender.split('@')[0]} raised a ticket\n│ ID: ${ticketId}\n│ Date: ${date}\n╰──── 🚀\n> Message: _${subject}_`
        });

    } catch (error) {
        console.error(`Error creating ticket:`, error);
        
        // Log error if logging is configured
        await sendLog(Bloom, {
            text: `❌ Failed to create ticket: ${error.message}`
        });
        
        // Always notify user of error
        await Bloom.sendMessage(senderJid, {
            text: '❌ Failed to create ticket. Please try again later.',
            quoted: message
        });
    }
}

async function list(Bloom, sender, isAdmin) {
    try {
        const { Ticket } = getModels(Bloom._instanceId);
        const tickets = isAdmin
            ? await Ticket.find().sort({ createdAt: -1 }).lean()
            : await Ticket.find({ userId: sender }).sort({ createdAt: -1 }).lean();

        if (!tickets.length) {
            await Bloom.sendMessage(sender, {
                text: isAdmin
                    ? '🟡 No tickets found.'
                    : '🟢 You have no open tickets.\nSend *!ticket your issue* to create one.',
            });
            return;
        }

        let output = isAdmin ? `🗂 All tickets:\n` : `📋 Your tickets:\n`;
        for (const t of tickets) {
            output += isAdmin
                ? `\n🔹 ID: ${t.ticketId}\n👤 User: ${t.userId.split('@')[0]}\n📌 Status: ${t.status}\n🕒 Created: ${new Date(t.createdAt).toLocaleString()}\n`
                : `\n🆔 *${t.ticketId}* | Status: ${t.status}`;
        }

        if (!isAdmin) {
            output += `\n\nView a ticket: *!ticket <ticket_id>*\nDelete: *!ticket <ticket_id> del*`;
        }

        await Bloom.sendMessage(sender, { text: output });

    } catch (err) {
        console.error('Error listing tickets:', err);
        await Bloom.sendMessage(sender, { 
            text: `❌ Error listing tickets: ${err.message}` 
        });
    }
}

async function check(Bloom, message, ticketId, sender, isAdmin) {
    try {
        const { Ticket } = getModels(Bloom._instanceId);
        const ticket = await Ticket.findOne(
            isAdmin ? { ticketId: ticketId } : { ticketId: ticketId, userId: sender }
        ).lean();

        if (!ticket) {
            await Bloom.sendMessage(sender, { 
                text: '❌ Ticket not found.' 
            }, { quoted: message });
            return;
        }

        let messageHistory = '';
        if (ticket.messages && ticket.messages.length > 0) {
            messageHistory = '\n\n💬 Messages:\n' + ticket.messages.map(m => 
                `${m.sender === sender ? '👤' : '🤖'} ${new Date(m.timestamp).toLocaleString()}\n${m.content}`
            ).join('\n\n');
        }

        await Bloom.sendMessage(sender, {
            text: `🧾 Ticket: ${ticket.ticketId}\n🗒 Subject: ${ticket.subject}\n📌 Status: ${ticket.status}\n🕒 Created: ${new Date(ticket.createdAt).toLocaleString()}${messageHistory}`
        }, { quoted: message });

    } catch (err) {
        console.error('Error checking ticket:', err);
        await Bloom.sendMessage(sender, { 
            text: `❌ Failed to fetch ticket: ${err.message}` 
        });
    }
}

async function del(Bloom, message, ticketId, sender, isAdmin) {
    try {
        const { Ticket } = getModels(Bloom._instanceId);
        const result = await Ticket.deleteOne(
            isAdmin ? { ticketId: ticketId } : { ticketId: ticketId, userId: sender }
        );

        if (!result.deletedCount) {
            await Bloom.sendMessage(sender, { 
                text: '❌ Ticket not found or no permission.' 
            }, { quoted: message });
            return;
        }

        await Bloom.sendMessage(sender, { 
            text: `🗑️ Ticket ${ticketId} deleted.` 
        }, { quoted: message });

        await sendLog(Bloom, {
            text: `🗑️ Ticket ${ticketId} deleted by ${sender.split('@')[0]}`
        });

    } catch (err) {
        console.error('Error deleting ticket:', err);
        await sendLog(Bloom, {
            text: `❌ Error deleting ticket ${ticketId}: ${err.message}`
        });
    }
}

async function mark(Bloom, message, ticketId, status, sender, isAdmin) {
    if (!['ongoing', 'resolved'].includes(status)) {
        await Bloom.sendMessage(sender, { 
            text: '❌ Invalid status.' 
        }, { quoted: message });
        return;
    }

    try {
        const { Ticket } = getModels(Bloom._instanceId);
        const ticket = await Ticket.findOneAndUpdate(
            isAdmin ? { ticketId: ticketId } : { ticketId: ticketId, userId: sender },
            { $set: { status } },
            { new: true }
        );

        if (!ticket) {
            await Bloom.sendMessage(sender, { 
                text: '❌ Ticket not found or no permission.' 
            }, { quoted: message });
            return;
        }

        await Bloom.sendMessage(sender, { 
            text: `🔄 Ticket ${ticketId} marked as *${status}*.` 
        }, { quoted: message });

    } catch (err) {
        console.error('Error updating status:', err);
        await Bloom.sendMessage(sender, { 
            text: `❌ Error: ${err.message}` 
        }, { quoted: message });
    }
}

async function clearTickets(Bloom, message, type = 'all') {
    const sender = message.key.remoteJid;
    
    try {
        const { Ticket } = getModels(Bloom._instanceId);
        let query = {};
        
        switch (type.toLowerCase()) {
            case 'open':
                query = { status: 'open' };
                break;
            case 'closed':
                query = { status: 'closed' };
                break;
            case 'all':
                // No query filter means all tickets
                break;
            default:
                await Bloom.sendMessage(sender, {
                    text: '❌ Invalid option. Use: clear [all/open/closed]',
                    quoted: message
                });
                return;
        }

        // Get count before deletion for confirmation
        const count = await Ticket.countDocuments(query);
        
        if (count === 0) {
            await Bloom.sendMessage(sender, {
                text: '❗ No tickets found to clear.',
                quoted: message
            });
            return;
        }

        // Confirm before deletion
        await Bloom.sendMessage(sender, {
            text: `⚠️ About to delete ${count} ${type} ticket(s).\nThis action cannot be undone!\n\nReply with *!ticket confirm* within 30 seconds to proceed.`,
            quoted: message
        });

        // Store pending deletion with instance-specific key
        const pendingKey = `${sender}_${Bloom._instanceId}`;
        const pendingDeletion = {
            query,
            count,
            timestamp: Date.now()
        };
        
        pendingDeletions.set(pendingKey, pendingDeletion);
        
        // Clear the pending deletion after 30 seconds
        setTimeout(() => {
            if (pendingDeletions.get(pendingKey) === pendingDeletion) {
                pendingDeletions.delete(pendingKey);
            }
        }, 30000);

    } catch (err) {
        console.error('Error clearing tickets:', err);
        await Bloom.sendMessage(sender, {
            text: `❌ Failed to clear tickets: ${err.message}`,
            quoted: message
        });
    }
}