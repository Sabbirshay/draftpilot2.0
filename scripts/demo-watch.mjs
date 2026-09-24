// Local-only, disposable simulator. Never deploy this test transport.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { startLocalApi, testBearer } from "../tests/helpers/local-api.cjs";
const api = await startLocalApi();
await fetch(api.url + "/knowledge", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + testBearer,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Example return policy",
    content:
      "Returns are eligible within 37 days when the item is unused. Request a return label in the account portal.",
  }),
});
const shim = `<script>
let listener;
window.chrome={runtime:{id:'draftpilot-simulator',onMessage:{addListener(fn){listener=fn}},async sendMessage(message){
 if(message.type==='DP_MODE')return {connected:true};
 if(message.type==='DP_CONNECT')return {error:'This simulator already uses a temporary example workspace. No real account is connected.'};
 if(message.type!=='DP_GENERATE')return {error:'Unsupported simulator request'};
 const response=await fetch('/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)});
 const result=await response.json();return response.ok?result:{error:result.message};
}}};
</script><script src="/content.js"></script><script>
const range=document.createRange();range.selectNodeContents(document.querySelector('[data-message-id="initial"] p'));getSelection().removeAllRanges();getSelection().addRange(range);
listener({type:'SHOW_PANEL'},{id:'draftpilot-simulator'},()=>{});
</script>`;
const html = (await readFile("tests/fixtures/live-inbox.html", "utf8")).replace(
  "</body>",
  shim + "</body>",
);
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" }).end(html);
      return;
    }
    if (req.url === "/content.js") {
      res
        .writeHead(200, { "Content-Type": "application/javascript" })
        .end(await readFile("packages/extension/dist/content.js"));
      return;
    }
    if (req.url === "/generate" && req.method === "POST") {
      if (req.headers.origin !== "http://127.0.0.1:3103") {
        res.writeHead(403).end();
        return;
      }
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 20000) throw Error("Too large");
      }
      const message = JSON.parse(text);
      const response = await fetch(api.url + "/drafts/generate", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + testBearer,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadContent: message.text,
          ...(message.tone ? { tone: message.tone } : {}),
          channel: "other",
          requestId: message.requestId,
        }),
      });
      res
        .writeHead(response.status, { "Content-Type": "application/json" })
        .end(await response.text());
      return;
    }
    res.writeHead(404).end();
  } catch {
    res
      .writeHead(500, { "Content-Type": "application/json" })
      .end(JSON.stringify({ message: "Simulator request failed." }));
  }
});
server.listen(3103, "127.0.0.1", () =>
  console.log(
    "Local inbox simulator: http://127.0.0.1:3103 — temporary example data only. Click Watch customer replies, then Add customer reply.",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.close();
    await api.close();
    process.exit(0);
  });
