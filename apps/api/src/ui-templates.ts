export const buildWidgetScript = () => `
(function () {
  function createWidget(options) {
    var channelId = options.channelId;
    var apiBase = options.apiBase;
    var rootId = "ralph-widget-" + channelId;
    if (document.getElementById(rootId)) {
      return;
    }

    // Use a system font stack only. The widget runs inside third-party pages
    // whose Content-Security-Policy may forbid loading external stylesheets
    // (e.g. fonts.googleapis.com). Injecting a <link> there generates CSP
    // violations and console noise for customers, so we rely on native fonts.

    var style = document.createElement("style");
    style.textContent =
      "#" + rootId + "{" +
        "--rw-paper:oklch(98.4% 0.004 95);" +
        "--rw-raised:oklch(100% 0 0);" +
        "--rw-sunken:oklch(96.2% 0.005 95);" +
        "--rw-ink:oklch(22% 0.012 150);" +
        "--rw-ink-2:oklch(42% 0.010 150);" +
        "--rw-ink-3:oklch(58% 0.008 150);" +
        "--rw-ink-inv:oklch(96% 0.004 150);" +
        "--rw-accent:oklch(38% 0.06 150);" +
        "--rw-accent-hi:oklch(52% 0.09 150);" +
        "--rw-accent-wash:oklch(96% 0.018 150);" +
        "--rw-hair:oklch(90% 0.006 95);" +
        "--rw-inverse:oklch(22% 0.012 150);" +
        "position:fixed;bottom:24px;right:24px;z-index:2147483647;" +
        "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;" +
        "color:var(--rw-ink);" +
      "}" +
      "#" + rootId + " *{box-sizing:border-box;}" +
      "#" + rootId + " .rw-button{" +
        "display:inline-flex;align-items:center;gap:10px;" +
        "background:var(--rw-inverse);color:var(--rw-ink-inv);" +
        "border:1px solid var(--rw-inverse);" +
        "border-radius:2px;padding:10px 16px;" +
        "font-family:inherit;font-size:13px;font-weight:500;letter-spacing:0.01em;" +
        "cursor:pointer;transition:background-color 180ms cubic-bezier(.2,0,0,1);" +
      "}" +
      "#" + rootId + " .rw-button:hover{background:oklch(28% 0.02 150);}" +
      "#" + rootId + " .rw-button::before{" +
        "content:'';width:6px;height:6px;border-radius:50%;" +
        "background:oklch(72% 0.14 150);" +
      "}" +
      "#" + rootId + " .rw-panel{" +
        "width:360px;max-height:520px;" +
        "background:var(--rw-paper);" +
        "border:1px solid var(--rw-hair);" +
        "border-radius:4px;" +
        "overflow:hidden;display:none;flex-direction:column;" +
      "}" +
      "#" + rootId + " .rw-header{" +
        "background:var(--rw-raised);" +
        "border-bottom:1px solid var(--rw-hair);" +
        "padding:14px 18px;" +
        "display:flex;justify-content:space-between;align-items:flex-start;gap:12px;" +
      "}" +
      "#" + rootId + " .rw-header-eyebrow{" +
        "font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;" +
        "color:var(--rw-ink-3);display:inline-flex;align-items:center;gap:8px;margin-bottom:4px;" +
      "}" +
      "#" + rootId + " .rw-header-eyebrow::before{" +
        "content:'';width:12px;height:1px;background:var(--rw-accent);" +
      "}" +
      "#" + rootId + " .rw-header-title{" +
        "font-family:ui-serif,'Iowan Old Style',Palatino,Georgia,serif;" +
        "font-size:17px;font-weight:500;letter-spacing:-0.01em;color:var(--rw-ink);line-height:1.2;" +
      "}" +
      "#" + rootId + " .rw-header-title em{font-style:italic;color:var(--rw-accent);}" +
      "#" + rootId + " .rw-close{" +
        "background:transparent;border:none;color:var(--rw-ink-3);" +
        "font-family:inherit;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;" +
        "border-radius:2px;transition:color 120ms,background-color 120ms;" +
      "}" +
      "#" + rootId + " .rw-close:hover{color:var(--rw-ink);background:var(--rw-sunken);}" +
      "#" + rootId + " .rw-body{" +
        "padding:16px 18px;overflow:auto;flex:1;" +
        "display:flex;flex-direction:column;gap:10px;" +
        "background:var(--rw-paper);" +
      "}" +
      "#" + rootId + " .rw-empty{" +
        "font-size:13px;color:var(--rw-ink-3);line-height:1.5;" +
        "padding:4px 0;" +
      "}" +
      "#" + rootId + " .rw-empty em{" +
        "font-family:ui-serif,Georgia,serif;font-style:italic;color:var(--rw-accent);" +
      "}" +
      "#" + rootId + " .rw-message{" +
        "padding:10px 12px;border-radius:4px;max-width:85%;" +
        "font-size:14px;line-height:1.45;" +
      "}" +
      "#" + rootId + " .rw-user{" +
        "background:var(--rw-inverse);color:var(--rw-ink-inv);" +
        "align-self:flex-end;border:1px solid var(--rw-inverse);" +
      "}" +
      "#" + rootId + " .rw-assistant{" +
        "background:var(--rw-raised);color:var(--rw-ink);" +
        "align-self:flex-start;border:1px solid var(--rw-hair);" +
      "}" +
      "#" + rootId + " .rw-input{" +
        "display:flex;gap:8px;padding:12px 18px 14px;" +
        "border-top:1px solid var(--rw-hair);background:var(--rw-raised);" +
      "}" +
      "#" + rootId + " .rw-input input{" +
        "flex:1;border:1px solid var(--rw-hair);border-radius:4px;" +
        "padding:9px 12px;font-size:14px;font-family:inherit;font-weight:400;" +
        "color:var(--rw-ink);background:var(--rw-paper);" +
        "transition:border-color 120ms,box-shadow 120ms;" +
      "}" +
      "#" + rootId + " .rw-input input::placeholder{color:oklch(72% 0.006 150);}" +
      "#" + rootId + " .rw-input input:focus{" +
        "outline:none;border-color:var(--rw-accent-hi);" +
        "box-shadow:0 0 0 3px var(--rw-accent-wash);" +
      "}" +
      "#" + rootId + " .rw-input button{" +
        "background:var(--rw-inverse);color:var(--rw-ink-inv);" +
        "border:1px solid var(--rw-inverse);border-radius:4px;" +
        "padding:9px 14px;font-size:13px;font-weight:500;letter-spacing:0.01em;" +
        "font-family:inherit;cursor:pointer;" +
        "transition:background-color 180ms cubic-bezier(.2,0,0,1);" +
      "}" +
      "#" + rootId + " .rw-input button:hover{background:oklch(28% 0.02 150);}" +
      "#" + rootId + " .rw-footnote{" +
        "padding:0 18px 10px;font-size:10px;" +
        "color:var(--rw-ink-3);text-transform:uppercase;letter-spacing:0.08em;font-weight:600;" +
        "background:var(--rw-raised);display:flex;align-items:center;gap:6px;" +
      "}" +
      "#" + rootId + " .rw-footnote::before{" +
        "content:'';width:10px;height:1px;background:var(--rw-ink-3);" +
      "}";
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = rootId;

    var button = document.createElement("button");
    button.className = "rw-button";
    button.textContent = "Chat with support";

    var panel = document.createElement("div");
    panel.className = "rw-panel";

    var header = document.createElement("div");
    header.className = "rw-header";
    var headerInner = document.createElement("div");
    var eyebrow = document.createElement("div");
    eyebrow.className = "rw-header-eyebrow";
    eyebrow.textContent = "Support";
    var title = document.createElement("div");
    title.className = "rw-header-title";
    title.innerHTML = "How can we <em>help</em>?";
    headerInner.appendChild(eyebrow);
    headerInner.appendChild(title);
    var close = document.createElement("button");
    close.className = "rw-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "\u00d7";
    header.appendChild(headerInner);
    header.appendChild(close);

    var body = document.createElement("div");
    body.className = "rw-body";
    var empty = document.createElement("div");
    empty.className = "rw-empty";
    empty.innerHTML = "Ask about shipping, billing, or anything else. <em>We read the docs so you don\u2019t have to.</em>";
    body.appendChild(empty);

    var inputWrap = document.createElement("div");
    inputWrap.className = "rw-input";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask about returns, shipping, pricing\u2026";
    var send = document.createElement("button");
    send.textContent = "Send";
    inputWrap.appendChild(input);
    inputWrap.appendChild(send);

    var footnote = document.createElement("div");
    footnote.className = "rw-footnote";
    footnote.textContent = "Answers from your knowledge base";

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(inputWrap);
    panel.appendChild(footnote);
    root.appendChild(button);
    root.appendChild(panel);
    document.body.appendChild(root);

    function toggle(open) {
      panel.style.display = open ? "flex" : "none";
      button.style.display = open ? "none" : "inline-flex";
    }

    button.addEventListener("click", function () {
      toggle(true);
      input.focus();
    });
    close.addEventListener("click", function () {
      toggle(false);
    });

    function addMessage(text, role) {
      if (empty.parentNode === body) {
        body.removeChild(empty);
      }
      var item = document.createElement("div");
      item.className = "rw-message " + (role === "user" ? "rw-user" : "rw-assistant");
      item.textContent = text;
      body.appendChild(item);
      body.scrollTop = body.scrollHeight;
      return item;
    }

    function streamChat(message, onToken, onDone, onError) {
      fetch(apiBase + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelId, message: message, stream: true })
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("chat_failed");
          }
          if (!response.body) {
            return response.json().then(function (data) {
              onDone(data.message || "");
            });
          }
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = "";

          function read() {
            return reader.read().then(function (result) {
              if (result.done) {
                onDone();
                return;
              }
              buffer += decoder.decode(result.value, { stream: true });
              var parts = buffer.split("\\n\\n");
              buffer = parts.pop() || "";
              parts.forEach(function (part) {
                part.split("\\n").forEach(function (line) {
                  if (!line.startsWith("data:")) {
                    return;
                  }
                  var payload = line.replace("data: ", "");
                  try {
                    var parsed = JSON.parse(payload);
                    if (parsed.token) {
                      onToken(parsed.token);
                    }
                    if (parsed.done && parsed.response && parsed.response.message) {
                      onDone(parsed.response.message);
                    }
                  } catch (error) {
                    onError(error);
                  }
                });
              });
              return read();
            });
          }

          return read();
        })
        .catch(function (error) {
          onError(error);
        });
    }

    function sendMessage() {
      var message = input.value.trim();
      if (!message) {
        return;
      }
      input.value = "";
      addMessage(message, "user");
      var assistantBubble = addMessage("\u2026", "assistant");

      streamChat(
        message,
        function (token) {
          assistantBubble.textContent =
          assistantBubble.textContent === "\u2026"
              ? token
              : assistantBubble.textContent + " " + token;
          body.scrollTop = body.scrollHeight;
        },
        function (finalMessage) {
          if (finalMessage) {
            assistantBubble.textContent = finalMessage;
          }
        },
        function () {
          assistantBubble.textContent =
            "We hit a snag. Please try again or reach the team directly.";
        }
      );
    }

    send.addEventListener("click", sendMessage);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        sendMessage();
      }
    });
  }

  var script = document.currentScript || document.querySelector("script[data-channel]");
  if (!script) {
    return;
  }
  var channelId = script.getAttribute("data-channel");
  if (!channelId) {
    return;
  }
  var apiBase = script.getAttribute("data-api-base");
  if (!apiBase) {
    try {
      apiBase = new URL(script.src).origin;
    } catch (error) {
      apiBase = "";
    }
  }
  if (!apiBase) {
    return;
  }
  createWidget({ channelId: channelId, apiBase: apiBase });
})();
`;

export const buildHelpPage = (channelId: string) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Support — how can we help?</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400;0,500;0,600;1,400&family=Host+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
    />
    <style>
      :root {
        --paper: oklch(98.4% 0.004 95);
        --raised: oklch(100% 0 0);
        --sunken: oklch(96.2% 0.005 95);
        --inverse: oklch(22% 0.012 150);
        --ink: oklch(22% 0.012 150);
        --ink-2: oklch(42% 0.010 150);
        --ink-3: oklch(58% 0.008 150);
        --ink-4: oklch(72% 0.006 150);
        --ink-inv: oklch(96% 0.004 150);
        --accent: oklch(38% 0.06 150);
        --accent-hi: oklch(52% 0.09 150);
        --accent-wash: oklch(96% 0.018 150);
        --hair: oklch(90% 0.006 95);
        --hair-strong: oklch(80% 0.008 95);
        --font-display: "STIX Two Text", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        --font-body: "Host Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      }

      *, *::before, *::after { box-sizing: border-box; }

      html {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }

      body {
        margin: 0;
        font-family: var(--font-body);
        font-size: 15px;
        line-height: 1.5;
        color: var(--ink);
        background: var(--paper);
      }

      .shell {
        max-width: 1040px;
        margin: 0 auto;
        padding: 48px 32px 96px;
        display: flex;
        flex-direction: column;
        gap: 48px;
      }

      /* ---------- Masthead ---------- */
      .masthead {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--hair);
        font-size: 12px;
        color: var(--ink-3);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      .masthead-brand {
        font-family: var(--font-display);
        font-size: 17px;
        font-weight: 500;
        letter-spacing: -0.01em;
        text-transform: none;
        color: var(--ink);
      }

      .masthead-brand em {
        font-style: italic;
        color: var(--accent);
      }

      .masthead-meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .masthead-meta::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent-hi);
        box-shadow: 0 0 0 3px var(--accent-wash);
      }

      /* ---------- Hero ---------- */
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        gap: 56px;
        align-items: end;
        padding-bottom: 40px;
        border-bottom: 1px solid var(--hair);
      }

      .eyebrow {
        font-family: var(--font-body);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        font-weight: 600;
        color: var(--ink-3);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
      }

      .eyebrow::before {
        content: "";
        width: 16px;
        height: 1px;
        background: var(--accent);
      }

      .hero h1 {
        margin: 0 0 16px;
        font-family: var(--font-display);
        font-size: clamp(2.25rem, 1.4rem + 3vw, 3.5rem);
        font-weight: 500;
        line-height: 1.08;
        letter-spacing: -0.02em;
        color: var(--ink);
        max-width: 14ch;
      }

      .hero h1 em {
        font-style: italic;
        color: var(--accent);
      }

      .hero-lead {
        margin: 0;
        font-size: 17px;
        line-height: 1.6;
        color: var(--ink-2);
        max-width: 52ch;
      }

      .hero-aside {
        border-left: 1px solid var(--hair);
        padding-left: 32px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .hero-aside-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .hero-aside-label {
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--ink-3);
      }

      .hero-aside-value {
        font-size: 14px;
        color: var(--ink);
        line-height: 1.4;
      }

      .hero-aside-value code {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--ink-2);
      }

      /* ---------- Chat ---------- */
      .chat-wrap {
        display: grid;
        grid-template-columns: 200px minmax(0, 1fr);
        gap: 48px;
      }

      .chat-rubric {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 4px;
      }

      .chat-rubric-label {
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--ink-3);
      }

      .chat-rubric h2 {
        margin: 0;
        font-family: var(--font-display);
        font-size: 22px;
        font-weight: 500;
        letter-spacing: -0.01em;
        line-height: 1.2;
        color: var(--ink);
      }

      .chat-rubric h2 em {
        font-style: italic;
        color: var(--accent);
      }

      .chat-rubric p {
        margin: 0;
        font-size: 13px;
        color: var(--ink-2);
        line-height: 1.55;
      }

      .chat-shell {
        background: var(--raised);
        border: 1px solid var(--hair);
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 420px;
      }

      .chat-head {
        padding: 14px 20px;
        border-bottom: 1px solid var(--hair);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
        color: var(--ink-3);
      }

      .chat-head-left {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .chat-head-left::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent-hi);
        box-shadow: 0 0 0 3px var(--accent-wash);
      }

      .chat-head-right {
        font-family: var(--font-mono);
        font-size: 11px;
        text-transform: none;
        letter-spacing: 0.02em;
        color: var(--ink-3);
        font-weight: 500;
      }

      .chat-body {
        padding: 24px;
        min-height: 280px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--paper);
        flex: 1;
      }

      .chat-empty {
        font-size: 14px;
        color: var(--ink-3);
        line-height: 1.55;
        max-width: 46ch;
      }

      .chat-empty em {
        font-family: var(--font-display);
        font-style: italic;
        color: var(--accent);
      }

      .chat-message {
        padding: 10px 14px;
        border-radius: 4px;
        font-size: 15px;
        line-height: 1.5;
        max-width: 80%;
      }

      .chat-user {
        background: var(--inverse);
        color: var(--ink-inv);
        border: 1px solid var(--inverse);
        align-self: flex-end;
      }

      .chat-assistant {
        background: var(--raised);
        color: var(--ink);
        border: 1px solid var(--hair);
        align-self: flex-start;
      }

      .chat-input {
        display: flex;
        gap: 8px;
        padding: 14px 20px;
        border-top: 1px solid var(--hair);
        background: var(--raised);
      }

      .chat-input input {
        flex: 1;
        padding: 10px 12px;
        border-radius: 4px;
        border: 1px solid var(--hair);
        font-size: 15px;
        font-family: var(--font-body);
        color: var(--ink);
        background: var(--paper);
        transition: border-color 120ms cubic-bezier(.2,0,0,1), box-shadow 120ms cubic-bezier(.2,0,0,1);
      }

      .chat-input input::placeholder {
        color: var(--ink-4);
      }

      .chat-input input:focus {
        outline: none;
        border-color: var(--accent-hi);
        box-shadow: 0 0 0 3px var(--accent-wash);
      }

      .chat-input button {
        background: var(--inverse);
        color: var(--ink-inv);
        border: 1px solid var(--inverse);
        border-radius: 4px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0.01em;
        font-family: var(--font-body);
        cursor: pointer;
        transition: background-color 180ms cubic-bezier(.2,0,0,1);
      }

      .chat-input button:hover {
        background: oklch(28% 0.02 150);
      }

      /* ---------- Answer shelf ---------- */
      .shelf {
        display: grid;
        grid-template-columns: 200px minmax(0, 1fr);
        gap: 48px;
        padding-top: 32px;
        border-top: 1px solid var(--hair);
      }

      .shelf-head h2 {
        margin: 0;
        font-family: var(--font-display);
        font-size: 22px;
        font-weight: 500;
        letter-spacing: -0.01em;
        line-height: 1.2;
        color: var(--ink);
      }

      .shelf-head p {
        margin: 8px 0 0;
        font-size: 13px;
        color: var(--ink-2);
        line-height: 1.55;
      }

      .shelf-list {
        display: flex;
        flex-direction: column;
        gap: 0;
        border-top: 1px solid var(--hair);
      }

      .shelf-item {
        display: grid;
        grid-template-columns: 56px 1fr auto;
        gap: 20px;
        align-items: baseline;
        padding: 16px 0;
        border-bottom: 1px solid var(--hair);
      }

      .shelf-index {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--ink-3);
        letter-spacing: 0.04em;
      }

      .shelf-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--ink);
      }

      .shelf-title-meta {
        display: block;
        margin-top: 4px;
        font-size: 13px;
        font-weight: 400;
        color: var(--ink-2);
        line-height: 1.5;
      }

      .shelf-meta {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--ink-3);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      /* ---------- Colophon ---------- */
      .colophon {
        padding-top: 24px;
        border-top: 1px solid var(--hair);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: var(--ink-3);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      .colophon code {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--ink-2);
        text-transform: none;
        letter-spacing: 0.02em;
        font-weight: 500;
      }

      @media (max-width: 900px) {
        .shell { padding: 32px 20px 64px; gap: 32px; }
        .hero { grid-template-columns: 1fr; gap: 32px; padding-bottom: 32px; }
        .hero-aside { border-left: none; padding-left: 0; border-top: 1px solid var(--hair); padding-top: 24px; }
        .chat-wrap, .shelf { grid-template-columns: 1fr; gap: 20px; }
        .masthead, .colophon { flex-direction: column; align-items: flex-start; gap: 8px; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="masthead">
        <span class="masthead-brand">Ralph <em>Support</em></span>
        <span class="masthead-meta">Online · avg reply under a minute</span>
      </header>

      <section class="hero">
        <div>
          <span class="eyebrow">Help center</span>
          <h1>How can we <em>help</em>?</h1>
          <p class="hero-lead">
            Ask about shipping, billing, returns, or policy. The assistant reads
            straight from your knowledge base and links to the source so you can verify.
          </p>
        </div>
        <aside class="hero-aside">
          <div class="hero-aside-item">
            <span class="hero-aside-label">Channel</span>
            <span class="hero-aside-value"><code>${channelId}</code></span>
          </div>
          <div class="hero-aside-item">
            <span class="hero-aside-label">Languages</span>
            <span class="hero-aside-value">Norsk · English</span>
          </div>
          <div class="hero-aside-item">
            <span class="hero-aside-label">Data residency</span>
            <span class="hero-aside-value">EU (Frankfurt) · GDPR</span>
          </div>
        </aside>
      </section>

      <section class="chat-wrap" data-channel="${channelId}">
        <div class="chat-rubric">
          <span class="chat-rubric-label">Ask the assistant</span>
          <h2>Written answers, <em>sourced</em>.</h2>
          <p>Press enter to send. Follow-ups keep context for the whole conversation.</p>
        </div>
        <div class="chat-shell">
          <div class="chat-head">
            <span class="chat-head-left">Live</span>
            <span class="chat-head-right">SSE · streaming</span>
          </div>
          <div class="chat-body" id="chat-body">
            <div class="chat-empty">
              Start with a plain question. <em>We read the docs so you don&rsquo;t have to.</em>
            </div>
          </div>
          <div class="chat-input">
            <input id="chat-input" type="text" placeholder="Ask your question&hellip;" />
            <button id="chat-send" type="button">Send</button>
          </div>
        </div>
      </section>

      <section class="shelf">
        <div class="shelf-head">
          <h2>Common <em>ground</em>.</h2>
          <p>If the assistant hesitates, these are usually what people want next.</p>
        </div>
        <div class="shelf-list">
          <div class="shelf-item">
            <span class="shelf-index">01</span>
            <span class="shelf-title">Where is my order?
              <span class="shelf-title-meta">Tracking link, carrier, and expected delivery window.</span>
            </span>
            <span class="shelf-meta">Shipping</span>
          </div>
          <div class="shelf-item">
            <span class="shelf-index">02</span>
            <span class="shelf-title">How do I return an item?
              <span class="shelf-title-meta">Thirty-day window with prepaid label, conditions apply.</span>
            </span>
            <span class="shelf-meta">Returns</span>
          </div>
          <div class="shelf-item">
            <span class="shelf-index">03</span>
            <span class="shelf-title">Can I change my subscription?
              <span class="shelf-title-meta">Upgrade, pause, or cancel from the account page at any time.</span>
            </span>
            <span class="shelf-meta">Billing</span>
          </div>
          <div class="shelf-item">
            <span class="shelf-index">04</span>
            <span class="shelf-title">Talk to a human
              <span class="shelf-title-meta">Escalate to the on-call team during business hours in CET.</span>
            </span>
            <span class="shelf-meta">Escalation</span>
          </div>
        </div>
      </section>

      <footer class="colophon">
        <span>Powered by Ralph</span>
        <code>channel · ${channelId}</code>
      </footer>
    </div>

    <script>
      (function () {
        var channelId = "${channelId}";
        var apiBase = window.location.origin;
        var body = document.getElementById("chat-body");
        var input = document.getElementById("chat-input");
        var send = document.getElementById("chat-send");
        var empty = body.querySelector(".chat-empty");

        function addMessage(text, role) {
          if (empty && empty.parentNode === body) {
            body.removeChild(empty);
            empty = null;
          }
          var item = document.createElement("div");
          item.className = "chat-message " + (role === "user" ? "chat-user" : "chat-assistant");
          item.textContent = text;
          body.appendChild(item);
          body.scrollTop = body.scrollHeight;
          return item;
        }

        function streamChat(message, onToken, onDone, onError) {
          fetch(apiBase + "/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId: channelId, message: message, stream: true })
          })
            .then(function (response) {
              if (!response.ok) {
                throw new Error("chat_failed");
              }
              if (!response.body) {
                return response.json().then(function (data) {
                  onDone(data.message || "");
                });
              }
              var reader = response.body.getReader();
              var decoder = new TextDecoder();
              var buffer = "";

              function read() {
                return reader.read().then(function (result) {
                  if (result.done) {
                    onDone();
                    return;
                  }
                  buffer += decoder.decode(result.value, { stream: true });
                  var parts = buffer.split("\\n\\n");
                  buffer = parts.pop() || "";
                  parts.forEach(function (part) {
                    part.split("\\n").forEach(function (line) {
                      if (!line.startsWith("data:")) {
                        return;
                      }
                      var payload = line.replace("data: ", "");
                      try {
                        var parsed = JSON.parse(payload);
                        if (parsed.token) {
                          onToken(parsed.token);
                        }
                        if (parsed.done && parsed.response && parsed.response.message) {
                          onDone(parsed.response.message);
                        }
                      } catch (error) {
                        onError(error);
                      }
                    });
                  });
                  return read();
                });
              }

              return read();
            })
            .catch(function (error) {
              onError(error);
            });
        }

        function sendMessage() {
          var message = input.value.trim();
          if (!message) {
            return;
          }
          input.value = "";
          addMessage(message, "user");
          var assistantBubble = addMessage("\u2026", "assistant");

          streamChat(
            message,
            function (token) {
              assistantBubble.textContent =
                assistantBubble.textContent === "\u2026"
                  ? token
                  : assistantBubble.textContent + " " + token;
              body.scrollTop = body.scrollHeight;
            },
            function (finalMessage) {
              if (finalMessage) {
                assistantBubble.textContent = finalMessage;
              }
            },
            function () {
              assistantBubble.textContent =
                "We hit a snag. Please try again or reach the team directly.";
            }
          );
        }

        send.addEventListener("click", sendMessage);
        input.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            sendMessage();
          }
        });
      })();
    </script>
  </body>
</html>
`;
