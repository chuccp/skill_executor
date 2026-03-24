/**
 * 技能文件解析器
 * 支持多种格式的技能文件解析
 */

import * as path from 'path';
import { Skill } from '../../types';

/**
 * 解析结果
 */
export interface ParseResult {
  skill: Skill;
  warnings: string[];
}

/**
 * 技能文件解析器
 */
export class SkillParser {
  /**
   * 解析技能文件内容
   */
  parse(content: string, filePath: string): ParseResult {
    const warnings: string[] = [];

    // 检测格式类型
    const format = this.detectFormat(content);

    let skill: Skill;

    switch (format) {
      case 'new':
        skill = this.parseNewFormat(content, filePath);
        break;
      case 'legacy':
        skill = this.parseLegacyFormat(content, filePath);
        break;
      default:
        skill = this.parseLegacyFormat(content, filePath);
        warnings.push('Unknown format, using legacy parser');
    }

    // 验证必填字段
    if (!skill.name) {
      skill.name = path.basename(filePath, '.md');
      warnings.push(`No name found, using filename: ${skill.name}`);
    }

    return { skill, warnings };
  }

  /**
   * 检测文件格式
   */
  private detectFormat(content: string): 'new' | 'legacy' {
    // 新格式特征：包含 "## 基本信息" 或 "**名称**:"
    if (content.includes('## 基本信息') || content.includes('**名称**:')) {
      return 'new';
    }
    return 'legacy';
  }

  /**
   * 解析新格式（带元数据块）
   *
   * 格式示例：
   * ```markdown
   * # 技能名称
   *
   * ## 基本信息
   * - **名称**: skill_name
   * - **描述**: 技能描述
   * - **触发词**: 关键词1, 关键词2
   *
   * ## 提示词
   *
   * 具体的提示词内容...
   * ```
   */
  private parseNewFormat(content: string, filePath: string): Skill {
    const lines = content.split('\n');
    const skill: Skill = {
      name: '',
      description: '',
      prompt: '',
      path: filePath
    };

    const triggerWhen: string[] = [];
    const triggerNotWhen: string[] = [];
    let currentSection = '';

    for (const line of lines) {
      // 解析一级标题作为默认名称
      if (line.startsWith('# ') && !skill.name) {
        skill.name = line.slice(2).trim();
        continue;
      }

      // 检测 section 切换
      if (line.startsWith('## 基本信息')) {
        currentSection = 'basic';
        continue;
      }
      if (line.startsWith('## 提示词')) {
        currentSection = 'prompt';
        continue;
      }
      if (line.startsWith('## ') && currentSection === 'prompt') {
        // 遇到新的二级标题，结束 prompt
        currentSection = '';
        continue;
      }

      // 解析基本信息部分
      if (currentSection === 'basic') {
        // 名称
        const nameMatch = line.match(/^[-*]\s*\*\*名称\*\*:\s*(.+)$/);
        if (nameMatch) {
          skill.name = nameMatch[1].trim();
          continue;
        }

        // 描述
        const descMatch = line.match(/^[-*]\s*\*\*描述\*\*:\s*(.+)$/);
        if (descMatch) {
          skill.description = descMatch[1].trim();
          continue;
        }

        // 触发词
        const triggerMatch = line.match(/^[-*]\s*\*\*触发词\*\*:\s*(.+)$/);
        if (triggerMatch) {
          const keywords = triggerMatch[1].split(/[,，]/).map(k => k.trim()).filter(k => k);
          triggerWhen.push(...keywords);
          continue;
        }
      }

      // 收集 prompt 内容
      if (currentSection === 'prompt') {
        // 跳过开头的空行
        if (skill.prompt === '' && line.trim() === '') {
          continue;
        }
        // 追加到 prompt
        if (skill.prompt) {
          skill.prompt += '\n' + line;
        } else {
          skill.prompt = line;
        }
      }
    }

    // 设置触发条件
    if (triggerWhen.length > 0 || triggerNotWhen.length > 0) {
      skill.trigger = {
        when: triggerWhen,
        notWhen: triggerNotWhen
      };
    }

    // 清理 prompt
    skill.prompt = skill.prompt.trim();

    return skill;
  }

  /**
   * 解析传统格式
   *
   * 格式示例：
   * ```markdown
   * # 技能名称
   * 技能描述（第一行非空文本）
   *
   * TRIGGER
   * - 关键词1
   * - 关键词2
   *
   * PROMPT:
   * 具体的提示词内容...
   * ```
   */
  private parseLegacyFormat(content: string, filePath: string): Skill {
    const lines = content.split('\n');
    const skill: Skill = {
      name: '',
      description: '',
      prompt: '',
      path: filePath
    };

    const triggerWhen: string[] = [];
    const triggerNotWhen: string[] = [];
    let currentSection = '';
    const promptLines: string[] = [];

    for (const line of lines) {
      // 解析一级标题作为名称
      if (line.startsWith('# ') && !skill.name) {
        skill.name = line.slice(2).trim();
        continue;
      }

      // 检测 TRIGGER section
      if (line.startsWith('TRIGGER')) {
        currentSection = 'trigger';
        continue;
      }

      // 检测 PROMPT section
      if (line.startsWith('PROMPT:')) {
        currentSection = 'prompt';
        continue;
      }

      // 解析描述（第一个非空行，不在任何 section 中）
      if (!skill.description && line.trim() && !line.startsWith('#') && !currentSection) {
        skill.description = line.trim();
        continue;
      }

      // 解析触发条件
      if (currentSection === 'trigger') {
        if (line.startsWith('when:')) {
          triggerWhen.push(line.slice(5).trim());
        } else if (line.startsWith('- not when:')) {
          triggerNotWhen.push(line.slice(11).trim());
        } else if (line.startsWith('- ')) {
          triggerWhen.push(line.slice(2).trim());
        }
        continue;
      }

      // 收集 prompt
      if (currentSection === 'prompt') {
        promptLines.push(line);
      }
    }

    // 组装 skill
    skill.prompt = promptLines.join('\n').trim();

    if (triggerWhen.length > 0 || triggerNotWhen.length > 0) {
      skill.trigger = {
        when: triggerWhen,
        notWhen: triggerNotWhen
      };
    }

    return skill;
  }
}

export default SkillParser;