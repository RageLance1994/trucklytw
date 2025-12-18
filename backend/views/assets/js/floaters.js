
(function() {
  let activeFloater = null;
  let offsetX = 0;
  let offsetY = 0;
  let iframeShield = null;




  document.querySelectorAll('.floater .header').forEach(header => {
    const floater = header.closest('.floater');

    var closeButton = floater.querySelector('a[data-close="floater"]')
        closeButton.addEventListener('click',(ev) => {
          console.log("NIGGA NIGGA NIGGA")
          floater.classList.add('hidden');
        })

    header.addEventListener('mousedown', e => {
      activeFloater = floater; 
      const rect = floater.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      enableIframeShield();
      document.addEventListener('mousemove', onMouseMove, { passive: true });
      document.addEventListener('mouseup', onMouseUp);
    });
  });

  function enableIframeShield() {
    if (iframeShield) return;
    iframeShield = document.createElement('div');
    iframeShield.style.position = 'fixed';
    iframeShield.style.top = '0';
    iframeShield.style.left = '0';
    iframeShield.style.width = '100vw';
    iframeShield.style.height = '100vh';
    iframeShield.style.cursor = 'move';
    iframeShield.style.zIndex = '99999';
    iframeShield.style.background = 'transparent';
    iframeShield.style.pointerEvents = 'auto';
    iframeShield.setAttribute('data-role', 'floater-drag-shield');
    document.body.appendChild(iframeShield);
  }

  function disableIframeShield() {
    if (!iframeShield) return;
    iframeShield.remove();
    iframeShield = null;
  }

  function onMouseMove(e) {
    if (!activeFloater) return;

    const rect = activeFloater.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // calcoliamo limiti
    const minX = -w / 2;
    const maxX = window.innerWidth - w / 2;
    const minY = -h / 2;
    const maxY = window.innerHeight - h / 2;

    // nuova posizione calcolata
    let newLeft = e.clientX - offsetX;
    let newTop  = e.clientY - offsetY;

    // clamp ai limiti
    newLeft = Math.max(minX, Math.min(newLeft, maxX));
    newTop  = Math.max(minY, Math.min(newTop, maxY));

    activeFloater.style.left = newLeft + 'px';
    activeFloater.style.top  = newTop + 'px';
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    disableIframeShield();
    activeFloater = null;
  }
})();
