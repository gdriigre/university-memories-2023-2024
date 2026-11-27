(() => {
  'use strict';

  const { identityFor } = window.PhotoStoryStore;
  const storageKey = 'university-memories:deleted-photos';

  function readDeletedPhotos() {
    const content = window.localStorage.getItem(storageKey);
    if (content === null) return new Set();
    const deleted = JSON.parse(content);
    if (!Array.isArray(deleted) || deleted.some(identity => typeof identity !== 'string')) {
      throw new Error('无法读取最近删除记录');
    }
    return new Set(deleted);
  }

  class PhotoTrash {
    constructor(photos, onChange) {
      this.photos = photos;
      this.onChange = onChange;
      this.deleted = new Set();
      try {
        this.deleted = readDeletedPhotos();
      } catch {
        // Browsing remains available if the browser blocks local storage.
      }
      this.confirmation = document.querySelector('#confirm-photo-delete');
      this.trash = document.querySelector('#photo-trash');
      this.preview = document.querySelector('#photo-delete-thumb');
      this.deleteStatus = document.querySelector('#photo-delete-status');
      this.trashStatus = document.querySelector('#photo-trash-status');
      this.list = document.querySelector('#photo-trash-list');
      this.empty = document.querySelector('#photo-trash-empty');
      this.message = document.querySelector('#photo-album-message');
      this.closeTrashButton = document.querySelector('#close-photo-trash');

      document.querySelector('#cancel-photo-delete').addEventListener('click', () => this.confirmation.close());
      document.querySelector('#move-to-photo-trash').addEventListener('click', () => this.deleteCurrent());
      this.confirmation.addEventListener('close', () => {
        this.currentPhoto = null;
        this.preview.removeAttribute('src');
      });
      document.querySelector('#open-photo-trash').addEventListener('click', () => this.openTrash());
      this.closeTrashButton.addEventListener('click', () => this.trash.close());
      this.list.addEventListener('click', event => {
        const button = event.target.closest('button[data-photo]');
        if (button) this.restore(button.dataset.photo, button.closest('li'));
      });
    }

    get isOpen() {
      return this.confirmation.open || this.trash.open;
    }

    isDeleted(photo) {
      return this.deleted.has(identityFor(photo));
    }

    confirmDelete(photo) {
      this.currentPhoto = photo;
      this.preview.src = photo.thumb;
      this.preview.alt = `${photo.date} 的照片`;
      this.deleteStatus.textContent = '';
      this.confirmation.showModal();
    }

    setDeleted(identity, deleted) {
      const next = readDeletedPhotos();
      if (deleted) next.add(identity);
      else next.delete(identity);
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      this.deleted = next;
    }

    deleteCurrent() {
      if (!this.currentPhoto) return;
      try {
        this.setDeleted(identityFor(this.currentPhoto), true);
      } catch {
        this.deleteStatus.textContent = '删除未完成，无法保存更改。';
        return;
      }
      this.confirmation.close();
      this.onChange();
      this.announce('已移到「照片列表 → 最近删除」。');
      document.querySelector('#mode-toggle')?.focus({ preventScroll: true });
    }

    openTrash() {
      this.trashStatus.textContent = '';
      try {
        const latest = readDeletedPhotos();
        if (latest.size !== this.deleted.size || [...latest].some(identity => !this.deleted.has(identity))) {
          this.deleted = latest;
          this.onChange();
        }
      } catch {
        this.trashStatus.textContent = '无法读取当前浏览器的最近删除记录。';
      }
      this.renderTrash();
      this.trash.showModal();
    }

    renderTrash() {
      const photos = new Map(this.photos.map(photo => [identityFor(photo), photo]));
      const rows = document.createDocumentFragment();
      for (const identity of [...this.deleted].reverse()) {
        const photo = photos.get(identity);
        if (!photo) continue;
        const row = document.createElement('li');
        const image = document.createElement('img');
        image.src = photo.thumb;
        image.alt = '';
        image.loading = 'lazy';
        const name = document.createElement('span');
        name.className = 'photo-trash-name';
        name.textContent = photo.name || photo.date;
        const date = document.createElement('time');
        date.dateTime = photo.date;
        date.textContent = photo.date;
        const label = document.createElement('div');
        label.append(name, date);
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.dataset.photo = identity;
        restore.textContent = '恢复';
        restore.setAttribute('aria-label', `恢复 ${name.textContent}`);
        row.append(image, label, restore);
        rows.append(row);
      }
      this.empty.hidden = rows.childElementCount > 0;
      this.list.replaceChildren(rows);
    }

    restore(identity, row) {
      const index = [...this.list.children].indexOf(row);
      try {
        this.setDeleted(identity, false);
      } catch {
        this.trashStatus.textContent = '恢复未完成，无法保存更改。';
        return;
      }
      this.onChange();
      this.renderTrash();
      this.trashStatus.textContent = '已恢复到相册。';
      const next = this.list.children[Math.min(index, this.list.children.length - 1)];
      (next?.querySelector('button') ?? this.closeTrashButton).focus({ preventScroll: true });
    }

    announce(text) {
      clearTimeout(this.messageTimer);
      this.message.textContent = text;
      this.messageTimer = setTimeout(() => { this.message.textContent = ''; }, 4500);
    }
  }

  window.PhotoTrash = PhotoTrash;
})();
