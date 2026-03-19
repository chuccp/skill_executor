import * as fs from 'fs';
import * as path from 'path';
import { PresetConfig } from '../types';

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
        console.log(`Loaded ${this.presets.length} preset configs`);
      } else {
        console.log('Settings file not found, using empty presets');
        this.presets = [];
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
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

  // 获取用于前端显示的配置（隐藏敏感信息）
  getAllForDisplay(): Array<{ name: string; model: string; baseUrl: string }> {
    return this.presets.map(p => ({
      name: p.name,
      model: p.env.ANTHROPIC_MODEL || '',
      baseUrl: p.env.ANTHROPIC_BASE_URL || ''
    }));
  }
}

export default ConfigLoader;
