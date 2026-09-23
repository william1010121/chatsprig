(function () {
  'use strict';

  const list = document.getElementById('skill-list');
  const form = document.getElementById('skill-form');
  const nameInput = document.getElementById('skill-name');
  const contentInput = document.getElementById('skill-content');
  const saveButton = document.getElementById('skill-save');
  const cancelButton = document.getElementById('skill-cancel');
  const status = document.getElementById('skill-status');
  let skills = [];
  let editing = null;

  function message(text) { status.textContent = text; }
  function resetForm() {
    editing = null;
    form.reset();
    saveButton.textContent = 'Add skill';
    cancelButton.hidden = true;
  }
  function render() {
    list.replaceChildren();
    if (!skills.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No custom skills yet.';
      list.appendChild(empty);
    }
    for (const skill of skills) {
      const row = document.createElement('div');
      row.className = 'skill-item';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `//${skill.name}`;
      const preview = document.createElement('p');
      preview.textContent = skill.content.length > 120 ? skill.content.slice(0, 120) + '…' : skill.content;
      details.append(title, preview);
      const actions = document.createElement('div');
      actions.className = 'skill-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        editing = skill.name;
        nameInput.value = skill.name;
        contentInput.value = skill.content;
        saveButton.textContent = 'Save skill';
        cancelButton.hidden = false;
        nameInput.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${skill.name}`);
      remove.addEventListener('click', async () => {
        try {
          const next = skills.filter(item => item.name !== skill.name);
          await chrome.storage.local.set({ skills: next });
          skills = next;
          if (editing === skill.name) resetForm();
          render();
          message('Skill deleted.');
        } catch { message('Could not delete skill.'); }
      });
      actions.append(edit, remove);
      row.append(details, actions);
      list.appendChild(row);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const content = contentInput.value.trim();
    if (!name || !content) { message('Enter a name and text.'); return; }
    if (name.toLowerCase() === 'system-prompt') { message('system-prompt is reserved for the built-in skill.'); return; }
    if (/[\r\n/]/.test(name)) { message('Skill names cannot contain slashes or line breaks.'); return; }
    if (skills.some(item => item.name.toLowerCase() === name.toLowerCase() && item.name !== editing)) {
      message('A skill with that name already exists.'); return;
    }
    const next = editing
      ? skills.map(item => item.name === editing ? { name, content } : item)
      : [...skills, { name, content }];
    saveButton.disabled = true;
    try {
      await chrome.storage.local.set({ skills: next });
      skills = next;
      resetForm();
      render();
      message('Skill saved.');
    } catch { message('Could not save skill.'); }
    finally { saveButton.disabled = false; }
  });
  cancelButton.addEventListener('click', resetForm);
  chrome.storage.local.get({ skills: [] }).then(result => {
    skills = Array.isArray(result.skills) ? result.skills : [];
    render();
  }).catch(() => message('Could not load skills.'));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.skills) return;
    skills = Array.isArray(changes.skills.newValue) ? changes.skills.newValue : [];
    render();
  });
})();
