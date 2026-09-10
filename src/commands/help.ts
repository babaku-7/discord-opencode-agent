import type { Message } from 'discord.js';
import { buildAgentContainer, componentsV2Payload } from '../utils/discord.js';

export async function handleHelpCommand(message: Message, prefix = '!'): Promise<void> {
  await message.reply(
    componentsV2Payload([
      buildAgentContainer({
        title: '## OpenCode Agent',
        content: [
          'Available commands:',
          '',
          `\`${prefix}code <prompt>\` — Menjalankan request ke OpenCode.`,
          `\`${prefix}model\` — Melihat model aktif.`,
          `\`${prefix}status\` — Melihat status agent.`,
          `\`${prefix}session\` — Melihat session aktif.`,
          `\`${prefix}reset\` — Reset session.`,
          `\`${prefix}abort\` — Membatalkan request aktif.`,
          `\`${prefix}help\` — Menampilkan bantuan.`,
          `\`${prefix}prefix <prefix>\` — Mengubah prefix command.`,
          '',
          `Active prefix: ${prefix}`,
          'Fallback prefix: !',
        ].join('\n'),
        status: 'Ready',
      }),
    ]),
  );
}
