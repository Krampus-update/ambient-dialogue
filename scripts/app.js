class AmbientDialogueApp extends Application {
  constructor(...args) {
    super(...args);
    this._boundClickHandler = null;
    this._collapsedFolders = new Set();
    this._collapsedScenes = new Set();
    this._didInitialCollapse = false;
    this._recording = null;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "ambient-dialogue",
      title: "Ambient Dialogue Director",
      width: 800,
      height: 700,
      resizable: true,
      dragDrop: [{ dropSelector: ".npc-dropzone" }]
    });
  }

  getData() {
    return {
      scenes: game.ambientDialogue.getAll()
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._bindDomListeners();
  }

  async _render(...args) {
    await super._render(...args);
    this._bindDomListeners();
  }

  _getRootElement() {
    if (!this.element) return null;
    if (this.element instanceof HTMLElement) return this.element;
    if (this.element[0] instanceof HTMLElement) return this.element[0];
    return null;
  }

  _bindDomListeners() {
    const root = this._getRootElement();
    if (!root) return;

    if (this._boundClickHandler) root.removeEventListener("click", this._boundClickHandler);
    this._boundClickHandler = this._onRootClick.bind(this);
    root.addEventListener("click", this._boundClickHandler);
  }

  async _onRootClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const sceneId = actionEl.dataset.sceneId;
    const index = Number(actionEl.dataset.index);
    const folder = actionEl.dataset.folder;

    if (action === "create-scene") return this._createScene();
    if (action === "play-scene") return game.ambientDialogue.play(sceneId);
    if (action === "stop-scene") return game.ambientDialogue.stop();
    if (action === "add-message") return this._addMessage(sceneId);
    if (action === "toggle-loop") return this._toggleLoop(sceneId);
    if (action === "restore-origins") return this._restoreOrigins(sceneId);
    if (action === "edit-message") return this._editMessage(sceneId, index);
    if (action === "delete-message") return this._deleteMessage(sceneId, index);
    if (action === "rename-scene") return this._renameScene(sceneId);
    if (action === "move-folder") return this._moveSceneFolder(sceneId);
    if (action === "delete-scene") return this._deleteScene(sceneId);
    if (action === "stop-record-npc-path") return this._stopRecordingPath(true);
    if (action === "remove-npc") return this._removeNpc(sceneId, actionEl.dataset.npcUuid);
    if (action === "preview-message") return game.ambientDialogue.previewMessage(sceneId, index);
    if (action === "toggle-folder") return this._toggleFolder(folder);
    if (action === "toggle-scene") return this._toggleScene(sceneId);
  }

  async _createScene() {
    const name = await this._promptText({
      title: "Nova Cena de Diálogo",
      label: "Nome da cena",
      fieldName: "sceneName"
    });
    if (!name) return;

    try {
      const created = await game.ambientDialogue.createScene(name);
      if (!created) return;
      this._collapsedScenes.delete(created.id);
      ui.notifications?.info(`Cena criada: ${created.name}`);
      this.render(true);
    } catch (err) {
      console.error("Ambient Dialogue | erro ao criar cena", err);
      ui.notifications?.error(`Ambient Dialogue: falha ao criar cena (${err.message ?? err})`);
    }
  }

  async _addMessage(sceneId) {
    const scene = game.ambientDialogue.getAll().find((s) => s.id === sceneId);
    if (!scene) return;

    const speakers = Object.values(scene.npcs);
    if (!speakers.length) {
      ui.notifications?.warn("Adicione pelo menos um Token/Actor na cena.");
      return;
    }

    const payload = await this._promptMessageData(scene, "Adicionar Fala");
    if (!payload) return;
    const shouldRecord = payload._recordPath === true;
    delete payload._recordPath;
    await game.ambientDialogue.addMessage(sceneId, payload);
    if (shouldRecord) await this._startRecordingPath(sceneId, payload.speaker);
    this.render(true);
  }

  async _editMessage(sceneId, index) {
    const scene = game.ambientDialogue.getAll().find((s) => s.id === sceneId);
    const message = scene?.messages?.[index];
    if (!scene || !message) return;

    const payload = await this._promptMessageData(scene, "Editar Fala", message);
    if (!payload) return;
    const shouldRecord = payload._recordPath === true;
    delete payload._recordPath;
    await game.ambientDialogue.updateMessage(sceneId, index, payload);
    if (shouldRecord) await this._startRecordingPath(sceneId, payload.speaker);
    this.render(true);
  }

  async _toggleLoop(sceneId) {
    const scene = game.ambientDialogue.getAll().find((s) => s.id === sceneId);
    if (!scene) return;
    await game.ambientDialogue.updateScene(sceneId, { loop: !scene.loop });
    this.render(true);
  }

  async _restoreOrigins(sceneId) {
    await game.ambientDialogue.restoreSceneOrigins(sceneId);
  }

  async _deleteMessage(sceneId, index) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Apagar Fala" },
      content: "<p>Deseja realmente apagar esta fala?</p>"
    });
    if (!proceed) return;

    await game.ambientDialogue.deleteMessage(sceneId, index);
    this.render(true);
  }

  async _renameScene(sceneId) {
    const scene = game.ambientDialogue.getAll().find((s) => s.id === sceneId);
    if (!scene) return;

    const name = await this._promptText({
      title: "Renomear Cena",
      label: "Nome da cena",
      fieldName: "sceneName",
      initial: scene.name ?? ""
    });
    if (!name) return;

    await game.ambientDialogue.updateScene(sceneId, { name });
    this.render(true);
  }

  async _moveSceneFolder(sceneId) {
    const scene = game.ambientDialogue.getAll().find((s) => s.id === sceneId);
    if (!scene) return;

    const folder = await this._promptText({
      title: "Mover para Pasta",
      label: "Nome da pasta",
      fieldName: "folderName",
      initial: scene.folder || "Geral"
    });
    if (!folder) return;

    await game.ambientDialogue.updateScene(sceneId, { folder });
    this.render(true);
  }

  async _deleteScene(sceneId) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Apagar Cena" },
      content: "<p>Deseja apagar esta cena e todas as falas dela?</p>"
    });
    if (!proceed) return;

    await game.ambientDialogue.deleteScene(sceneId);
    this.render(true);
  }

  async _removeNpc(sceneId, npcUuid) {
    if (!sceneId || !npcUuid) return;
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Remover Personagem" },
      content: "<p>Deseja remover este personagem da cena?</p>"
    });
    if (!proceed) return;
    await game.ambientDialogue.removeNpc(sceneId, npcUuid);
    this.render(true);
  }

  async _startRecordingPath(sceneId, npcUuid) {
    if (!sceneId || !npcUuid) return;
    await this._stopRecordingPath(false);

    const token = await game.ambientDialogue._resolveSpeaker(npcUuid);
    if (!token?.document) {
      ui.notifications?.warn("Token desse personagem não está disponível na cena atual.");
      return;
    }

    const origin = { x: token.document.x, y: token.document.y };
    const waypoints = [{ x: origin.x, y: origin.y }];
    const tokenId = token.document.id;
    let lastX = origin.x;
    let lastY = origin.y;
    let lastDir = null;

    const directionFrom = (dx, dy) => {
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      return `${sx},${sy}`;
    };

    const onPoint = (x, y) => {
      const nx = Number(x ?? 0);
      const ny = Number(y ?? 0);
      const dx = nx - lastX;
      const dy = ny - lastY;
      if (Math.hypot(dx, dy) < 8) return;

      const dir = directionFrom(dx, dy);
      if (!lastDir) lastDir = dir;
      else if (dir !== lastDir) {
        // Direction changed: previous point becomes a "middle" waypoint.
        waypoints.push({ x: lastX, y: lastY });
        lastDir = dir;
      }

      lastX = nx;
      lastY = ny;
    };

    const hookId = Hooks.on("updateToken", (doc, changed) => {
      if (doc.id !== tokenId) return;
      if (!("x" in changed) && !("y" in changed)) return;
      onPoint(doc.x ?? changed.x, doc.y ?? changed.y);
    });

    this._recording = { sceneId, npcUuid, hookId, tokenId, waypoints, origin, lastX, lastY };
    ui.notifications?.info("Gravação iniciada. Mova o token e clique em Parar.");
    this.render(true);
  }

  async _stopRecordingPath(save = true) {
    if (!this._recording) return;
    Hooks.off("updateToken", this._recording.hookId);

    const live = canvas.scene?.tokens?.get(this._recording.tokenId);
    const endX = Number(live?.x ?? this._recording.lastX ?? this._recording.origin.x);
    const endY = Number(live?.y ?? this._recording.lastY ?? this._recording.origin.y);

    // Final point is always included.
    this._recording.waypoints.push({ x: endX, y: endY });
    const path = this._dedupePath(this._recording.waypoints);

    if (save && path.length > 1) {
      await game.ambientDialogue.saveNpcPath(
        this._recording.sceneId,
        this._recording.npcUuid,
        path,
        this._recording.origin
      );
      ui.notifications?.info(`Trajeto salvo (${path.length} pontos).`);
    } else if (save) {
      ui.notifications?.warn("Mova o token antes de parar para salvar um trajeto.");
    }

    this._recording = null;
    this.render(true);
  }

  _dedupePath(path) {
    const clean = [];
    for (const p of path ?? []) {
      const x = Math.round(Number(p?.x ?? 0));
      const y = Math.round(Number(p?.y ?? 0));
      const prev = clean[clean.length - 1];
      if (prev && prev.x === x && prev.y === y) continue;
      clean.push({ x, y });
    }
    return clean;
  }

  _toggleFolder(folder) {
    if (!folder) return;
    if (this._collapsedFolders.has(folder)) this._collapsedFolders.delete(folder);
    else this._collapsedFolders.add(folder);
    this.render(true);
  }

  _toggleScene(sceneId) {
    if (!sceneId) return;
    if (this._collapsedScenes.has(sceneId)) this._collapsedScenes.delete(sceneId);
    else this._collapsedScenes.add(sceneId);
    this.render(true);
  }

  async _promptText({ title, label, fieldName, initial = "", multiline = false }) {
    const field = multiline
      ? `<textarea name="${fieldName}" rows="4" autofocus>${this._esc(initial)}</textarea>`
      : `<input type="text" name="${fieldName}" value="${this._esc(initial)}" autofocus />`;

    return foundry.applications.api.DialogV2.prompt({
      window: { title },
      position: { width: 540 },
      content: `
        <div class="form-group">
          <label>${label}</label>
          <div class="form-fields">
            ${field}
          </div>
        </div>
      `,
      ok: {
        label: "Confirmar",
        callback: (_event, button) => String(button.form.elements[fieldName].value ?? "").trim()
      }
    }).catch(() => null);
  }

  async _promptSpeaker(scene, title, selected = null) {
    const speakers = Object.values(scene.npcs ?? {});
    if (!speakers.length) return null;

    const speakerOptions = speakers
      .map((s) => {
        const isSelected = selected && selected === s.uuid ? "selected" : "";
        return `<option value="${this._esc(s.uuid)}" ${isSelected}>${this._esc(s.name)}</option>`;
      })
      .join("");

    return foundry.applications.api.DialogV2.prompt({
      window: { title },
      position: { width: 540 },
      content: `
        <div class="form-group">
          <label>Speaker</label>
          <div class="form-fields">
            <select name="speaker">${speakerOptions}</select>
          </div>
        </div>
      `,
      ok: {
        label: "Selecionar",
        callback: (_event, button) => button.form.elements.speaker.value
      }
    }).catch(() => null);
  }

  async _promptMessageData(scene, title, initial = {}) {
    const speakers = Object.values(scene.npcs ?? {});
    if (!speakers.length) return null;

    const selectedSpeaker = initial.speaker ?? speakers[0].uuid;
    const speakerOptions = speakers
      .map((s) => {
        const isSelected = selectedSpeaker === s.uuid ? "selected" : "";
        return `<option value="${this._esc(s.uuid)}" ${isSelected}>${this._esc(s.name)}</option>`;
      })
      .join("");

    const useRecordedPath = initial?.move?.type === "recorded-path";
    const withPrevious = Boolean(initial?.withPrevious);

    return foundry.applications.api.DialogV2.prompt({
      window: { title },
      position: { width: 620 },
      content: `
        <div class="form-group">
          <label>Speaker</label>
          <div class="form-fields">
            <select name="speaker">${speakerOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label>Mensagem</label>
          <div class="form-fields">
            <textarea name="messageText" rows="4" autofocus>${this._esc(initial.text ?? "")}</textarea>
          </div>
        </div>
        <div class="form-group">
          <label>Gravação</label>
          <div class="form-fields">
            <label>
              <input type="checkbox" name="withPrevious" ${withPrevious ? "checked" : ""}>
              Tocar junto com a frase anterior
            </label>
            <label>
              <input type="checkbox" name="useRecordedPath" ${useRecordedPath ? "checked" : ""}>
              Usar trajeto gravado nesta fala
            </label>
            <label>
              <input type="checkbox" name="recordPath">
              Gravar trajeto agora (mova o token após salvar)
            </label>
          </div>
        </div>
      `,
      ok: {
        label: "Salvar",
        callback: (_event, button) => {
          const form = button.form.elements;
          const text = String(form.messageText.value ?? "").trim();
          if (!text) return null;
          return {
            speaker: form.speaker.value,
            text,
            move: {
              type: form.useRecordedPath?.checked ? "recorded-path" : "none",
              distance: 0.5
            },
            withPrevious: Boolean(form.withPrevious?.checked),
            _recordPath: Boolean(form.recordPath?.checked)
          };
        }
      }
    }).catch(() => null);
  }

  _getMoveLabel(move) {
    const type = move?.type ?? "none";
    if (type === "none") return "";
    const labels = {
      "recorded-path": "trajeto gravado",
      "random-small": "mov. aleatório",
      left: "mov. esquerda",
      right: "mov. direita",
      up: "mov. cima",
      down: "mov. baixo"
    };
    const d = Number(move?.distance ?? 0.5).toFixed(1);
    return `${labels[type] ?? "movimento"} (${d}g)`;
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    const sceneNode = event.target?.closest?.("[data-scene-id]");
    const sceneId = sceneNode?.dataset?.sceneId;
    if (!sceneId) return;

    const scenes = game.ambientDialogue.getAll();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    const uuid = data.uuid || data.actorUuid || data.tokenUuid;
    if (!uuid) return ui.notifications?.warn("Drop inválido: UUID não encontrado.");

    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc) return ui.notifications?.warn("Documento não encontrado para esse drop.");

    const npcUuid = doc.documentName === "Actor" ? doc.uuid : (doc.actor?.uuid ?? doc.uuid);
    const npcName = doc.name ?? doc.actor?.name ?? "NPC";

    scene.npcs[npcUuid] = { uuid: npcUuid, name: npcName };
    await game.ambientDialogue.saveAll(scenes);
    this.render(true);
  }

  _esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;");
  }

  async close(options) {
    await this._stopRecordingPath(false);
    return super.close(options);
  }

  async _renderInner() {
    const scenes = game.ambientDialogue.getAll();
    const folders = new Map();
    for (const scene of scenes) {
      const folder = String(scene.folder || "Geral").trim() || "Geral";
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(scene);
    }

    if (!this._didInitialCollapse) {
      for (const scene of scenes) this._collapsedScenes.add(scene.id);
      this._didInitialCollapse = true;
    }

    return $(`
<div class="ambient-dialogue-app">
  <div class="ad-toolbar">
    <button data-action="create-scene">+ Nova Cena</button>
    ${this._recording
      ? `<span class="ad-recording-status">Gravando: ${this._esc(this._recording.npcUuid)}</span>
         <button data-action="stop-record-npc-path">Parar gravação</button>`
      : ""}
  </div>

  ${Array.from(folders.entries()).map(([folderName, folderScenes]) => `
    <section class="ad-folder">
      <div class="ad-folder-header">
        <button data-action="toggle-folder" data-folder="${this._esc(folderName)}">${this._collapsedFolders.has(folderName) ? "+" : "-"}</button>
        <h3>${this._esc(folderName)}</h3>
        <span>${folderScenes.length} cena(s)</span>
      </div>
      <div class="ad-folder-body ${this._collapsedFolders.has(folderName) ? "is-collapsed" : ""}">
        ${folderScenes.map((s) => `
          <article class="ad-scene">
            <div class="ad-scene-header">
              <button data-action="toggle-scene" data-scene-id="${this._esc(s.id)}">${this._collapsedScenes.has(s.id) ? "+" : "-"}</button>
              <h4>${this._esc(s.name)}</h4>
              <button data-action="play-scene" data-scene-id="${this._esc(s.id)}">Play</button>
              <button data-action="stop-scene" data-scene-id="${this._esc(s.id)}">Stop</button>
              <button data-action="toggle-loop" data-scene-id="${this._esc(s.id)}">Loop: ${s.loop ? "ON" : "OFF"}</button>
              <button data-action="restore-origins" data-scene-id="${this._esc(s.id)}">Ir para início</button>
              <button data-action="add-message" data-scene-id="${this._esc(s.id)}">+ Fala</button>
              <button data-action="rename-scene" data-scene-id="${this._esc(s.id)}">Renomear</button>
              <button data-action="move-folder" data-scene-id="${this._esc(s.id)}">Pasta</button>
              <button data-action="delete-scene" data-scene-id="${this._esc(s.id)}">Apagar</button>
            </div>
            <div class="ad-scene-npcs">
              <span>Personagens:</span>
              ${Object.values(s.npcs ?? {}).map((npc) => `
                <span class="ad-npc-chip">
                  ${this._esc(npc.name || "NPC")}
                  <button data-action="remove-npc" data-scene-id="${this._esc(s.id)}" data-npc-uuid="${this._esc(npc.uuid)}">X</button>
                </span>
              `).join("") || "<span class='ad-empty'>Nenhum NPC vinculado.</span>"}
            </div>
            <div class="ad-scene-body ${this._collapsedScenes.has(s.id) ? "is-collapsed" : ""}">
              <div class="npc-dropzone ad-dropzone" data-scene-id="${this._esc(s.id)}">
                Arraste Token ou Actor aqui
              </div>
              <div class="ad-messages">
                ${s.messages.map((m, idx) => `
                  <div class="ad-message-row">
                    <div class="ad-message-main">
                      <b>${this._esc(s.npcs[m.speaker]?.name || "NPC")}</b>: ${this._esc(m.text)}
                      ${this._getMoveLabel(m.move) ? `<span class="ad-move-tag">${this._esc(this._getMoveLabel(m.move))}</span>` : ""}
                      ${m.withPrevious ? `<span class="ad-move-tag">junto com anterior</span>` : ""}
                    </div>
                    <div class="ad-message-actions">
                      <button data-action="preview-message" data-scene-id="${this._esc(s.id)}" data-index="${idx}">Preview</button>
                      <button data-action="edit-message" data-scene-id="${this._esc(s.id)}" data-index="${idx}">Editar</button>
                      <button data-action="delete-message" data-scene-id="${this._esc(s.id)}" data-index="${idx}">Apagar</button>
                    </div>
                  </div>
                `).join("") || "<div class='ad-empty'>Sem falas ainda.</div>"}
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("") || `
    <div class="ad-empty">
      Nenhuma cena criada ainda.
    </div>
  `}
  
  <div class="ad-help">
    Dica: você pode tocar cenas pelo Monk usando
    <code>game.modules.get("ambient-dialogue").api.trigger("Nome da Cena")</code>
  </div>
</div>
`);
  }
}
