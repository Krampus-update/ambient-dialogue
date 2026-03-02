const AmbientDialogueAPI = {
  get scenes() {
    return game.ambientDialogue?.getAll?.() ?? [];
  },

  async playScene(sceneId) {
    return game.ambientDialogue?.play(sceneId);
  },

  stopScene() {
    return game.ambientDialogue?.stop();
  },

  async createScene(name) {
    return game.ambientDialogue?.createScene(name);
  },

  /**
   * Tile-friendly helper.
   * Accepts a direct id or a scene name.
   */
  async trigger(sceneRef) {
    const scenes = game.ambientDialogue?.getAll?.() ?? [];
    const scene =
      scenes.find((s) => s.id === sceneRef) ??
      scenes.find((s) => s.name === sceneRef);
    if (!scene) return ui.notifications?.warn(`Ambient Dialogue: cena não encontrada (${sceneRef})`);
    return game.ambientDialogue.play(scene.id);
  }
};
