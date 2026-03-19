/**
 * 模态框拖拽模块
 */

window.setupModalDrag = function() {
  document.querySelectorAll('.modal-header').forEach(function(header) {
    const modal = header.closest('.modal');
    if (!modal) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.onmousedown = function(e) {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      offsetX = e.clientX - modal.offsetLeft;
      offsetY = e.clientY - modal.offsetTop;
      e.preventDefault();
    };

    document.onmousemove = function(e) {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      modal.style.left = Math.max(0, x) + 'px';
      modal.style.top = Math.max(0, y) + 'px';
      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
    };

    document.onmouseup = function() {
      isDragging = false;
    };
  });
};