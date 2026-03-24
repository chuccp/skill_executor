import * as fs from 'fs';
import * as path from 'path';
import { PresetConfig } from '../types';
import { createModuleLogger } from './tools/logger';

const logger = createModuleLogger('config');

export class ConfigLoader {
  private settingsPath: string;
  private presets: PresetConfig[] = [];

  constructor(settingsPath: string) {
    this.settingsPath = settingsPath;
    this.load();
  }

  load(): PresetConfig[] {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const content = fs.readFileSync(this.settingsPath, 'utf-8');
        this.presets = JSON.parse(content);
        logger.info(`Loaded ${this.presets.length} preset configs`);
      } else {
        logger.info('Settings file not found, using empty presets');
        this.presets = [];
      }
    } catch (error) {
      logger.error('Failed to load settings:', error);
      this.presets = [];
    }
    return this.presets;
  }

  getAll(): PresetConfig[] {
    return this.presets;
  }

  get(name: string): PresetConfig | undefined {
    return this.presets.find(p => p.name === name);
  }

  // 获取用于前端显示的配置（包含 API key）
  getAllForDisplay(): Array<{ name: string; model: string; baseUrl: string; apiKey: string; maxTokens?: number }> {
    return this.presets.map(p => ({
      name: p.name,
      model: p.env.ANTHROPIC_MODEL || '',
      baseUrl: p.env.ANTHROPIC_BASE_URL || '',
      apiKey: p.env.ANTHROPIC_AUTH_TOKEN || '',
      maxTokens: p.env.ANTHROPIC_MAX_TOKENS ? parseInt(p.env.ANTHROPIC_MAX_TOKENS, 10) : undefined
    }));
  }

  // 添加或更新预设配置
  save(name: string, config: { apiKey: string; baseUrl?: string; model: string; template?: string; maxTokens?: number }): boolean {
    const existingIndex = this.presets.findIndex(p => p.name === name);
    const preset: PresetConfig = {
      name,
      template: config.template || '',
      env: {
        ANTHROPIC_AUTH_TOKEN: config.apiKey,
        ANTHROPIC_BASE_URL: config.baseUrl,
        ANTHROPIC_MODEL: config.model,
        ANTHROPIC_MAX_TOKENS: config.maxTokens?.toString()
      }
    };

    if (existingIndex >= 0) {
      this.presets[existingIndex] = preset;
    } else {
      this.presets.push(preset);
    }

    return this.saveToFile();
  }

  // 保存到文件
  private saveToFile(): boolean {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.presets, null, 2), 'utf-8');
      logger.info('Settings saved to', this.settingsPath);
      return true;
    } catch (error) {
      logger.error('Failed to save settings:', error);
      return false;
    }
  }

  // 更新预设配置
  update(oldName: string, config: { name: string; apiKey: string; baseUrl?: string; model: string; template?: string; maxTokens?: number }): boolean {
    const existingIndex = this.presets.findIndex(p => p.name === oldName);
    if (existingIndex < 0) {
      return false;
    }

    // 如果名称改变了，需要检查新名称是否已存在
    if (oldName !== config.name && this.presets.some(p => p.name === config.name)) {
      return false;
    }

    const preset: PresetConfig = {
      name: config.name,
      template: config.template || '',
      env: {
        ANTHROPIC_AUTH_TOKEN: config.apiKey,
        ANTHROPIC_BASE_URL: config.baseUrl,
        ANTHROPIC_MODEL: config.model,
        ANTHROPIC_MAX_TOKENS: config.maxTokens?.toString()
      }
    };

    this.presets[existingIndex] = preset;
    return this.saveToFile();
  }

  // 删除预设配置
  delete(name: string): boolean {
    const existingIndex = this.presets.findIndex(p => p.name === name);
    if (existingIndex < 0) {
      return false;
    }

    this.presets.splice(existingIndex, 1);
    return this.saveToFile();
  }
}

export default ConfigLoader;
