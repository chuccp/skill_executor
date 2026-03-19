/**
 * 上下文栏
 */

window.updateContextBar = function() {
  const modelEl = window.$('context-model');
  const skillEl = window.$('context-skill');
  const workdirEl = window.$('context-workdir');

  if (modelEl) {
    const value = window.$('preset-select')?.value || '未选择';
    modelEl.textContent = value || '未选择';
  }

  if (skillEl) {
    const value = window.$('skill-select')?.value || '无';
    skillEl.textContent = value || '无';
  }

  if (workdirEl) {
    const value = window.state?.workdir?.path || '-';
    workdirEl.textContent = value;
    workdirEl.title = value;
  }
};

window.bindContextActions = function() {
  const copyBtn = window.$('context-copy-workdir');
  if (!copyBtn) return;

  copyBtn.onclick = async function() {
    const value = window.state?.workdir?.path || '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      window.showInfo('✅ 已复制工作目录');
    } catch (e) {
      window.showError('复制失败');
    }
  };
};
