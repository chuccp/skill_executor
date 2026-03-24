import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../types';
import { createModuleLogger } from './tools/logger';

const logger = createModuleLogger('skill');

export class SkillLoader {
  private skillsDir: string;
  private systemSkillsDir?: string;  // 系统技能目录（可选，默认不加载）
  private loadSystemSkills: boolean;  // 是否加载系统技能
  private skills: Map<string, Skill> = new Map();
  private watchers: fs.FSWatcher[] = [];

  constructor(skillsDir: string, systemSkillsDir?: string, loadSystemSkills: boolean = false) {
    this.skillsDir = skillsDir;
    this.systemSkillsDir = systemSkillsDir;
    this.loadSystemSkills = loadSystemSkills;
  }

  // 启动文件监听，实现实时加载
  startWatch(): void {
    // 监听用户技能目录
    if (fs.existsSync(this.skillsDir)) {
      const userWatcher = fs.watch(this.skillsDir, (eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
          const filePath = path.join(this.skillsDir, filename);
          logger.info(`[Skill] 检测到文件变化: ${filename} (${eventType})`);

          if (eventType === 'rename') {
            // 文件被删除或新建
            if (!fs.existsSync(filePath)) {
              // 文件被删除，移除对应的 skill
              for (const [name, skill] of this.skills) {
                if (skill.path === filePath) {
                  this.skills.delete(name);
                  logger.info(`[Skill] 已移除: ${name}`);
                  break;
                }
              }
            } else {
              // 新建文件，加载
              this.load(filePath);
            }
          } else if (eventType === 'change') {
            // 文件被修改，重新加载
            this.load(filePath);
          }
        }
      });
      this.watchers.push(userWatcher);
      logger.info(`[Skill] 开始监听用户技能目录: ${this.skillsDir}`);
    }

    // 监听系统技能目录
    if (this.loadSystemSkills && this.systemSkillsDir && fs.existsSync(this.systemSkillsDir)) {
      const systemSkillsDir = this.systemSkillsDir;
      const systemWatcher = fs.watch(systemSkillsDir, (eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
          const filePath = path.join(systemSkillsDir, filename);
          logger.info(`[Skill] 检测到系统技能变化: ${filename} (${eventType})`);

          if (eventType === 'change' || (eventType === 'rename' && fs.existsSync(filePath))) {
            this.load(filePath);
          }
        }
      });
      this.watchers.push(systemWatcher);
      logger.info(`[Skill] 开始监听系统技能目录: ${systemSkillsDir}`);
    }
  }

  // 停止文件监听
  stopWatch(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    logger.info('[Skill] 已停止文件监听');
  }

  // 重新加载所有技能
  reload(): Skill[] {
    this.skills.clear();
    return this.loadAll();
  }

  // 加载所有 skills（默认只加载用户技能）
  loadAll(): Skill[] {
    const loadedSkills: Skill[] = [];

    // 只有在明确启用时才加载系统技能
    if (this.loadSystemSkills && this.systemSkillsDir && fs.existsSync(this.systemSkillsDir)) {
      const systemFiles = fs.readdirSync(this.systemSkillsDir).filter(f => f.endsWith('.md'));
      for (const file of systemFiles) {
        const skill = this.load(path.join(this.systemSkillsDir, file));
        if (skill) {
          // 系统技能作为默认值，如果已存在则不覆盖
          if (!this.skills.has(skill.name)) {
            this.skills.set(skill.name, skill);
            loadedSkills.push(skill);
          }
        }
      }
      logger.info(`Loaded ${loadedSkills.length} system skills`);
    }

    // 加载用户技能（优先级高）
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }

    const files = fs.readdirSync(this.skillsDir).filter(f => f.endsWith('.md'));
    let userSkillCount = 0;

    for (const file of files) {
      const skill = this.load(path.join(this.skillsDir, file));
      if (skill) {
        const isUpdate = this.skills.has(skill.name);
        this.skills.set(skill.name, skill);
        loadedSkills.push(skill);
        userSkillCount++;
        if (isUpdate) {
          logger.info(`Overridden system skill: ${skill.name}`);
        }
      }
    }

    logger.info(`Loaded ${userSkillCount} user skills`);
    return loadedSkills;
  }

  // 加载单个 skill
  load(filePath: string): Skill | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const skill = this.parse(content, filePath);
      if (skill && skill.name) {
        const isUpdate = this.skills.has(skill.name);
        this.skills.set(skill.name, skill);
        logger.info(`[Skill] ${isUpdate ? '更新' : '加载'}: ${skill.name}`);
        return skill;
      }
      return skill;
    } catch (error) {
      logger.error(`Failed to load skill: ${filePath}`, error);
      return null;
    }
  }

  // 解析 skill 文件
  parse(content: string, filePath: string): Skill {
    const lines = content.split('\n');
    const skill: Skill = {
      name: '',
      description: '',
      prompt: '',
      path: filePath
    };

    let currentSection = '';
    let promptLines: string[] = [];
    let triggerWhen: string[] = [];
    let triggerNotWhen: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 解析标题作为名称（只取第一个标题）
      if (line.startsWith('# ') && !skill.name) {
        skill.name = line.slice(2).trim();
        continue;
      }

      // 解析 TRIGGER 部分
      if (line.startsWith('TRIGGER')) {
        currentSection = 'trigger';
        continue;
      }

      // 解析 PROMPT 部分（传统格式）
      if (line.startsWith('PROMPT:')) {
        currentSection = 'prompt';
        continue;
      }

      // 解析 ## 提示词 部分（新格式）
      if (line.startsWith('## 提示词')) {
        currentSection = 'prompt';
        continue;
      }

      // 解析描述（标题后的第一行非空内容，且不在任何section中）
      if (!skill.description && line.trim() && !line.startsWith('#') && !line.startsWith('TRIGGER') && !line.startsWith('PROMPT') && !currentSection) {
        skill.description = line.trim();
        continue;
      }

      // 解析新格式中的元数据（**名称**: xxx, **描述**: xxx, **触发词**: xxx）
      if (line.includes('**名称**:')) {
        const match = line.match(/\*\*名称\*\*:\s*(.+)/);
        if (match) {
          skill.name = match[1].trim();
        }
        continue;
      }

      if (line.includes('**描述**:')) {
        const match = line.match(/\*\*描述\*\*:\s*(.+)/);
        if (match) {
          skill.description = match[1].trim();
        }
        continue;
      }

      if (line.includes('**触发词**:')) {
        const match = line.match(/\*\*触发词\*\*:\s*(.+)/);
        if (match) {
          const keywords = match[1].split(',').map(k => k.trim()).filter(k => k);
          triggerWhen.push(...keywords);
        }
        continue;
      }

      // 解析 trigger 条件
      if (currentSection === 'trigger') {
        if (line.startsWith('when:')) {
          triggerWhen.push(line.slice(5).trim());
        } else if (line.startsWith('- not when:')) {
          triggerNotWhen.push(line.slice(11).trim());
        } else if (line.startsWith('- ')) {
          triggerWhen.push(line.slice(2).trim());
        }
      }

      // 解析 prompt
      if (currentSection === 'prompt') {
        // 遇到新的 ## 标题，结束 prompt 部分
        if (line.startsWith('## ') && currentSection === 'prompt') {
          currentSection = '';
          continue;
        }
        promptLines.push(line);
      }
    }

    skill.prompt = promptLines.join('\n').trim();

    if (triggerWhen.length > 0 || triggerNotWhen.length > 0) {
      skill.trigger = {
        when: triggerWhen,
        notWhen: triggerNotWhen
      };
    }

    // 如果没有解析到名称，使用文件名
    if (!skill.name) {
      skill.name = path.basename(filePath, '.md');
    }

    return skill;
  }

  // 获取所有 skills
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  // 获取单个 skill
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  // 检查是否应该触发 skill
  shouldTrigger(skill: Skill, context: { code?: string; userMessage?: string }): boolean {
    if (!skill.trigger) return false;

    const { when, notWhen } = skill.trigger;

    // 检查 notWhen 条件
    if (notWhen && notWhen.length > 0) {
      for (const condition of notWhen) {
        if (this.matchesCondition(condition, context)) {
          return false;
        }
      }
    }

    // 检查 when 条件
    if (when && when.length > 0) {
      for (const condition of when) {
        if (this.matchesCondition(condition, context)) {
          return true;
        }
      }
    }

    return false;
  }

  private matchesCondition(condition: string, context: { code?: string; userMessage?: string }): boolean {
    const lowerCondition = condition.toLowerCase();
    const code = context.code?.toLowerCase() || '';
    const message = context.userMessage?.toLowerCase() || '';

    // 检查关键词匹配
    if (code.includes(lowerCondition) || message.includes(lowerCondition)) {
      return true;
    }

    // 支持简单的正则匹配
    try {
      const regex = new RegExp(condition, 'i');
      if (regex.test(code) || regex.test(message)) {
        return true;
      }
    } catch {}

    return false;
  }

  // 根据上下文获取触发的 skills
  getTriggeredSkills(context: { code?: string; userMessage?: string }): Skill[] {
    return this.getAll().filter(skill => this.shouldTrigger(skill, context));
  }
}

export default SkillLoader;
