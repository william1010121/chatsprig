// Replays the native palette's independent filtering and selection updates.
// The same list survives; React replaces its rows after the input capture handler.
window.qa.nativeCommands = [];
window.qa.nativeEnter = 0;
window.qa.hideUnmatched = false;
window.qa.captureEscape = false;
let nativePalette;
const editor = document.querySelector('#prompt-textarea');
const value = () => editor.textContent;
function renderNativePalette() {
  const text = value();
  if (!/^\/[a-z]*$/.test(text)) { nativePalette?.remove(); nativePalette = null; return; }
  if (window.qa.hideUnmatched && /^\/bt/.test(text)) { nativePalette?.remove(); nativePalette = null; return; }
  if (!nativePalette) {
    nativePalette = document.createElement('div');
    nativePalette.setAttribute('data-composer-overlay-floating-ui', 'true');
    nativePalette.style.cssText = 'position:fixed;bottom:180px;left:20%;width:60%;padding:8px;background:Canvas;color:CanvasText;border:1px solid #888;border-radius:16px';
    nativePalette.innerHTML = '<div data-mention-list-scroll-area></div>';
    document.body.appendChild(nativePalette);
  }
  const list = nativePalette.firstElementChild;
  for (const row of [...list.children]) if (row.id !== 'chatsprig-btw-command') row.remove();
  for (const button of list.querySelectorAll('[data-list-navigation-item]')) button.setAttribute('aria-current', 'false');
  const names = text === '/' ? ['Feedback', 'Model'] : text === '/b' ? ['Feedback'] : [];
  if (names.length) {
    const section = document.createElement('div'); section.setAttribute('data-mention-section-id', 'commands');
    for (const name of names) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = name;
      button.className = 'native-command'; button.setAttribute('data-list-navigation-item', 'true');
      button.setAttribute('aria-current', String(name === names[0]));
      button.addEventListener('click', () => window.qa.nativeCommands.push(name));
      section.appendChild(button);
    }
    list.prepend(section);
  } else {
    const empty = document.createElement('div'); empty.dataset.qaEmpty = 'true'; empty.textContent = 'No commands';
    list.appendChild(empty);
  }
}
const style = document.createElement('style');
style.textContent = '[data-list-navigation-item]{display:block;width:100%;text-align:left;padding:10px;border:0;color:inherit;background:transparent;border-radius:8px}[data-list-navigation-item][aria-current=true]{background:#7775}';
document.head.appendChild(style);
editor.addEventListener('input', renderNativePalette);
editor.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.defaultPrevented) window.qa.nativeEnter++;
  if (event.key === 'Escape') {
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    nativePalette?.remove(); nativePalette = null;
  }
});
window.qaRenderNativePalette = renderNativePalette;
window.qaCloseNativePalette = () => {nativePalette?.remove();nativePalette=null;};
