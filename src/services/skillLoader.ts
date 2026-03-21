import * as fs from 'fs';
import * as path from 'path';
import { Skill } from '../types';

export class SkillLoader {
  private skillsDir: string;
  private systemSkillsDir?: string;  // 系统技能目录（可选）
  private skills: Map<string, Skill> = new Map();

  constructor(skillsDir: string, systemSkillsDir?: string) {
    this.skillsDir = skillsDir;
    this.systemSkillsDir = systemSkillsDir;
  }

  // 加载所有 skills（包括系统技能）
  loadAll(): Skill[] {
    const loadedSkills: Skill[] = [];

    // 先加载系统技能（优先级低，可被用户技能覆盖）
    if (this.systemSkillsDir && fs.existsSync(this.systemSkillsDir)) {
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
      console.log(`Loaded ${loadedSkills.length} system skills`);
    }

    // 再加载用户技能（优先级高，会覆盖同名的系统技能）
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      return loadedSkills;
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
          console.log(`Overridden system skill: ${skill.name}`);
        }
      }
    }

    console.log(`Loaded ${userSkillCount} user skills`);
    return loadedSkills;
  }

  // 加载单个 skill
  load(filePath: string): Skill | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.parse(content, filePath);
    } catch (error) {
      console.error(`Failed to load skill: ${filePath}`, error);
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

    for (const line of lines) {
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

      // 解析 PROMPT 部分
      if (line.startsWith('PROMPT:')) {
        currentSection = 'prompt';
        continue;
      }

      // 解析描述（标题后的第一行非空内容，且不在任何section中）
      if (!skill.description && line.trim() && !line.startsWith('#') && !line.startsWith('TRIGGER') && !line.startsWith('PROMPT') && !currentSection) {
        skill.description = line.trim();
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
