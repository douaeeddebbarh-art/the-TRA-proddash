// =========================================================
// TRA Studio — API backend (Netlify Function + Netlify Blobs)
// Un seul endpoint qui stocke toute la base de données dans
// un blob JSON géré par Netlify. Aucune configuration requise :
// Netlify fournit automatiquement les identifiants de stockage
// aux fonctions qui tournent sur ses propres serveurs.
// =========================================================

import { getStore } from "@netlify/blobs";

const DEFAULT_DB = {
  clients: [],
  projects: [],
  deliverables: [],
  activity_log: [],
  messages: [],
  team_members: [],
};

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function uid() {
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function readDb(store) {
  const raw = await store.get("db", { type: "json" });
  const merged = cloneDefault();
  if (raw) {
    for (const key of Object.keys(merged)) {
      if (Array.isArray(raw[key])) merged[key] = raw[key];
    }
  }
  return merged;
}

async function writeDb(store, db) {
  await store.setJSON("db", db);
}

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: CORS_HEADERS });
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const store = getStore("tra-studio");

  if (req.method === "GET") {
    const db = await readDb(store);
    return json(db);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "Corps de requête JSON invalide." }, 400);
    }

    const action = body.action;
    const table = body.table;
    const id = body.id;
    const data = body.data;

    const db = await readDb(store);

    if (action === "reset") {
      const fresh = cloneDefault();
      await writeDb(store, fresh);
      return json({ ok: true, row: null, db: fresh });
    }

    if (action === "import") {
      const merged = cloneDefault();
      if (data && typeof data === "object") {
        for (const key of Object.keys(merged)) {
          if (Array.isArray(data[key])) merged[key] = data[key];
        }
      }
      await writeDb(store, merged);
      return json({ ok: true, row: null, db: merged });
    }

    if (!table || !Object.prototype.hasOwnProperty.call(db, table)) {
      return json({ error: "Table inconnue: " + table }, 400);
    }

    let row = null;

    if (action === "insert") {
      row = Object.assign({ id: uid(), created_at: new Date().toISOString() }, data || {});
      db[table] = db[table].concat([row]);
    } else if (action === "update") {
      db[table] = db[table].map((r) => (r.id === id ? Object.assign({}, r, data || {}) : r));
    } else if (action === "delete") {
      db[table] = db[table].filter((r) => r.id !== id);
    } else {
      return json({ error: "Action inconnue: " + action }, 400);
    }

    await writeDb(store, db);
    return json({ ok: true, row: row, db: db });
  }

  return json({ error: "Méthode non supportée." }, 405);
};

export const config = { path: "/api/data" };
