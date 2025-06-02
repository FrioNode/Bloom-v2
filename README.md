# 🌸 Bloom Bot

A robust, multi-instance WhatsApp bot written in JavaScript, powered by Baileys. Bloom features an advanced instance management system, MongoDB integration, and over 400 commands.

## ✨ Key Features

### 🔄 Multi-Instance Management
- Supports running 3 bot instances simultaneously
- Smart instance rotation system with MongoDB state management
- Instance-specific command handling and configuration
- Seamless instance switching using `!bloom` command

### 🛡️ Advanced Middleware System
- Instance state validation
- User ban system with reason tracking
- Maintenance mode support
- Group-specific settings
- Command type flags (games, NSFW, etc.)
- AFK status checking

### 💾 Database Integration
- MongoDB-based state management
- Instance-specific models
- User activity tracking
- Transaction history
- Experience points system
- Group settings persistence

### 🎮 Features & Commands
- Economy system with wallet and bank
- Gaming system with TicTacToe and more
- Pokemon catching and trading
- Mining and fishing activities
- Inventory management
- Group management tools
- NSFW content filtering
- Anti-link protection
- Ticket system for support

### 🔧 Technical Features
- Instance-specific session management
- Automatic rotation between instances
- Hot-reload support for development
- Comprehensive error handling
- Detailed logging system
- Beautiful UI with consistent formatting

## 🚀 Setup

1. Clone the repository
\`\`\`bash
git clone https://github.com/yourusername/Bloom-v2.git
cd Bloom-v2
\`\`\`

2. Install dependencies
\`\`\`bash
npm install
\`\`\`

3. Configure environment variables
\`\`\`env
# Core Configuration
MONGODB_URI=your_mongodb_uri
NODE_ENV=development
BOT_NAME=Bloom
PREFIX=!

# Instance Configuration
SESSION_1=BLOOM~your_session_token_1
SESSION_2=BLOOM~your_session_token_2
SESSION_3=BLOOM~your_session_token_3

# Owner Configuration
OWNERNUMBER=your_number
DEVNAME=your_name

# Optional Settings
TIMEZONE=Africa/Nairobi
MODE=public  # public, private, or group
\`\`\`

4. Start the bot
- npm - not recomended
\`\`\`bash
npm start 
\`\`\`
or using pm2 (if installed)
- pm2 - I recomend this
\`\`\`bash
pm2 start 
\`\`\`
## 📚 Documentation

### Instance Management
- Use \`!bloom bot1/bot2/bot3\` to switch active instances
- Only one instance handles commands at a time
- Automatic rotation based on configured hours
- Instance state persists in MongoDB

### User Commands
- \`!help\` - View all commands
- \`!menu\` - Display command menu
- \`!stats\` - Show bot statistics
- \`!profile\` - View your profile
- And 400+ more commands!

### Admin Commands
- Instance management
- User ban/unban
- Group settings
- Maintenance mode
- System statistics

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License
This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits
- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [MongoDB](https://www.mongodb.com/) - Database
- [Node.js](https://nodejs.org/) - Runtime
- All other contributors and dependencies

## 📞 Contact
For support or queries:
- Open a ticket using \`!ticket\` command in the bot
- GitHub Issues
- Developer: ${devname}

---
> A reason to imagine ☁️ 