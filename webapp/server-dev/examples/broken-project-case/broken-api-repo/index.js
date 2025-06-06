import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';

const app = new Hono();

app.use(cors());

app.get('/ping', (c) => {
  return c.json({ pong: true });
});

app.get('/', (c) => {
  return c.json({ success: true, uuid: uuidv4() });
});

export default app;