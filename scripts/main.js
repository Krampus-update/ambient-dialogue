const MODULE_ID = "ambient-dialogue";

function openAmbientDialogueApp() {
  const existing = Object.values(ui.windows).find((w) => w instanceof AmbientDialogueApp);
  if (existing) return existing.render(true);
  return new AmbientDialogueApp().render(true);
}

Hooks.once("init", () => {

  game.settings.register(MODULE_ID, "scenes", {
    scope: "world",
    config: false,
    type: Object,
    default: []
  });

});

Hooks.once("ready", () => {

  game.ambientDialogue = new AmbientDialogueManager();
  game.modules.get(MODULE_ID).api = AmbientDialogueAPI;
  game.socket.on(`module.${MODULE_ID}`, (data) => game.ambientDialogue.onSocketMessage(data));

});

Hooks.on("chatBubbleHTML", (_token, html, _message, options) => {
  const hasClass = Array.isArray(options?.cssClasses) && options.cssClasses.includes("ambient-dialogue-bubble");
  if (!hasClass) return;

  // Keep styling minimal to avoid fighting Foundry's own bubble sizing logic.
  html.style.color = "#222";
  html.style.background = "#f5f2ec";
  html.style.borderColor = "#6f6c66";

  const content = html.querySelector(".bubble-content");
  if (!content) return;
  content.style.color = "#222";
  content.style.textShadow = "none";
  content.style.whiteSpace = "normal";
  content.style.wordBreak = "normal";
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  // Foundry v13: controls is a record (e.g. controls.tokens)
  const tokenControls = controls?.tokens ?? controls?.token;
  if (tokenControls?.tools && !Array.isArray(tokenControls.tools)) {
    const existingOrders = Object.values(tokenControls.tools)
      .map((t) => Number(t?.order) || 0);
    const nextOrder = (existingOrders.length ? Math.max(...existingOrders) : 0) + 1;

    tokenControls.tools["ambient-dialogue-open"] = {
      name: "ambient-dialogue-open",
      title: "Ambient Dialogue",
      icon: "fa-solid fa-comments",
      button: true,
      order: nextOrder,
      onChange: (_event, active) => {
        if (active) openAmbientDialogueApp();
      }
    };
    return;
  }

  // Legacy fallback: controls as array
  const legacyTokenControls = Array.isArray(controls)
    ? controls.find((c) => c.name === "tokens" || c.name === "token")
    : null;
  if (!legacyTokenControls?.tools) return;

  const toolDef = {
    name: "ambient-dialogue-open",
    title: "Ambient Dialogue",
    icon: "fa-solid fa-comments",
    button: true,
    onClick: openAmbientDialogueApp
  };

  if (Array.isArray(legacyTokenControls.tools)) legacyTokenControls.tools.push(toolDef);
  else legacyTokenControls.tools["ambient-dialogue-open"] = toolDef;
});

Hooks.on("renderSettings", (_app, html) => {
  if (!game.user.isGM) return;
  if (html.find(".ambient-dialogue-open").length) return;

  const button = $(`
    <button type="button" class="ambient-dialogue-open">
      <i class="fas fa-comments"></i> Ambient Dialogue
    </button>
  `);

  button.on("click", openAmbientDialogueApp);

  const anchor = html.find("#settings-documentation");
  if (anchor.length) anchor.before(button);
  else html.find(".tab[data-tab='settings']").prepend(button);
});
