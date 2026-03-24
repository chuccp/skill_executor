/**
 * TTS 工具处理器
 */

import * as path from 'path';
import * as fs from 'fs';
import { ToolContext } from '../toolExecutor/context';
import { getWorkingDir } from '../workingDir';

const { execSync } = require('child_process');

export async function handleTtsTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  switch (tool.name) {
    // 处理 tts 工具（别名，等同于 tts_convert）
    case 'tts':
    case 'tts_convert': {
      const text = tool.input?.text;
      const voice = tool.input?.voice || 'zh-CN-XiaoxiaoNeural';
      const rate = tool.input?.rate;
      const pitch = tool.input?.pitch;
      const outputFile = tool.input?.output_file;

      if (!text) {
        return '错误：文字不能为空';
      }

      try {
        // 确保输出目录存在
        const audioDir = path.join(getWorkingDir(), 'media', 'audio');
        if (!fs.existsSync(audioDir)) {
          fs.mkdirSync(audioDir, { recursive: true });
        }

        // 生成输出文件路径
        let outputPath = outputFile;
        if (!outputPath) {
          const timestamp = Date.now();
          outputPath = path.join(audioDir, `tts_${timestamp}.mp3`);
        } else {
          if (!path.isAbsolute(outputPath)) {
            outputPath = path.join(getWorkingDir(), outputPath);
          }
        }

        // 构建 edge-tts 命令
        let cmd = `edge-tts --text ${JSON.stringify(text)} --voice ${voice}`;

        if (rate !== undefined) {
          const rateStr = rate > 0 ? `+${rate}%` : `${rate}%`;
          cmd += ` --rate ${rateStr}`;
        }
        if (pitch !== undefined) {
          const pitchStr = pitch > 0 ? `+${pitch}%` : `${pitch}%`;
          cmd += ` --pitch ${pitchStr}`;
        }

        cmd += ` --write-media ${outputPath}`;

        execSync(cmd, {
          encoding: 'utf-8',
          cwd: process.cwd()
        });

        const mediaDir = path.join(getWorkingDir(), 'media');
        const relativePath = path.relative(mediaDir, outputPath).replace(/\\/g, '/');
        const mediaUrl = `/api/media/${relativePath}`;
        const fileName = path.basename(outputPath);

        return `![audio: ${fileName}](${mediaUrl})`;
      } catch (e: any) {
        try {
          let nodeCmd = 'tsx src/utils/tts-runner.ts --text ' + JSON.stringify(text);
          if (voice) nodeCmd += ' --voice ' + voice;
          if (rate !== undefined) nodeCmd += ' --rate ' + rate;
          if (pitch !== undefined) nodeCmd += ' --pitch ' + pitch;
          if (outputFile) nodeCmd += ' --output ' + outputFile;

          const result = execSync(nodeCmd, {
            encoding: 'utf-8',
            cwd: process.cwd()
          });

          const pathMatch = result.match(/OUTPUT_PATH=(.+)/);
          const outPath = pathMatch ? pathMatch[1].trim() : null;

          if (outPath) {
            const mediaDir = path.join(getWorkingDir(), 'media');
            const relativePath = path.relative(mediaDir, outPath).replace(/\\/g, '/');
            const mediaUrl = `/api/media/${relativePath}`;
            const fileName = path.basename(outPath);

            return `![audio: ${fileName}](${mediaUrl})`;
          }
          return '文字转语音失败：无法获取输出路径';
        } catch (e2: any) {
          return '文字转语音失败：' + e2.message + '\n请确保已安装 edge-tts: pip install edge-tts';
        }
      }
    }

    case 'tts_list_voices': {
      try {
        const result = execSync('edge-tts --list-voices', {
          encoding: 'utf-8',
          cwd: process.cwd()
        });
        return result;
      } catch (e: any) {
        try {
          const result = execSync('tsx src/utils/tts-runner.ts --list-voices', {
            encoding: 'utf-8',
            cwd: process.cwd()
          });
          return result;
        } catch (e2: any) {
          return '获取音色列表失败：' + e2.message + '\n请安装 edge-tts: pip install edge-tts';
        }
      }
    }

    case 'tts_get_recommended': {
      const recommended = {
        '中文女声': { name: 'zh-CN-XiaoxiaoNeural', desc: '温暖、亲切，适合日常对话' },
        '中文男声': { name: 'zh-CN-YunxiNeural', desc: '沉稳、专业，适合正式场合' },
        '中文新闻男声': { name: 'zh-CN-YunyangNeural', desc: '新闻播报风格' },
        '中文活泼女声': { name: 'zh-CN-XiaoyiNeural', desc: '活泼、年轻' },
        '英文女声': { name: 'en-US-JennyNeural', desc: '清晰、友好，美式发音' },
        '英文男声': { name: 'en-US-GuyNeural', desc: '自然、流畅，美式发音' }
      };

      const summary = Object.entries(recommended).map(([label, info]) =>
        `${label}: ${info.name}\n  ${info.desc}`
      ).join('\n\n');

      return '推荐音色:\n\n' + summary +
        '\n\n使用 tts 或 tts_convert 工具时，可通过 voice 参数指定这些音色';
    }

    default:
      return null;
  }
}