import { createServer } from "node:http";
import { handler } from "./server.js";

createServer(handler).listen(Number(process.env.PORT || 3000), () => {
  console.log("OrbitFS License Master listening");
});
