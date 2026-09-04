import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import { fulfillRequest } from './controllers/adminController.js';

const app = express();
app.use(bodyParser.json());
app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));

app.post("/admin/fulfill-request/:id", fulfillRequest);

const server = app.listen(3001, () => {
  console.log("Test server running on port 3001");
});
