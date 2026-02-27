export const buildWidgetScript = () => `
(function () {
  function createWidget(options) {
    var channelId = options.channelId;
    var apiBase = options.apiBase;
    var rootId = "ralph-widget-" + channelId;
    if (document.getElementById(rootId)) {
      return;
    }

    var style = document.createElement("style");
    style.textContent =
      "#" + rootId + "{position:fixed;bottom:24px;right:24px;font-family:'SF Pro Text',system-ui,sans-serif;z-index:2147483647;}" +
      "#" + rootId + " .rw-button{background:#0f3d2e;color:#fff;border:none;border-radius:999px;padding:12px 18px;box-shadow:0 10px 30px rgba(15,61,46,0.3);cursor:pointer;font-weight:600;}" +
      "#" + rootId + " .rw-panel{width:320px;max-height:420px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(17,24,39,0.2);overflow:hidden;display:none;flex-direction:column;}" +
      "#" + rootId + " .rw-header{background:#0f3d2e;color:#fff;padding:12px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center;}" +
      "#" + rootId + " .rw-body{padding:12px 16px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:10px;background:#f6f7f9;}" +
      "#" + rootId + " .rw-message{padding:10px 12px;border-radius:12px;max-width:85%;font-size:14px;line-height:1.4;}" +
      "#" + rootId + " .rw-user{background:#0f3d2e;color:#fff;align-self:flex-end;}" +
      "#" + rootId + " .rw-assistant{background:#fff;color:#111827;align-self:flex-start;border:1px solid #e5e7eb;}" +
      "#" + rootId + " .rw-input{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;}" +
      "#" + rootId + " .rw-input input{flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;font-size:14px;}" +
      "#" + rootId + " .rw-input button{background:#0f3d2e;color:#fff;border:none;border-radius:10px;padding:8px 12px;font-weight:600;cursor:pointer;}";
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
    header.innerHTML = "<span>Ralph Support</span>";
    var close = document.createElement("button");
    close.textContent = "x";
    close.style.background = "transparent";
    close.style.border = "none";
    close.style.color = "#fff";
    close.style.fontSize = "18px";
    close.style.cursor = "pointer";
    header.appendChild(close);
    var body = document.createElement("div");
    body.className = "rw-body";
    var inputWrap = document.createElement("div");
    inputWrap.className = "rw-input";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask about returns, shipping, pricing...";
    var send = document.createElement("button");
    send.textContent = "Send";
    inputWrap.appendChild(input);
    inputWrap.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(inputWrap);
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
      var assistantBubble = addMessage("...", "assistant");

      streamChat(
        message,
        function (token) {
          assistantBubble.textContent =
          assistantBubble.textContent === "..."
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
    <title>Ralph Support</title>
    <style>
      body { margin: 0; font-family: "SF Pro Text", system-ui, sans-serif; background: #f6f7f9; color: #0f172a; }
      .hero { padding: 32px 40px; background: linear-gradient(120deg, #0f3d2e, #1f6f5c); color: #fff; }
      .hero h1 { margin: 0 0 8px; font-size: 28px; }
      .hero p { margin: 0; max-width: 560px; opacity: 0.9; }
      .chat-shell { max-width: 780px; margin: -32px auto 48px; background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2); overflow: hidden; }
      .chat-body { padding: 24px; min-height: 320px; display: flex; flex-direction: column; gap: 12px; background: #f8fafc; }
      .chat-message { padding: 12px 14px; border-radius: 14px; font-size: 15px; line-height: 1.4; max-width: 80%; }
      .chat-user { background: #0f3d2e; color: #fff; align-self: flex-end; }
      .chat-assistant { background: #fff; color: #0f172a; border: 1px solid #e2e8f0; align-self: flex-start; }
      .chat-input { display: flex; gap: 12px; padding: 16px 24px; border-top: 1px solid #e2e8f0; }
      .chat-input input { flex: 1; padding: 10px 12px; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 15px; }
      .chat-input button { background: #0f3d2e; color: #fff; border: none; border-radius: 12px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>How can we help?</h1>
      <p>Ask about shipping, billing, or policies. The AI assistant will pull answers from your knowledge base.</p>
    </section>
    <section class="chat-shell" data-channel="${channelId}">
      <div class="chat-body" id="chat-body"></div>
      <div class="chat-input">
        <input id="chat-input" type="text" placeholder="Ask your question..." />
        <button id="chat-send" type="button">Send</button>
      </div>
    </section>
    <script>
      (function () {
        var channelId = "${channelId}";
        var apiBase = window.location.origin;
        var body = document.getElementById("chat-body");
        var input = document.getElementById("chat-input");
        var send = document.getElementById("chat-send");

        function addMessage(text, role) {
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
          var assistantBubble = addMessage("...", "assistant");

          streamChat(
            message,
            function (token) {
              assistantBubble.textContent =
                assistantBubble.textContent === "..."
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
