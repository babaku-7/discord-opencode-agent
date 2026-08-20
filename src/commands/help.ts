import type { Message } from 'discord.js';

export async function handleHelpCommand(message: Message): Promise<void> {
  await message.reply([
    '**🤖 Discord OpenCode Agent**', '',
    '**Coding**',
    '`!code <task>` — kirim task ke agent',
    '`!abort` — hentikan task aktif', '',
    '**Session**',
    '`!status` — lihat status agent',
    '`!reset` — reset session', '',
    '**Model**',
    '`!model` — lihat model aktif',
    '`!model cohere` — gunakan Cohere',
    '`!model gemini` — gunakan Gemini 3.1 Flash-Lite', '',
    '`!help` — tampilkan bantuan',
  ].join('\n'));
}
