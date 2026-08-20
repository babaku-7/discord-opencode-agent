# Discord OpenCode Agent

A Discord coding agent powered by [OpenCode](https://opencode.ai/) and Cohere's North Mini Code.

This project allows authorized Discord users to send coding tasks directly to an OpenCode coding agent through Discord.

## Features

- 🤖 Discord coding agent
- 🧠 OpenCode integration
- ⚡ Cohere North Mini Code
- 🔐 Discord user authorization
- 📁 Configurable workspace
- 💾 Persistent OpenCode sessions during runtime
- 🛑 Abort running tasks
- 🧹 Reset sessions
- 📊 Session status
- 💬 Automatic handling of long Discord responses
- 🟦 TypeScript
- 🟢 Node.js 22+

## Architecture

```text
    ┌──────────────┐
    │    Discord   │
    └──────┬───────┘
           │
           │ !code <task>
           ▼
┌──────────────────────┐
│ Discord OpenCode     │
│ Agent                │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    OpenCode Server   │
│      :4096           │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│       Cohere         │
│ North Mini Code      │
└──────────────────────┘
```

## Commands

| Command | Description |
|---|---|
| `!code <task>` | Send a coding task to OpenCode |
| `!status` | Show the current session status |
| `!reset` | Reset the current OpenCode session |
| `!abort` | Abort the current OpenCode task |
| `!help` | Show available commands |

### Example

```text
!code buat file hello.txt berisi Hello World
```

The agent will send the task to OpenCode and work inside the configured workspace.

## Requirements

Before running the project, make sure you have:

- Node.js 22.x
- npm
- Git
- A Discord application and bot
- OpenCode
- A configured Cohere provider/model in OpenCode

## Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/discord-opencode-agent.git
cd discord-opencode-agent
```

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Edit the environment variables:

```bash
nano .env
```

## Environment Variables

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
ALLOWED_USER_IDS=your_discord_user_id
OPENCODE_URL=http://127.0.0.1:4096
OPENCODE_WORKSPACE=/home/your-user/ai-workspace/projects
```

### DISCORD_BOT_TOKEN

Your Discord bot token.

**Never commit your real bot token to Git.**

### ALLOWED_USER_IDS

Discord user IDs allowed to use the coding agent.

Single user:

```env
ALLOWED_USER_IDS=123456789012345678
```

Multiple users:

```env
ALLOWED_USER_IDS=123456789012345678,987654321098765432
```

Users not listed here will be rejected by the bot.

### OPENCODE_URL

The URL of the OpenCode server.

Default:

```env
OPENCODE_URL=http://127.0.0.1:4096
```

### OPENCODE_WORKSPACE

The directory passed to OpenCode as its working directory.

Example:

```env
OPENCODE_WORKSPACE=/home/your-user/ai-workspace/projects
```

Use an absolute path.

## OpenCode Setup

Start the OpenCode server:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Verify that OpenCode is running:

```bash
curl -s http://127.0.0.1:4096/global/health
```

A healthy server should return something similar to:

```json
{
  "healthy": true,
  "version": "1.18.18"
}
```

Check available models:

```bash
opencode models
```

The current project uses:

```text
cohere/north-mini-code-1-0
```

Make sure the Cohere provider and model are available in your OpenCode configuration.

## Discord Bot Setup

Create a Discord application and bot through the Discord Developer Portal.

Enable **Message Content Intent** because the bot reads commands such as:

```text
!code
!status
!reset
!abort
!help
```

The bot needs permission to read and send messages in the channels where it operates.

Copy the bot token into `.env`:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
```

Find your Discord user ID using Developer Mode and add it to:

```env
ALLOWED_USER_IDS=your_discord_user_id
```

## Running the Project

### Development

```bash
npm run dev
```

### Type Check

```bash
npm run typecheck
```

### Build

```bash
npm run build
```

### Production

```bash
npm start
```

## Recommended Workflow

Start OpenCode first:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Then, in another terminal:

```bash
npm start
```

You should see something similar to:

```text
[Discord] Logged in as ...
[OpenCode] URL: http://127.0.0.1:4096
[Workspace] /home/your-user/ai-workspace/projects
[Security] 1 authorized user(s)
[Agent] Ready.
```

Then use Discord:

```text
!status
```

and:

```text
!code buat file test.txt berisi Hello World
```

## Project Structure

```text
discord-opencode-agent/
│
├── src/
│   ├── index.ts
│   └── opencode/
│       └── client.ts
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

## How Sessions Work

The bot maintains an OpenCode session based on:

```text
guildId:channelId:userId
```

Different users or channels can therefore have separate sessions.

Using:

```text
!reset
```

removes the current session mapping. The next `!code` request creates a new OpenCode session.

## Workspace

The workspace is configured using:

```env
OPENCODE_WORKSPACE=/home/your-user/ai-workspace/projects
```

The OpenCode SDK receives this directory when creating and prompting sessions.

For example:

```text
/home/your-user/ai-workspace/projects/
├── project-a/
├── project-b/
└── discord-opencode-agent/
```

For better security, use a dedicated workspace containing only repositories that you want the agent to access.

### Important

`OPENCODE_WORKSPACE` should **not** be treated as a complete operating-system sandbox.

Do not put sensitive files in the workspace.

Avoid giving the agent access to:

- SSH private keys
- API keys
- passwords
- `.env` files containing secrets
- personal documents
- system configuration
- unrelated private repositories

For production usage, a dedicated isolated workspace or container is recommended.

## Security

`ALLOWED_USER_IDS` restricts who can use the Discord bot.

Example:

```env
ALLOWED_USER_IDS=123456789012345678
```

Only users in this list can execute commands.

Never commit:

```text
.env
```

or files containing:

```text
API keys
Discord bot tokens
Cohere credentials
SSH keys
passwords
```

The project ignores local secrets with:

```gitignore
node_modules/
dist/
.env
.env.*
!.env.example
```

## Development Notes

The project uses:

- Node.js
- TypeScript
- discord.js
- @opencode-ai/sdk
- dotenv

Available npm scripts:

```text
npm run dev
npm run typecheck
npm run build
npm start
```

## Troubleshooting

### Bot does not start

Check that `.env` contains:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
```

Then run:

```bash
npm run typecheck
npm run build
```

### OpenCode connection error

Check:

```bash
curl -s http://127.0.0.1:4096/global/health
```

If OpenCode is not running:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

### User is not authorized

Check:

```env
ALLOWED_USER_IDS=your_discord_user_id
```

The value must be a Discord user ID, not a username, server ID, or channel ID.

### Agent cannot access the project

Check that `OPENCODE_WORKSPACE` is an absolute path and that the directory exists and is accessible by the user running OpenCode.

## Roadmap

- [ ] Streaming OpenCode responses
- [ ] Real-time agent status
- [ ] File change summaries
- [ ] `!diff` command
- [ ] Git integration
- [ ] Session persistence
- [ ] Better permission management
- [ ] Workspace isolation
- [ ] Docker sandbox
- [ ] Multiple model selection
- [ ] Better error recovery
- [ ] Web dashboard

## License

ISC
