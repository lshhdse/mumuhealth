// Animate navigation only; background refreshes and typing stay still.
const running = new WeakMap();
export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function animate(node, frames, options) {
  running.get(node)?.cancel();
  if (!node?.animate || reduceMotion()) return Promise.resolve();
  const animation = node.animate(frames, options);
  running.set(node, animation);
  return animation.finished.catch(() => {}).then(() => {
    if (running.get(node) === animation) running.delete(node);
  });
}
export function transitionPage(node, direction = 1) {
  return animate(node, [
    { opacity: .35, transform: `translateX(${direction * 20}px)` },
    { opacity: 1, transform: 'translateX(0)' }
  ], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
}
export function overlayMotion(root) {
  let revision = 0, view = '', closing = null, opener = null, openerAction = '';
  const shell = document.querySelector('.app-shell');
  const focusPanel = panel => panel.focus({ preventScroll: true });
  function present(markup, key) {
    const existed = Boolean(root.firstElementChild), same = existed && view === key && !closing;
    const scrollTop = same ? root.querySelector('.sheet-body')?.scrollTop || 0 : 0;
    if (!existed) {
      opener = document.activeElement;
      openerAction = opener?.dataset.action || '';
    }
    revision++; closing = null; view = key;
    [root.firstElementChild, root.querySelector('[role="dialog"]')].forEach(node => {
      if (node) running.get(node)?.cancel();
    });
    root.innerHTML = markup;
    const backdrop = root.firstElementChild, panel = backdrop.querySelector('[role="dialog"]');
    panel.tabIndex = -1;
    if (same && root.querySelector('.sheet-body')) root.querySelector('.sheet-body').scrollTop = scrollTop;
    document.body.classList.add('modal-open');
    // Focus before hiding the background from assistive technology.
    focusPanel(panel);
    // The backdrop blocks clicks; the keyboard handler keeps focus in the dialog.
    shell.setAttribute('aria-hidden', 'true');
    if (same) return;
    if (!existed) animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    const dialog = panel.classList.contains('dialog');
    animate(panel, dialog ? [
      { opacity: 0, transform: 'translateY(12px) scale(.94)' },
      { opacity: 1, transform: 'translateY(0) scale(1.012)', offset: .75 },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ] : [
      { opacity: .6, transform: 'translateY(56px) scale(.98)' },
      { opacity: 1, transform: 'translateY(-3px) scale(1)', offset: .8 },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], { duration: dialog ? 320 : 380, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  function dismiss() {
    if (closing) return closing;
    const current = revision, backdrop = root.firstElementChild;
    if (!backdrop) return Promise.resolve(true);
    const panel = backdrop.querySelector('[role="dialog"]');
    backdrop.classList.add('closing');
    closing = Promise.all([
      animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' }),
      animate(panel, [{ transform: 'translateY(0) scale(1)' }, {
        transform: panel.classList.contains('dialog') ? 'translateY(8px) scale(.96)' : 'translateY(40px) scale(.985)'
      }], { duration: 180, easing: 'cubic-bezier(.4,0,1,1)' })
    ]).then(() => {
      // A newly opened window must survive an older window's closing animation.
      if (current !== revision) return false;
      root.innerHTML = ''; view = ''; closing = null;
      document.body.classList.remove('modal-open');
      shell.removeAttribute('aria-hidden');
      const target = opener?.isConnected ? opener : [...shell.querySelectorAll('[data-action]')].find(node => node.dataset.action === openerAction);
      target?.focus({ preventScroll: true });
      return true;
    });
    return closing;
  }
  document.addEventListener('keydown', event => {
    if (!root.firstElementChild) return;
    if (event.key === 'Escape') { event.preventDefault(); window.handleBack?.(); return; }
    if (event.key !== 'Tab') return;
    const panel = root.querySelector('[role="dialog"]');
    const nodes = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = nodes[0], last = nodes[nodes.length - 1], active = document.activeElement;
    if (!first || closing) { event.preventDefault(); return; }
    if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || active === panel || !panel.contains(active))) { event.preventDefault(); first.focus(); }
  });
  return { present, dismiss, isClosing: () => Boolean(closing) };
}
