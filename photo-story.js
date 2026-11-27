(() => {
  'use strict';

  const fields = ['title', 'place', 'story'];
  const emptyDetails = { title: '', place: '', story: '' };
  const identityFor = item => item.storyKey || item.name || item.id;
  const detailsKey = identity => `university-memories:details:${identity}`;

  function readDetails(identity) {
    const stored = window.localStorage.getItem(detailsKey(identity));
    const details = { ...emptyDetails };
    if (stored === null) {
      details.story = window.localStorage.getItem(`university-memories:story:${identity}`) ?? '';
    } else {
      const parsed = JSON.parse(stored);
      for (const field of fields) {
        if (typeof parsed?.[field] === 'string') details[field] = parsed[field];
      }
    }
    return details;
  }

  function writeDetails(identity, details) {
    window.localStorage.setItem(detailsKey(identity), JSON.stringify(details));
  }

  const hasDetails = details => fields.some(field => details[field].trim());
  const sameDetails = (a, b) => fields.every(field => a[field] === b[field]);

  class PhotoStory {
    constructor(root) {
      this.root = root;
      this.heading = root.querySelector('#photo-story-heading');
      this.place = root.querySelector('#story-place');
      this.text = root.querySelector('#story-text');
      this.form = root.querySelector('#story-form');
      this.inputs = {
        title: root.querySelector('#story-title-input'),
        place: root.querySelector('#story-place-input'),
        story: root.querySelector('#story-input'),
      };
      this.status = root.querySelector('#story-status');
      this.edit = root.querySelector('#story-edit');
      this.drafts = new Map();
      this.warnBeforeLeaving = event => {
        event.preventDefault();
        event.returnValue = '';
      };

      this.edit.addEventListener('click', () => this.startEditing());
      root.querySelector('#story-cancel').addEventListener('click', () => this.cancel());
      this.form.addEventListener('input', () => this.updateDraft(this.readInputs()));
      this.form.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.render(false);
          this.edit.focus();
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this.form.requestSubmit();
        }
      });
      this.form.addEventListener('submit', event => {
        event.preventDefault();
        this.save();
      });
    }

    setPhoto(item) {
      this.key = item ? identityFor(item) : null;
      this.saved = { ...emptyDetails };
      if (this.key) {
        try {
          this.saved = readDetails(this.key);
        } catch {
          // Photos remain viewable when the browser restricts storage.
        }
      }
      const draft = this.drafts.get(this.key);
      this.fillInputs(draft ?? this.saved);
      this.render(Boolean(draft));
      this.root.scrollTop = 0;
    }

    readInputs() {
      return Object.fromEntries(fields.map(field => [field, this.inputs[field].value]));
    }

    fillInputs(details) {
      for (const field of fields) this.inputs[field].value = details[field];
    }

    render(editing, message = '') {
      this.form.hidden = !editing;
      this.edit.hidden = editing;
      this.text.hidden = editing;
      this.heading.textContent = this.saved.title || '照片故事';
      this.place.hidden = !this.saved.place;
      this.place.textContent = this.saved.place;
      this.text.textContent = this.saved.story || '这张照片还没有写下故事。';
      this.text.classList.toggle('is-empty', !this.saved.story);
      this.edit.textContent = this.drafts.has(this.key) ? '继续编辑'
        : hasDetails(this.saved) ? '编辑故事' : '写故事';
      this.status.textContent = message;
    }

    startEditing() {
      this.fillInputs(this.drafts.get(this.key) ?? this.saved);
      this.render(true);
      this.inputs.story.focus();
    }

    updateDraft(value) {
      if (sameDetails(value, this.saved)) this.drafts.delete(this.key);
      else this.drafts.set(this.key, value);
      this.updateLeaveWarning();
    }

    updateLeaveWarning() {
      if (this.drafts.size) window.addEventListener('beforeunload', this.warnBeforeLeaving);
      else window.removeEventListener('beforeunload', this.warnBeforeLeaving);
    }

    cancel() {
      this.updateDraft(this.saved);
      this.render(false);
      this.edit.focus();
    }

    save() {
      if (!this.key) return;
      const details = this.readInputs();
      for (const field of fields) details[field] = details[field].trim();
      try {
        writeDetails(this.key, details);
      } catch {
        this.status.textContent = '保存失败，请允许此网页使用浏览器存储后重试。';
        return;
      }
      this.saved = details;
      this.updateDraft(details);
      this.render(false, '已保存');
      this.edit.focus();
    }
  }

  window.PhotoStory = PhotoStory;
  window.PhotoStoryStore = { identityFor, readDetails, writeDetails, hasDetails, sameDetails };
})();
