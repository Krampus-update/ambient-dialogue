class AmbientDialogueManager {

  constructor() {
    this.running = false;
    this.currentSceneId = null;
    this.cycleResetDelayMs = 2200;
    this.cycleEndDelayMs = 1400;
  }

  getAll() {
    const value = game.settings.get("ambient-dialogue", "scenes");
    const cloned = foundry.utils.deepClone(value ?? []);
    return Array.isArray(cloned) ? cloned : [];
  }

  async saveAll(data) {
    if (!game.user.isGM) throw new Error("Apenas o GM pode salvar cenas.");
    const payload = Array.isArray(data) ? data : [];
    await game.settings.set("ambient-dialogue", "scenes", payload);
  }

  async createScene(name) {
    const sceneName = String(name ?? "").trim();
    if (!sceneName) return null;

    const scenes = this.getAll();
    scenes.push({
      id: foundry.utils.randomID(),
      name: sceneName,
      folder: "Geral",
      loop: false,
      npcs: {},
      messages: []
    });
    await this.saveAll(scenes);
    return scenes[scenes.length - 1];
  }

  async updateScene(sceneId, update) {
    const scenes = this.getAll();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return null;

    Object.assign(scene, update ?? {});
    await this.saveAll(scenes);
    return scene;
  }

  async deleteScene(sceneId) {
    const scenes = this.getAll();
    const next = scenes.filter((s) => s.id !== sceneId);
    if (next.length === scenes.length) return false;
    await this.saveAll(next);
    return true;
  }

  async addMessage(sceneId, message) {
    const scenes = this.getAll();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return null;

    scene.messages.push({
      speaker: message.speaker,
      text: message.text,
      move: this._normalizeMove(message.move),
      withPrevious: Boolean(message.withPrevious)
    });
    await this.saveAll(scenes);
    return scene.messages.length - 1;
  }

  async updateMessage(sceneId, index, update) {
    const scenes = this.getAll();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.messages[index]) return false;

    const next = update ?? {};
    if ("move" in next) next.move = this._normalizeMove(next.move);
    if ("withPrevious" in next) next.withPrevious = Boolean(next.withPrevious);
    Object.assign(scene.messages[index], next);
    await this.saveAll(scenes);
    return true;
  }

  async deleteMessage(sceneId, index) {
    const scenes = this.getAll();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.messages[index]) return false;

    scene.messages.splice(index, 1);
    await this.saveAll(scenes);
    return true;
  }

  async play(sceneId) {
    if (!canvas?.ready) {
      ui.notifications?.warn("Ambient Dialogue: canvas não está pronto.");
      return;
    }

    const scene = this.getAll().find(s => s.id === sceneId);
    if (!scene) {
      ui.notifications?.warn(`Ambient Dialogue: cena não encontrada (${sceneId}).`);
      return;
    }

    this.running = true;
    this.currentSceneId = sceneId;
    const initialPositions = await this._captureInitialPositions(scene);
    let firstCycle = true;

    // Put tokens at their recorded origins before the scene starts.
    await this._restoreInitialPositions(initialPositions);

    do {
      if (!firstCycle) {
        await this._restoreInitialPositions(initialPositions);
        await this._wait(this.cycleResetDelayMs);
      }
      firstCycle = false;

      const groups = this._groupMessages(scene.messages);
      for (const group of groups) {
        if (!this.running) return;
        const tasks = group.map((msg) => this._playMessage(scene, msg));
        await Promise.allSettled(tasks);
      }

      // Give tokens time to settle at final positions before starting the next loop cycle.
      await this._wait(this.cycleEndDelayMs);
    } while (scene.loop && this.running);

    this.running = false;
    this.currentSceneId = null;
  }

  async _playMessage(scene, msg) {
    const lineDuration = this._getLineDuration(msg.text);
    const useRecordedPath = msg?.move?.type === "recorded-path" && this._hasRecordedPath(scene, msg.speaker);
    const movementPromise = useRecordedPath
      ? this._playRecordedPath(msg.speaker, scene, lineDuration)
      : this._applyMovement(msg.speaker, msg.move);

    await this._showBubble(msg.speaker, msg.text);
    this._emitBubble(msg.speaker, msg.text);
    await Promise.allSettled([
      movementPromise,
      new Promise(r => setTimeout(r, lineDuration))
    ]);
  }

  _groupMessages(messages) {
    const groups = [];
    for (const msg of messages ?? []) {
      if (msg?.withPrevious && groups.length) {
        groups[groups.length - 1].push(msg);
      } else {
        groups.push([msg]);
      }
    }
    return groups;
  }

  stop() {
    this.running = false;
    this.currentSceneId = null;
  }

  _getLineDuration(text) {
    return Math.clamp(1600 + String(text ?? "").length * 45, 1800, 12000);
  }

  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  async onSocketMessage(data) {
    if (!data || data.type !== "bubble") return;
    if (data.senderId === game.user.id) return;
    await this._showBubble(data.speaker, data.text);
  }

  _emitBubble(speaker, text) {
    game.socket.emit("module.ambient-dialogue", {
      type: "bubble",
      senderId: game.user.id,
      speaker,
      text
    });
  }

  async _showBubble(speakerUuid, text) {
    const token = await this._resolveSpeaker(speakerUuid);
    if (!token || !text) return null;

    const html = await canvas.hud.bubbles.say(token, String(text), {
      pan: false,
      cssClasses: ["ambient-dialogue-bubble"]
    });
    this._fixBubbleHeight(html);
    return html;
  }

  _fixBubbleHeight(html) {
    if (!html) return;
    const content = html.querySelector(".bubble-content");
    if (!content) return;

    // If line wrap increases content height, expand the bubble to avoid clipping last words.
    const targetHeight = content.scrollHeight + 16;
    const currentHeight = html.clientHeight || 0;
    if (targetHeight > currentHeight) {
      html.style.height = `${targetHeight}px`;
    }
  }

  _hasRecordedPath(scene, speakerUuid) {
    const path = scene?.npcs?.[speakerUuid]?.movementPath;
    return Array.isArray(path) && path.length > 1;
  }

  async _captureInitialPositions(scene) {
    const map = {};
    for (const [speakerUuid, npc] of Object.entries(scene?.npcs ?? {})) {
      const token = await this._resolveSpeaker(speakerUuid);
      if (!token?.document) continue;
      const origin = npc?.movementOrigin;
      map[speakerUuid] = {
        tokenId: token.document.id,
        x: Number.isFinite(origin?.x) ? origin.x : token.document.x,
        y: Number.isFinite(origin?.y) ? origin.y : token.document.y
      };
    }
    return map;
  }

  async _restoreInitialPositions(initialPositions) {
    if (!game.user.isGM) return;
    for (const state of Object.values(initialPositions ?? {})) {
      const tokenDoc = canvas.scene?.tokens?.get(state.tokenId);
      if (!tokenDoc) continue;
      await tokenDoc.update({
        x: Math.round(state.x),
        y: Math.round(state.y)
      }).catch(() => null);
    }
  }

  async _playRecordedPath(speakerUuid, scene, durationMs) {
    if (!game.user.isGM) return;
    const path = scene?.npcs?.[speakerUuid]?.movementPath;
    if (!Array.isArray(path) || path.length < 2) return;

    const token = await this._resolveSpeaker(speakerUuid);
    if (!token?.document) return;

    const origin = scene?.npcs?.[speakerUuid]?.movementOrigin;
    if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
      await token.document.update({
        x: Math.round(origin.x),
        y: Math.round(origin.y)
      }).catch(() => null);
    }

    const stepDelay = Math.max(140, Math.floor(durationMs / Math.max(path.length, 2)));
    for (const point of path) {
      if (!this.running) return;
      await token.document.update({
        x: Math.round(point.x),
        y: Math.round(point.y)
      }).catch(() => null);
      await new Promise((r) => setTimeout(r, stepDelay));
    }
  }

  _normalizeMove(move) {
    const m = move ?? {};
    return {
      type: String(m.type ?? "none"),
      distance: Number(m.distance ?? 0.5)
    };
  }

  async _applyMovement(speakerUuid, move) {
    if (!game.user.isGM) return;
    const cfg = this._normalizeMove(move);
    if (cfg.type === "none") return;

    const token = await this._resolveSpeaker(speakerUuid);
    if (!token?.document) return;

    const step = Math.max(0.1, cfg.distance) * (canvas.grid?.size ?? 100);
    let dx = 0;
    let dy = 0;

    switch (cfg.type) {
      case "left": dx = -step; break;
      case "right": dx = step; break;
      case "up": dy = -step; break;
      case "down": dy = step; break;
      case "random-small": {
        const dirs = [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [1, -1], [-1, 1], [-1, -1]
        ];
        const [mx, my] = dirs[Math.floor(Math.random() * dirs.length)];
        dx = mx * step;
        dy = my * step;
        break;
      }
      default:
        return;
    }

    const sceneW = canvas.scene?.dimensions?.width ?? Number.MAX_SAFE_INTEGER;
    const sceneH = canvas.scene?.dimensions?.height ?? Number.MAX_SAFE_INTEGER;
    const newX = Math.clamp(token.document.x + dx, 0, Math.max(0, sceneW - token.w));
    const newY = Math.clamp(token.document.y + dy, 0, Math.max(0, sceneH - token.h));

    await token.document.update({ x: Math.round(newX), y: Math.round(newY) }).catch(() => null);
  }

  async removeNpc(sceneId, npcUuid) {
    const scenes = this.getAll();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.npcs?.[npcUuid]) return false;
    delete scene.npcs[npcUuid];
    await this.saveAll(scenes);
    return true;
  }

  async saveNpcPath(sceneId, npcUuid, path, origin = null) {
    const scenes = this.getAll();
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.npcs?.[npcUuid]) return false;
    scene.npcs[npcUuid].movementPath = Array.isArray(path) ? path : [];
    scene.npcs[npcUuid].movementOrigin = origin ? {
      x: Number(origin.x ?? 0),
      y: Number(origin.y ?? 0)
    } : null;
    await this.saveAll(scenes);
    return true;
  }

  async playNpcPathPreview(sceneId, npcUuid) {
    if (!game.user.isGM) return false;
    const scene = this.getAll().find((s) => s.id === sceneId);
    if (!scene) return false;
    const path = scene.npcs?.[npcUuid]?.movementPath;
    if (!Array.isArray(path) || path.length < 2) return false;

    const token = await this._resolveSpeaker(npcUuid);
    if (!token?.document) return false;

    for (const point of path) {
      await token.document.update({
        x: Math.round(point.x),
        y: Math.round(point.y)
      }).catch(() => null);
      await new Promise((r) => setTimeout(r, 220));
    }
    return true;
  }

  async previewMessage(sceneId, index) {
    if (!game.user.isGM) return false;
    const scene = this.getAll().find((s) => s.id === sceneId);
    const msg = scene?.messages?.[index];
    if (!scene || !msg) return false;

    const lineDuration = this._getLineDuration(msg.text);
    const useRecordedPath = msg?.move?.type === "recorded-path" && this._hasRecordedPath(scene, msg.speaker);

    if (useRecordedPath) {
      const origin = scene?.npcs?.[msg.speaker]?.movementOrigin;
      const token = await this._resolveSpeaker(msg.speaker);
      if (token?.document && origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
        await token.document.update({
          x: Math.round(origin.x),
          y: Math.round(origin.y)
        }).catch(() => null);
      }
      await this._playRecordedPath(msg.speaker, scene, lineDuration);
    } else {
      await this._applyMovement(msg.speaker, msg.move);
    }

    await this._showBubble(msg.speaker, msg.text);
    this._emitBubble(msg.speaker, msg.text);
    return true;
  }

  async restoreSceneOrigins(sceneId) {
    if (!game.user.isGM) return false;
    const scene = this.getAll().find((s) => s.id === sceneId);
    if (!scene) return false;

    const positions = {};
    for (const [speakerUuid, npc] of Object.entries(scene.npcs ?? {})) {
      const token = await this._resolveSpeaker(speakerUuid);
      if (!token?.document) continue;
      const origin = npc?.movementOrigin;
      if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) continue;
      positions[speakerUuid] = {
        tokenId: token.document.id,
        x: origin.x,
        y: origin.y
      };
    }

    await this._restoreInitialPositions(positions);
    return true;
  }

  async _resolveSpeaker(uuid) {
    if (!uuid) return null;

    const doc = await fromUuid(uuid).catch(() => null);
    if (!doc) return null;

    // TokenDocument on active scene
    if (doc.object) return doc.object;

    // Actor fallback: pick first active token on current scene
    if (doc.documentName === "Actor") {
      const tokenDoc = canvas.tokens?.placeables
        ?.map((t) => t.document)
        ?.find((t) => t.actor?.id === doc.id);
      return tokenDoc?.object ?? null;
    }

    return null;
  }
}
