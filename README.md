# Discord OpenCode Agent

Discord bot front-end for an OpenCode coding agent.

This project lets authorized users run coding tasks from Discord, reuse OpenCode sessions, switch models, and monitor progress in a cleaner Discord interface.

## Highlights

- Discord command interface for OpenCode
- Discord Components V2 message layout
- Live progress updates while a task is running
- Support for both `!` commands and slash commands
- Session reuse and reset support
- Model switching in Discord
- Long response handling without noisy multi-message spam

## Supported models

- Cohere North Mini Code
- Google Gemini 3.1 Flash-Lite

## Command set

Classic commands:

| Command | Description |
|---|---|
| `!code <prompt>` | Run a request through OpenCode |
| `!model` | Show the active model |
| `!model cohere` | Switch to Cohere |
| `!model gemini` | Switch to Gemini |
| `!status` | Show bot and session status |
| `!session` | Show the current session |
| `!reset` | Reset the session |
| `!abort` | Abort the active task |
| `!help` | Show available commands |

Slash commands:

| Command | Description |
|---|---|
| `/code <prompt>` | Run a request through OpenCode |
| `/model` | Show or change the active model |
| `/status` | Show the current status |
| `/session` | Show the current session |
| `/reset` | Reset the current session |
| `/abort` | Abort the active task |
| `/help` | Show available commands |

## Components V2 update

The bot now uses Discord Components V2 for most response cards and status output. This keeps the interface more modern and consistent, especially for status panels, live work updates, and long text output.

Key points:

- response payloads use `MessageFlags.IsComponentsV2`
- status and session panels are rendered in container format
- long output is collapsed into a single safe Discord message instead of flooding the channel
- slash commands are registered to a guild when `DISCORD_GUILD_ID` is set, which makes them appear faster in a specific server

## Requirements

- Node.js 22+
- npm
- Discord bot token
- OpenCode running locally or on a reachable host
- A valid OpenCode model/provider configured in the OpenCode environment

## Setup

Install dependencies:

```bash
npm install
```

Copy the environment file:

```bash
cp .env.example .env
```

Update `.env` with your values:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=
ALLOWED_USER_IDS=your_discord_user_id
OPENCODE_URL=http://127.0.0.1:4096
OPENCODE_WORKSPACE=/home/your-user/ai-workspace/projects
```

## OpenCode setup

Start the OpenCode server:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Check the health endpoint:

```bash
curl -s http://127.0.0.1:4096/global/health
```

If the service is healthy, the bot can connect to it and begin processing requests.

## Run the bot

```bash
npm start
```

## Notes

- `ALLOWED_USER_IDS` controls which Discord users can access the bot.
- If slash commands are not appearing immediately, set `DISCORD_GUILD_ID` to the target guild ID and restart the bot.
- The OpenCode server must stay running before the Discord bot can work correctly.

The project currently uses:

```text
cohere/north-mini-code-1-0
google/gemini-3.1-flash-lite
```

Make sure the required provider credentials are configured in OpenCode.

## OpenCode Authentication

The Discord agent does not directly communicate with Cohere or Google.

The architecture is:

```text
Discord Bot
    ↓
OpenCode SDK
    ↓
OpenCode Server
    ↓
AI Provider
```

Provider authentication must therefore be configured in OpenCode.

Check configured authentication:

```bash
opencode auth list
```

If a provider is not authenticated, configure it using the OpenCode authentication flow.

## Discord Bot Setup

Create a Discord application and bot through the Discord Developer Portal.

Enable:

- Message Content Intent

The bot reads commands such as:

```text
!code
!model
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
[Models] Cohere North Mini Code + Google Gemini 3.1 Flash-Lite
[Agent] Ready.
```

Then use Discord:

```text
!status
```

Select a model:

```text
!model gemini
```

Then send a coding task:

```text
!code buat file test.txt berisi Hello World
```

## Project Structure

```text
discord-opencode-agent/
│
├── src/
│   ├── index.ts
│   │
│   ├── config.ts
│   ├── models.ts
│   ├── state.ts
│   │
│   ├── commands/
│   │   ├── code.ts
│   │   ├── help.ts
│   │   ├── model.ts
│   │   ├── session.ts
│   │   └── status.ts
│   │
│   ├── opencode/
│   │   ├── client.ts
│   │   └── events.ts
│   │
│   └── utils/
│       └── discord.ts
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

### Source Responsibilities

#### `src/index.ts`

Main Discord entry point responsible for Discord client initialization, message handling, command routing, error handling, and bot login.

#### `src/config.ts`

Loads and validates environment variables.

#### `src/models.ts`

Contains supported agent models.

#### `src/state.ts`

Stores runtime state:

- OpenCode sessions
- Running tasks
- Selected models

#### `src/commands/`

Contains Discord command handlers:

```text
code.ts
```

Handles coding tasks.

```text
model.ts
```

Handles model selection.

```text
status.ts
```

Handles agent status.

```text
session.ts
```

Handles session reset and task abortion.

```text
help.ts
```

Handles command help.

#### `src/opencode/client.ts`

Wrapper around the OpenCode SDK.

Responsible for:

- Creating sessions
- Sending prompts
- Selecting models
- Aborting sessions
- Passing the workspace directory

#### `src/opencode/events.ts`

Handles OpenCode event streaming and live task progress.

#### `src/utils/discord.ts`

Contains reusable Discord helpers such as:

- Session key generation
- Authorization checks
- Response extraction
- Long-message handling

## How Sessions Work

The bot maintains an OpenCode session based on:

```text
guildId:channelId:userId
```

This means different users or channels can have separate runtime sessions.

Using:

```text
!reset
```

removes the current session mapping.

The next `!code` request creates a new OpenCode session.

### Important

Sessions are currently stored in memory.

Restarting the Discord bot clears the session mappings.

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
Google credentials
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

- Node.js 22+
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

### Model is not available

Check:

```bash
opencode models
```

For Gemini:

```bash
opencode models | grep "gemini-3.1-flash-lite"
```

For Cohere:

```bash
opencode models | grep "north-mini-code"
```

If the model does not appear, check the OpenCode provider configuration and authentication.

### User is not authorized

Check:

```env
ALLOWED_USER_IDS=your_discord_user_id
```

The value must be a Discord user ID, not a username, server ID, or channel ID.

### Agent cannot access the project

Check that `OPENCODE_WORKSPACE` is an absolute path and that the directory exists and is accessible by the user running OpenCode.

### Agent returns an empty text response

Some coding tasks primarily perform tool operations such as creating or modifying files.

In these cases, OpenCode may complete the task without returning a normal assistant text response.

Check the configured workspace for the resulting files.

The Discord agent will still display the OpenCode task progress and completion status.

## Roadmap

- [x] Discord coding agent
- [x] OpenCode integration
- [x] Cohere model support
- [x] Gemini 3.1 Flash-Lite support
- [x] Multiple model selection
- [x] Discord user authorization
- [x] Runtime session management
- [x] Task abortion
- [x] Session reset
- [x] Agent status
- [x] Long Discord response handling
- [x] OpenCode live progress
- [x] Organized command architecture
- [ ] File change summaries
- [ ] `!diff` command
- [ ] Git integration
- [ ] Persistent sessions
- [ ] Better permission management
- [ ] Workspace isolation
- [ ] Docker sandbox
- [ ] Better error recovery
- [ ] Web dashboard

## License

ISC
