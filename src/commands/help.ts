import type { Message } from 'discord.js';
import { buildAgentContainer, componentsV2Payload } from '../utils/discord.js';

export async function handleHelpCommand(message: Message): Promise<void> {
  await message.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## OpenCode Agent',
        content: [
          'Available commands:',
          '',
          '`!code <prompt>` — Menjalankan request ke OpenCode.',
          '`!model` — Melihat model aktif.',
          '`!status` — Melihat status agent.',
          '`!session` — Melihat session aktif.',
          '`!reset` — Reset session.',
          '`!abort` — Membatalkan request aktif.',
          '`!help` — Menampilkan bantuan.',
        ].join('\n'),
        status: 'Ready',
      }),
    ]),
  );
}
