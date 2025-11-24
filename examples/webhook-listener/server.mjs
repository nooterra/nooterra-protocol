import http from "http";
import crypto from "crypto";

const PORT = process.env.PORT || 4001;
const SECRET = process.env.WEBHOOK_SECRET || "";

function verifySignature(body, signature) {
  if (!SECRET || !signature) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(404);
    return res.end();
  }

  let data = "";
  req.on("data", (chunk) => (data += chunk));
  req.on("end", () => {
    const sig = req.headers["x-nooterra-signature"];
    const event = req.headers["x-nooterra-event"];
    const eventId = req.headers["x-nooterra-event-id"];

    if (!verifySignature(data, sig)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "invalid signature" }));
    }

    try {
      const json = JSON.parse(data);
      console.log("Webhook received:", { event, eventId, payload: json });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Webhook listener on ${PORT}, secret set=${!!SECRET}`);
});
