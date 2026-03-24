import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../types';
import { createModuleLogger } from './tools/logger';
import { SkillParser } from './skill/skillParser';

const logger = createModuleLogger('skill');

export class SkillLoader {
  private skillsDir: string;
  private systemSkillsDir?: string;  // 系统技能目录（可选，默认不加载）
  private loadSystemSkills: boolean;  // 是否加载系统技能
  private skills: Map<string, Skill> = new Map();
  private watchers: fs.FSWatcher[] = [];
  private parser: SkillParser;

  constructor(skillsDir: string, systemSkillsDir?: string, loadSystemSkills: boolean = false) {
    this.skillsDir = skillsDir;
    this.systemSkillsDir = systemSkillsDir;
    this.loadSystemSkills = loadSystemSkills;
    this.parser = new SkillParser();
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
      const { skill, warnings } = this.parser.parse(content, filePath);

      // 打印警告
      for (const warning of warnings) {
        logger.warn(`[Skill] ${filePath}: ${warning}`);
      }

      if (skill.name) {
        const isUpdate = this.skills.has(skill.name);
        this.skills.set(skill.name, skill);
        logger.info(`[Skill] ${isUpdate ? '更新' : '加载'}: ${skill.name}`);
        return skill;
      }
      return null;
    } catch (error) {
      logger.error(`Failed to load skill: ${filePath}`, error);
      return null;
    }
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
