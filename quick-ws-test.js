const WebSocket = require("ws");
console.log("Testing WebSocket...");
const ws = new WebSocket("wss://qris-backend.onrender.com/ws?merchantId=MER001");
ws.on("open", () => {
    console.log("✅ CONNECTED");
    ws.send(JSON.stringify({ type: "PING" }));
    setTimeout(() => {
        if (ws.readyState === 1) {
            console.log("🎉 Connection stable after 5 seconds!");
            ws.close(1000, "Test passed");
            process.exit(0);
        }
    }, 5000);
});
ws.on("message", (data) => console.log("📨", data.toString()));
ws.on("error", (err) => console.error("❌", err.message));
ws.on("close", (code, reason) => console.log("🔌 Closed:", code, reason));
setTimeout(() => {
    console.log("⏰ Timeout - connection failed");
    process.exit(1);
}, 10000);
