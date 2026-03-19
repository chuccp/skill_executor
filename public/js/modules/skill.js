/**
 * 技能管理模块
 */

window.renderSkillManagerList = function() {
  const listEl = window.$('skill-list');
  if (!listEl) return;
  if (!window.state.skills.length) {
    listEl.innerHTML = '<div class="skill-empty">暂无技能</div>';
    window.$('skill-detail').textContent = '选择一个技能查看详情';
    return;
  }

  listEl.innerHTML = window.state.skills.map(function(s) {
    return '<button class="skill-item" data-name="' + encodeURIComponent(s.name) + '">' +
      '<div class="skill-name">' + window.escapeHtml(s.name) + '</div>' +
      '<div class="skill-desc">' + window.escapeHtml(s.description || '') + '</div>' +
      '</button>';
  }).join('');

  listEl.querySelectorAll('.skill-item').forEach(function(btn) {
    btn.onclick = function() {
      window.showSkillDetail(decodeURIComponent(btn.dataset.name));
    };
  });
};

window.showSkillDetail = function(name) {
  const skill = window.state.skills.find(function(s) { return s.name === name; });
  const detailEl = window.$('skill-detail');
  if (!detailEl || !skill) return;

  const when = (skill.trigger && skill.trigger.when) ? skill.trigger.when : [];
  const notWhen = (skill.trigger && skill.trigger.notWhen) ? skill.trigger.notWhen : [];

  detailEl.innerHTML = [
    '<div class="skill-title">' + window.escapeHtml(skill.name) + '</div>',
    '<div class="skill-meta">文件: ' + window.escapeHtml(skill.path || '') + '</div>',
    skill.description ? '<div class="skill-meta">' + window.escapeHtml(skill.description) + '</div>' : '',
    '<div class="skill-section-title">触发条件</div>',
    '<div class="skill-meta">当包含: ' + window.escapeHtml(when.join(', ') || '无') + '</div>',
    '<div class="skill-meta">排除: ' + window.escapeHtml(notWhen.join(', ') || '无') + '</div>',
    '<div class="skill-section-title">PROMPT</div>',
    '<pre class="skill-prompt">' + window.escapeHtml(skill.prompt || '') + '</pre>'
  ].join('');

  const listEl = window.$('skill-list');
  if (listEl) {
    listEl.querySelectorAll('.skill-item').forEach(function(item) {
      item.classList.toggle('active', item.dataset.name === name);
    });
  }
};