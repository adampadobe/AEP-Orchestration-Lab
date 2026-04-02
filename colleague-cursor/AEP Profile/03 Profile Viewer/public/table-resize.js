/**
 * Makes .profile-attribute-table--resizable columns resizable by dragging the right edge of each header.
 */
(function () {
  function init() {
    document.querySelectorAll('.profile-attribute-table--resizable').forEach(function (table) {
      var cols = table.querySelectorAll('colgroup col');
      var headers = table.querySelectorAll('thead th');
      if (cols.length !== headers.length) return;

      headers.forEach(function (th, i) {
        var handle = th.querySelector('.resize-handle');
        if (!handle) return;

        var col = cols[i];
        var minWidth = 60;
        var startX = 0;
        var startWidth = 0;

        function getWidth(el) {
          var w = el.style.width;
          if (w) return parseInt(w, 10);
          return th.offsetWidth;
        }

        function setWidth(w) {
          var px = Math.max(minWidth, w) + 'px';
          col.style.width = px;
          th.style.width = px;
        }

        function onMouseDown(e) {
          if (e.button !== 0) return;
          e.preventDefault();
          startX = e.pageX;
          startWidth = getWidth(col);
          table.classList.add('resizing');
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
          setWidth(startWidth + (e.pageX - startX));
        }

        function onMouseUp() {
          table.classList.remove('resizing');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }

        handle.addEventListener('mousedown', onMouseDown);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
