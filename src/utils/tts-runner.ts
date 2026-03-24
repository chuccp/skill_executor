/**
 * TTS 命令行工具 - 用于从 bash 工具调用
 * 使用 edge-tts-node 包实现文字转语音
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'edge-tts-node';
import * as fs from 'fs';
import * as path from 'path';
import { createModuleLogger } from '../services/tools/logger';

const logger = createModuleLogger('tts');

interface TTSOptions {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  output?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, any> = {};

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--text' && args[i + 1]) {
      options.text = args[++i];
    } else if (args[i] === '--voice' && args[i + 1]) {
      options.voice = args[++i];
    } else if (args[i] === '--rate' && args[i + 1]) {
      options.rate = parseFloat(args[++i]);
    } else if (args[i] === '--pitch' && args[i + 1]) {
      options.pitch = parseFloat(args[++i]);
    } else if (args[i] === '--volume' && args[i + 1]) {
      options.volume = parseFloat(args[++i]);
    } else if (args[i] === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (args[i] === '--list-voices') {
      await listVoices();
      return;
    } else if (args[i] === '--help') {
      printHelp();
      return;
    }
  }

  if (!options.text) {
    logger.error('错误：缺少 --text 参数');
    printHelp();
    process.exit(1);
  }

  await convertToSpeech(options as TTSOptions);
}

async function listVoices() {
  try {
    const tts = new MsEdgeTTS({});
    const voices = await tts.getVoices();
    
    logger.info('可用音色列表:\n');
    logger.info('='.repeat(80));
    
    // 按语言分组显示
    const byLocale: Record<string, any[]> = {};
    for (const voice of voices) {
      const locale = voice.Locale.split('-').slice(0, 2).join('-');
      if (!byLocale[locale]) byLocale[locale] = [];
      byLocale[locale].push(voice);
    }

    for (const [locale, localeVoices] of Object.entries(byLocale)) {
      logger.info(`\n${locale} (${localeVoices.length} 个音色):`);
      logger.info('-'.repeat(60));
      for (const voice of localeVoices) {
        const gender = voice.Gender === 'Female' ? '♀' : '♂';
        logger.info(`  ${voice.ShortName}`);
        logger.info(`    ${gender} ${voice.FriendlyName}`);
      }
    }

    logger.info('\n推荐音色:');
    logger.info('  中文女声：zh-CN-XiaoxiaoNeural');
    logger.info('  中文男声：zh-CN-YunxiNeural');
    logger.info('  英文女声：en-US-JennyNeural');
    logger.info('  英文男声：en-US-GuyNeural');
  } catch (error: any) {
    logger.error('获取音色列表失败:', error.message);
    process.exit(1);
  }
}

async function convertToSpeech(options: TTSOptions) {
  try {
    const tts = new MsEdgeTTS({});
    
    // 设置音色
    const voice = options.voice || 'zh-CN-XiaoxiaoNeural';
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, undefined);

    // 生成输出文件名
    let outputPath = options.output;
    if (!outputPath) {
      const timestamp = Date.now();
      const mediaDir = path.join(process.cwd(), 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      outputPath = path.join(mediaDir, `tts_${timestamp}.mp3`);
    }

    logger.info(`开始转换 "${options.text.substring(0, 50)}${options.text.length > 50 ? '...' : ''}"`);
    logger.info(`音色：${voice}`);
    logger.info(`输出：${outputPath}`);

    // 写入文件
    await tts.toFile(options.text, outputPath);

    logger.info(`\n转换完成：${outputPath}`);
    logger.info(`文件大小：${formatBytes(fs.statSync(outputPath).size)}`);
    
    // 输出路径供调用者使用
    logger.info(`OUTPUT_PATH=${outputPath}`);
  } catch (error: any) {
    logger.error('转换失败:', error.message || error);
    logger.error('详细错误:', error);
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function printHelp() {
  logger.info(`
Edge TTS - 文字转语音工具

用法：tsx src/utils/tts-runner.ts [选项]

选项:
  --text <文本>       要转换的文字（必需）
  --voice <音色>     音色名称（默认：zh-CN-XiaoxiaoNeural）
  --rate <速率>      语速调整，范围 -100 到 100（默认：0）
  --pitch <音调>     音调调整，范围 -100 到 100（默认：0）
  --volume <音量>    音量调整，范围 0 到 100（默认：100）
  --output <路径>    输出文件路径（默认：media/tts_<时间戳>.mp3）
  --list-voices      列出所有可用音色
  --help             显示帮助信息

示例:
  # 列出所有音色
  tsx src/utils/tts-runner.ts --list-voices

  # 使用默认音色转换文字
  tsx src/utils/tts-runner.ts --text "你好，欢迎使用"

  # 使用指定音色
  tsx src/utils/tts-runner.ts --text "Hello World" --voice en-US-JennyNeural

  # 调整语速和音调
  tsx src/utils/tts-runner.ts --text "测试" --rate 10 --pitch -5

推荐音色:
  zh-CN-XiaoxiaoNeural  - 中文女声（温暖、亲切）
  zh-CN-YunxiNeural     - 中文男声（沉稳、专业）
  en-US-JennyNeural     - 英文女声（清晰、友好）
  en-US-GuyNeural       - 英文男声（自然、流畅）
`);
}

main().catch(err => {
  logger.error('发生错误:', err.message);
  process.exit(1);
});
